// Converts structured API and run errors into safe, actionable generation feedback.
import type { ApiError, RunError } from "@uml-platform/contracts";
import { ApiClientError } from "../../../services/api-client/index";
import { i18n } from "../../../shared/i18n/i18n";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";

export type FailureActionTarget =
  | "pending-rules"
  | "system-requirements"
  | "requirement-models"
  | "design-models"
  | "feasibility"
  | "provider-settings"
  | "task-details";

export interface OperationFailurePresentation {
  actionTarget?: FailureActionTarget;
  code: string;
  details?: Record<string, unknown>;
  message: string;
  params?: Record<string, string | number | boolean | null>;
  requestId?: string;
  retryable: boolean;
  title: string;
}

export class PresentedOperationError extends Error {
  readonly presentation: OperationFailurePresentation;

  constructor(presentation: OperationFailurePresentation) {
    super(presentation.message);
    this.name = "PresentedOperationError";
    this.presentation = presentation;
  }
}

const REQUIREMENT_MODEL_CODES = new Set([
  "REQUIREMENT_MODELS_MISSING",
  "REQUIREMENT_MODELS_STALE",
  "MODEL_STRUCTURE_INVALID",
  "REQUIREMENT_TRACEABILITY_MISSING",
  "REQUIREMENT_PLANTUML_MISSING",
]);
const DESIGN_MODEL_CODES = new Set([
  "DESIGN_MODELS_MISSING",
  "DESIGN_MODELS_INVALID",
]);
const FEASIBILITY_CODES = new Set([
  "FEASIBILITY_BUSINESS_FLOW_MISSING",
  "FEASIBILITY_BUSINESS_FLOW_STALE",
  "FEASIBILITY_CONTEXT_MISSING",
  "FEASIBILITY_CONTEXT_STALE",
  "FEASIBILITY_IMPLEMENTATION_STALE",
]);

function actionTargetForCode(code: string): FailureActionTarget | undefined {
  if (code === "REQUIREMENT_REVIEWS_PENDING" || code === "REQUIREMENT_BASELINE_BLOCKED") {
    return "pending-rules";
  }
  if (code === "REQUIREMENT_SOURCE_MISSING" || code === "RUN_REQUIREMENT_INPUT_UNSAFE" ||
    code === "RUN_REQUIREMENT_INPUT_IRRELEVANT" || code === "RUN_REQUIREMENT_RULES_EMPTY") {
    return "system-requirements";
  }
  if (REQUIREMENT_MODEL_CODES.has(code)) return "requirement-models";
  if (DESIGN_MODEL_CODES.has(code)) return "design-models";
  if (FEASIBILITY_CODES.has(code)) return "feasibility";
  if (code.startsWith("PROVIDER_")) return "provider-settings";
  if (
    code.startsWith("RUN_") ||
    code.startsWith("DOCUMENT_") ||
    code.startsWith("PLATFORM_PROVIDER_")
  ) {
    return "task-details";
  }
  return undefined;
}

function titleForCode(code: string) {
  if (code === "REQUIREMENT_REVIEWS_PENDING" || code === "REQUIREMENT_BASELINE_BLOCKED") {
    return i18n.t("errors.titles.requirementReview");
  }
  if (code === "PROVIDER_CIRCUIT_OPEN") return i18n.t("errors.titles.providerCircuit");
  if (code.startsWith("PROVIDER_") || code.startsWith("PLATFORM_PROVIDER_")) {
    return i18n.t("errors.titles.providerConnection");
  }
  if (code === "INTERNAL_ERROR" || code === "RUN_INTERNAL_ERROR") {
    return i18n.t("errors.titles.internal");
  }
  if (
    code === "RUN_NOT_RETRYABLE" ||
    code === "RUN_ACTIVE_CONFLICT" ||
    code === "RUN_ACTIVE_DELETE_CONFLICT" ||
    code === "RUN_ALREADY_TERMINAL" ||
    code.startsWith("DOCUMENT_")
  ) {
    return i18n.t("errors.titles.taskAction");
  }
  if (code.startsWith("RUN_")) {
    return i18n.t("generation.dialog.titles.failed");
  }
  return i18n.t("errors.titles.generationPreflight");
}

