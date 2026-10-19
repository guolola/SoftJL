// Constructs the current public HTTP error contract directly at route and guard boundaries.
import type { FastifyReply } from "fastify";
import { apiErrorResponseSchema, type ApiErrorCategory } from "@uml-platform/contracts";

function categoryForStatus(status: number): ApiErrorCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404) return "not_found";
  if (status === 409 || status === 422) return "conflict";
  if (status === 429) return "rate_limit";
  return status >= 500 ? "internal" : "validation";
}

function codeForStatus(status: number) {
  return ({
    400: "VALIDATION_FAILED", 401: "AUTHENTICATION_REQUIRED", 403: "ACCESS_DENIED",
    404: "RESOURCE_NOT_FOUND", 409: "RESOURCE_CONFLICT", 422: "REQUEST_UNPROCESSABLE",
    429: "RATE_LIMITED", 503: "SERVICE_UNAVAILABLE",
  } as Record<number, string>)[status] ?? "INTERNAL_ERROR";
}

export function httpErrorResponse(status: number, requestId?: string, details?: Record<string, unknown>) {
  if (!Number.isInteger(status) || status < 400 || status > 599) throw new RangeError("HTTP errors require a 4xx or 5xx status");
  return apiErrorResponseSchema.parse({
    error: { code: codeForStatus(status), category: categoryForStatus(status), retryable: status === 429 || status >= 500, details },
    requestId,
  });
}

export function createHttpErrorResponse(reply: FastifyReply, details?: Record<string, unknown>) {
  return httpErrorResponse(reply.statusCode, reply.request.id, details);
}
