// Keeps the session cookie contract centralized for auth and account routes.
import type { FastifyReply, FastifyRequest } from "fastify";

export const SESSION_COOKIE_NAME = "uml_session";
export const ADMIN_SESSION_COOKIE_NAME = "uml_admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const VALID_SAMESITE_VALUES = new Set(["Lax", "None", "Strict"]);

export function readSessionCookie(request: FastifyRequest) {
  return readCookie(request, SESSION_COOKIE_NAME);
}

export function readAdminSessionCookie(request: FastifyRequest) {
  return readCookie(request, ADMIN_SESSION_COOKIE_NAME);
}

function readCookie(request: FastifyRequest, cookieName: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [name, ...rawValue] = part.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function setSessionCookie(reply: FastifyReply, sessionId: string) {
  setNamedSessionCookie(reply, SESSION_COOKIE_NAME, sessionId);
}

export function setAdminSessionCookie(reply: FastifyReply, sessionId: string) {
  setNamedSessionCookie(reply, ADMIN_SESSION_COOKIE_NAME, sessionId);
}

function setNamedSessionCookie(reply: FastifyReply, cookieName: string, sessionId: string) {
  reply.header(
    "Set-Cookie",
    serializeCookie(cookieName, sessionId, {
      maxAge: SESSION_MAX_AGE_SECONDS,
    }),
  );
}

export function clearSessionCookie(reply: FastifyReply) {
  clearNamedSessionCookie(reply, SESSION_COOKIE_NAME);
}

export function clearAdminSessionCookie(reply: FastifyReply) {
  clearNamedSessionCookie(reply, ADMIN_SESSION_COOKIE_NAME);
}

function clearNamedSessionCookie(reply: FastifyReply, cookieName: string) {
  reply.header(
    "Set-Cookie",
    serializeCookie(cookieName, "", {
      maxAge: 0,
    }),
  );
}

function serializeCookie(
  name: string,
  value: string,
  { maxAge }: { maxAge: number },
) {
  const sameSite = readSessionSameSite();
  const secureEnabled = readSessionSecure();
  if (sameSite === "None" && !secureEnabled) {
    throw new Error("SameSite=None requires UML_SESSION_SECURE=true");
  }
  const secure = secureEnabled ? "; Secure" : "";
  return `${name}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure}`;
}

function readSessionSameSite() {
  const raw = process.env.UML_SESSION_SAMESITE?.trim();
  if (!raw) return "Lax";
  const normalized = `${raw.charAt(0).toUpperCase()}${raw.slice(1).toLowerCase()}`;
  if (!VALID_SAMESITE_VALUES.has(normalized)) {
    throw new Error("UML_SESSION_SAMESITE must be Lax, None, or Strict");
  }
  return normalized as "Lax" | "None" | "Strict";
}

function readSessionSecure() {
  const raw = process.env.UML_SESSION_SECURE?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
}