function nestedRunError(error: unknown): RunError | null {
  if (!error || typeof error !== "object" || !("runError" in error)) return null;
  const candidate = (error as { runError?: unknown }).runError;
  return candidate && typeof candidate === "object" && "code" in candidate
    ? (candidate as RunError)
    : null;
}

function safeRequestId(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("requestId" in payload)) return undefined;
  const requestId = (payload as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(requestId)
    ? requestId
    : undefined;
}

function fromApiError(
  error: ApiError,
  localizedMessage: string,
  requestId?: string,
): OperationFailurePresentation {
  const breaker = error.details?.breaker;
  const breakerRecord = breaker && typeof breaker === "object"
    ? breaker as Record<string, unknown>
    : null;
  const lastFailureAt = typeof breakerRecord?.lastFailureAt === "string"
    ? new Date(breakerRecord.lastFailureAt).toLocaleString(i18n.language)
    : undefined;
  const retryAfterSeconds = error.params?.retryAfterSeconds;
  const retryAfterMinutes = typeof retryAfterSeconds === "number"
    ? Math.max(1, Math.ceil(retryAfterSeconds / 60))
    : undefined;
  const params = lastFailureAt && retryAfterMinutes !== undefined
    ? { ...error.params, lastFailureAt, retryAfterMinutes }
    : error.params;
  const message = error.code === "PROVIDER_CIRCUIT_OPEN" &&
      (!lastFailureAt || retryAfterMinutes === undefined)
    ? i18n.t("errors.providerCircuitGeneric")
    : i18n.t(`errors.codes.${error.code}`, {
        ...params,
        defaultValue: localizedMessage,
      });
  return {
    actionTarget: actionTargetForCode(error.code),
    code: error.code,
    details: error.details,
    message,
    params,
    requestId,
    retryable: error.retryable,
    title: titleForCode(error.code),
  };
}

function fromRunError(error: RunError): OperationFailurePresentation {
  const code = typeof error.code === "string" ? error.code : "RUN_INTERNAL_ERROR";
  return {
    actionTarget: actionTargetForCode(code),
    code,
    details: error.details,
    message: localizeRunFailure(error, i18n.t("errors.codes.RUN_INTERNAL_ERROR")),
    params: error.params,
    retryable: error.retryable,
    title: titleForCode(code),
  };
}

export function operationFailurePresentation(
  error: unknown,
  options: { hasTaskDetails?: boolean; fallbackMessage?: string } = {},
): OperationFailurePresentation {
  if (error instanceof PresentedOperationError) return error.presentation;
  if (error instanceof ApiClientError) {
    if (error.apiError) {
      return fromApiError(error.apiError, error.message, safeRequestId(error.payload));
    }
    if (error.error) return fromRunError(error.error);
  }
  const runError = nestedRunError(error);
  if (runError) return fromRunError(runError);

  const message = options.fallbackMessage?.trim() || i18n.t("errors.codes.RUN_INTERNAL_ERROR");
  return {
    actionTarget: options.hasTaskDetails ? "task-details" : undefined,
    code: "RUN_INTERNAL_ERROR",
    message,
    retryable: true,
    title: i18n.t("errors.titles.internal"),
  };
}

export function operationFailureForCode(
  code: string,
  options: {
    category?: ApiError["category"];
    details?: Record<string, unknown>;
    params?: Record<string, string | number | boolean | null>;
    retryable?: boolean;
  } = {},
) {
  const fallback = i18n.t("errors.codes.RUN_INTERNAL_ERROR");
  const message = i18n.t(`errors.codes.${code}`, {
    ...options.params,
    defaultValue: fallback,
  });
  return fromApiError(
    {
      code,
      category: options.category ?? "conflict",
      retryable: options.retryable ?? false,
      params: options.params,
      details: options.details,
    },
    message,
  );
}
