// Retries transient failures while establishing a provider response, before any stream can be consumed.
import { APIConnectionError, APIConnectionTimeoutError } from "openai";

export interface ProviderRequestRetryEvent {
  retry: number;
  delayMs: number;
  statusCode: number | null;
  reason: "http" | "connection";
}

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

function retryAfterMs(error: unknown) {
  const headers = (error as { headers?: Headers } | null)?.headers;
  const value = headers?.get?.("retry-after")?.trim();
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createProviderRequestRetrier({
  signal,
  onRetry,
}: {
  signal?: AbortSignal;
  onRetry?: (event: ProviderRequestRetryEvent) => void;
} = {}) {
  // Compatibility fallbacks share this budget, rather than multiplying retries for each request shape.
  let retries = 0;
  return async function requestWithRetries<T>(request: () => Promise<T>): Promise<T> {
    while (true) {
      signal?.throwIfAborted();
      try {
        return await request();
      } catch (error) {
        signal?.throwIfAborted();
        const rawStatus = (error as { status?: unknown } | null)?.status;
        const statusCode = typeof rawStatus === "number" ? rawStatus : null;
        const connectionFailure = error instanceof APIConnectionError &&
          !(error instanceof APIConnectionTimeoutError);
        if (retries >= MAX_RETRIES ||
          !(connectionFailure || (statusCode !== null && TRANSIENT_HTTP_STATUSES.has(statusCode)))) {
          throw error;
        }
        const serverDelay = retryAfterMs(error);
        // A longer server cooldown is surfaced to the caller; never retry earlier than Retry-After.
        if (serverDelay > MAX_DELAY_MS) throw error;
        const exponentialDelay = INITIAL_DELAY_MS * 2 ** retries;
        const delayMs = Math.max(serverDelay, Math.min(MAX_DELAY_MS,
          Math.round(exponentialDelay * (1 + Math.random() * 0.25))));
        retries += 1;
        await waitForRetry(delayMs, signal);
        signal?.throwIfAborted();
        // Count attempts that actually resume, rather than cancelled waits, in request telemetry.
        onRetry?.({ retry: retries, delayMs, statusCode, reason: connectionFailure ? "connection" : "http" });
      }
    }
  };
}
