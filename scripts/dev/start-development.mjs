// Starts the core development services with one root environment and explicit persistence boundaries.
import concurrently from "concurrently";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function developmentEnvironment(input = process.env) {
  const apiPort = input.API_PORT || "4101";
  const renderPort = input.RENDER_SERVICE_PORT || "4002";
  const environment = {
    ...input,
    API_PORT: apiPort,
    RENDER_SERVICE_PORT: renderPort,
    RENDER_SERVICE_BASE_URL: input.RENDER_SERVICE_BASE_URL || `http://127.0.0.1:${renderPort}`,
    UML_API_ORIGIN: input.UML_API_ORIGIN || `http://localhost:${apiPort}`,
    UML_DOCUMENT_STORAGE_DIR: input.UML_DOCUMENT_STORAGE_DIR || ".local-documents",
    UML_ENABLE_GUEST_ACCESS: input.UML_ENABLE_GUEST_ACCESS ?? "true",
    NEXT_PUBLIC_APP_API_BASE_URL: input.NEXT_PUBLIC_APP_API_BASE_URL || "",
  };
  for (const scope of ["GLOBAL", "PROVIDER", "PROJECT", "USER", "RUN"]) {
    const key = `UML_LLM_${scope}_CONCURRENCY`;
    environment[key] = input[key] || "10";
  }
  return environment;
}

export function startDevelopment() {
  const env = developmentEnvironment();
  console.log(env.DATABASE_URL
    ? "[dev] PostgreSQL persistence is enabled."
    : "[dev] Temporary in-memory data: accounts, projects and run history are lost on restart. Use npm run dev:postgres for persistence.");
  const commands = ["render", "api", "web"].map((name) => ({ name, command: `npm run dev:${name}`, env }));
  return concurrently(commands, { killOthers: ["failure", "success"], prefixColors: ["blue", "green", "magenta"] }).result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startDevelopment().catch(() => { process.exitCode = 1; });
}
