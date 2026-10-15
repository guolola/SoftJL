// Resolves OnlyOffice request URLs, access token secrets, and callback download safety checks.
import type { FastifyRequest } from "fastify";

export function publicBaseUrlForRequest(request: FastifyRequest) {
  const configured = process.env.PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = request.headers.host;
  const protocol =
    typeof request.protocol === "string" ? request.protocol : "http";
  return host ? `${protocol}://${host}` : "http://127.0.0.1:4001";
}

export function onlyOfficeCallbackPayload(body: unknown) {
  if (!body || typeof body !== "object") {
    return { status: null, url: null };
  }
  const status = "status" in body ? body.status : null;
  const url = "url" in body ? body.url : null;
  return {
    status: typeof status === "number" ? status : null,
    url: typeof url === "string" ? url : null,
  };
}

export function onlyOfficeAccessTokenSecret() {
  return (
    process.env.ONLYOFFICE_ACCESS_TOKEN_SECRET?.trim() ||
    process.env.ONLYOFFICE_JWT_SECRET?.trim() ||
    "uml-platform-dev-onlyoffice-access-secret"
  );
}

export function isAllowedOnlyOfficeDownloadUrl(rawUrl: string) {
  const documentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim();
  if (!documentServerUrl) return false;

  try {
    const candidate = new URL(rawUrl);
    const documentServer = new URL(documentServerUrl);
    return (
      (candidate.protocol === "https:" || candidate.protocol === "http:") &&
      candidate.origin === documentServer.origin
    );
  } catch {
    return false;
  }
}

export function accessTokenFromRequest(request: FastifyRequest) {
  const query = request.query as { accessToken?: unknown };
  return typeof query.accessToken === "string" ? query.accessToken : null;
}

export function onlyOfficeCallbackMaxBytes() {
  const configured = Number(process.env.ONLYOFFICE_CALLBACK_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 50 * 1024 * 1024;
}

export function responseContentLength(response: Response) {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
