// Builds safe, structured provider-test failures without exposing upstream response text.
import {
  apiErrorResponseSchema,
  type ApiErrorCategory,
  type ApiErrorResponse,
} from "@uml-platform/contracts";
import { ProviderHttpError } from "../llm.js";

export type ProviderTestFailureKind =
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "connection";

export function providerTestError(input: {
  category?: ApiErrorCategory;
  code: string;
  details?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | null>;
  retryable?: boolean;
}): ApiErrorResponse {
  return apiErrorResponseSchema.parse({
    error: {
      code: input.code,
      category: input.category ?? "provider",
      retryable: input.retryable ?? false,
      params: input.params,
      details: input.details,
    },
  });
}

export function classifyProviderTestFailure(error: unknown): {
  code: string;
  failureKind: ProviderTestFailureKind;
  httpStatus: number;
  retryable: boolean;
  upstreamStatus: number | null;
} {
  const upstreamStatus = error instanceof ProviderHttpError ? error.status : null;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const detail = error instanceof ProviderHttpError
    ? error.detail?.toLowerCase() ?? ""
    : "";
  if (
    upstreamStatus === 400 &&
    detail.includes("provider request redirected")
  ) {
    return {
      code: "PROVIDER_BASE_URL_NOT_ALLOWED",
      failureKind: "connection",
      httpStatus: 400,
      retryable: false,
      upstreamStatus,
    };
  }
  if (upstreamStatus === 401) {
    return {
      code: "PROVIDER_SECRET_INVALID",
      failureKind: "authentication",
      httpStatus: 400,
      retryable: false,
      upstreamStatus,
    };
  }
  if (upstreamStatus === 403) {
    return {
      code: "PROVIDER_AUTH_FAILED",
      failureKind: "authentication",
      httpStatus: 400,
      retryable: false,
      upstreamStatus,
    };
  }
  if (upstreamStatus === 429) {
    return {
      code: "PROVIDER_RATE_LIMITED",
      failureKind: "rate_limit",
      httpStatus: 429,
      retryable: true,
      upstreamStatus,
    };
  }
  if (
    upstreamStatus === 408 ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort")
  ) {
    return {
      code: "PROVIDER_TIMEOUT",
      failureKind: "timeout",
      httpStatus: 502,
      retryable: true,
      upstreamStatus,
    };
  }
  return {
    code: "PROVIDER_CONNECTION_FAILED",
    failureKind: "connection",
    httpStatus: 502,
    retryable: true,
    upstreamStatus,
  };
}

export function safeProviderHost(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "invalid-provider-host";
  }
}
