// Centralizes API server environment defaults used by entrypoint assembly and startup.
import { join } from "node:path";
import { resolveRuntimeCwd } from "./runtime.js";

export const DEFAULT_PORT = Number(process.env.API_PORT ?? 4001);
export const DEFAULT_HOST = process.env.API_HOST ?? "127.0.0.1";
export const DEFAULT_RENDER_SERVICE_BASE_URL =
  process.env.RENDER_SERVICE_BASE_URL ?? "http://127.0.0.1:4002";
export const DEFAULT_DOCUMENT_STORAGE_DIR =
  process.env.UML_DOCUMENT_STORAGE_DIR ??
  join(resolveRuntimeCwd(), "data", "documents");

export const RELEASE_STARTED_AT =
  process.env.UML_RELEASE_STARTED_AT ?? new Date().toISOString();
export const DEFAULT_SSE_ALLOW_ORIGIN = "http://localhost:5173";
export function readPositiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}
