// Owns API CORS defaults and origin validation for local and deployed servers.
export const DEFAULT_LOCAL_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
];

export function readCorsOrigins(envName: string, localDefaults: string[]) {
  const configured = process.env[envName]
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured && configured.length > 0) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? [] : localDefaults;
}

export function createCorsOriginChecker(envName: string, localDefaults: string[]) {
  const allowedOrigins = new Set(readCorsOrigins(envName, localDefaults));

  return async (origin: string | undefined) => {
    if (!origin || allowedOrigins.has(origin)) {
      return true;
    }

    console.warn(
      `[cors] Rejected origin "${origin}". Configure ${envName} to allow it.`,
    );
    return false;
  };
}
