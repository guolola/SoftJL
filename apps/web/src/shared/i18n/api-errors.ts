// Converts language-neutral API failures into current-locale user messages.
import { i18n } from "./i18n";

type LocalizableError = {
  code: string;
  details?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | null>;
};

function localizableError(value: unknown): LocalizableError | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== "string" || !/^[A-Z][A-Z0-9_]+$/u.test(candidate.code)) {
    return null;
  }
  const params = candidate.params && typeof candidate.params === "object"
    ? Object.fromEntries(Object.entries(candidate.params as Record<string, unknown>).filter(
        ([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item),
      )) as Record<string, string | number | boolean | null>
    : undefined;
  const details = candidate.details && typeof candidate.details === "object"
    ? candidate.details as Record<string, unknown>
    : undefined;
  return { code: candidate.code, details, params };
}

function httpFallbackKey(status: number) {
  if (status === 400) return "errors.http.badRequest";
  if (status === 401) return "errors.http.unauthorized";
  if (status === 403) return "errors.http.forbidden";
  if (status === 404) return "errors.http.notFound";
  if (status === 409 || status === 422) return "errors.http.conflict";
  if (status === 429) return "errors.http.rateLimited";
  if (status >= 500) return "errors.http.server";
  return "errors.http.unknown";
}

export function localizeApiFailure(
  payload: unknown,
  status: number,
  operationFallback?: string,
) {
  const nested = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error
    : payload;
  const error = localizableError(nested);
  const fallback = operationFallback?.trim() || i18n.t(httpFallbackKey(status));
  if (!error) return fallback;
  if (error.code === "PROVIDER_CIRCUIT_OPEN") {
    const breaker = error.details?.breaker;
    const breakerRecord = breaker && typeof breaker === "object"
      ? breaker as Record<string, unknown>
      : null;
    const failureCount = error.params?.failureCount;
    const retryAfterSeconds = error.params?.retryAfterSeconds;
    const retryAfterMinutes = typeof retryAfterSeconds === "number"
      ? Math.max(1, Math.ceil(retryAfterSeconds / 60))
      : null;
    const lastFailureAt = typeof breakerRecord?.lastFailureAt === "string"
      ? new Date(breakerRecord.lastFailureAt).toLocaleString(i18n.language)
      : null;
    if (failureCount === undefined || !lastFailureAt || retryAfterMinutes === null) {
      return i18n.t("errors.providerCircuitGeneric");
    }
    return i18n.t("errors.codes.PROVIDER_CIRCUIT_OPEN", {
      ...error.params,
      lastFailureAt,
      retryAfterMinutes,
      defaultValue: fallback,
    });
  }
  return i18n.t(`errors.codes.${error.code}`, {
    ...error.params,
    defaultValue: fallback,
  });
}

export function isRequestAbort(error: unknown) {
  return typeof DOMException !== "undefined" && error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function localizeNetworkFailure() {
  return i18n.t("errors.http.network");
}

export function localizeCaughtFailure(error: unknown, fallback: string) {
  if (error instanceof Error && ["ApiClientError", "PlatformApiError"].includes(error.name)) {
    return error.message || fallback;
  }
  if (error instanceof TypeError) {
    return localizeNetworkFailure();
  }
  return fallback;
}

export function localizeRunFailure(
  error: unknown,
  fallback: string,
) {
  const parsed = localizableError(error);
  if (!parsed) return fallback;
  return i18n.t(`errors.codes.${parsed.code}`, {
    ...parsed.params,
    defaultValue: fallback,
  });
}
