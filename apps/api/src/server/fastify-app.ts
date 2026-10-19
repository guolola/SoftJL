// Creates the base Fastify instance with shared plugins and normalized request error handling.
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { ZodError } from "zod";
import { httpErrorResponse } from "./http-error-response.js";
import {
  createCorsOriginChecker,
  DEFAULT_LOCAL_CORS_ORIGINS,
} from "./cors.js";

type ZodLikeIssue = {
  message: string;
  path: Array<string | number>;
};

function isZodLikeError(error: unknown): error is { issues: ZodLikeIssue[] } {
  if (error instanceof ZodError) return true;
  const issues = (error as { issues?: unknown } | null)?.issues;
  return (
    Array.isArray(issues) &&
    issues.every((issue) => {
      const candidate = issue as Partial<ZodLikeIssue> | null;
      return (
        typeof candidate?.message === "string" &&
        Array.isArray(candidate.path)
      );
    })
  );
}

function formatZodIssues(issues: ZodLikeIssue[]) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "request";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export async function createConfiguredFastifyApp() {
  const app = Fastify({ logger: {
    redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
    serializers: { req: (req) => ({ method: req.method, url: String(req.url ?? "").split("?")[0], hostname: req.hostname, remoteAddress: req.ip }) },
  }, trustProxy: true });
  await app.register(cors, {
    origin: createCorsOriginChecker("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
    credentials: true,
    exposedHeaders: ["Content-Disposition", "WWW-Authenticate", "MCP-Protocol-Version"],
  });
  await app.register(multipart);
  app.setNotFoundHandler((request, reply) => reply.code(404).send(httpErrorResponse(404, request.id)));
  app.addHook("preSerialization", async (request, reply, payload) => {
    // OAuth discovery and JSON-RPC errors must retain their protocol response shape.
    if (request.routeOptions.config.mcpProtocol) return payload;
    if (reply.statusCode < 400 || typeof payload !== "object" || payload === null) {
      return payload;
    }
    const candidate = payload as Record<string, unknown>;
    const nestedError = candidate.error;
    const hasStructuredError =
      typeof nestedError === "object" &&
      nestedError !== null &&
      typeof (nestedError as Record<string, unknown>).code === "string";
    if (hasStructuredError) {
      return typeof candidate.requestId === "string"
        ? payload
        : { ...candidate, requestId: request.id };
    }
    return payload;
  });
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (isZodLikeError(error)) {
      reply.code(400).send(httpErrorResponse(400, request.id, { validation: formatZodIssues(error.issues) }));
      return;
    }
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : null;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      reply.code(statusCode).send(httpErrorResponse(statusCode, request.id));
      return;
    }

    reply.code(500).send(httpErrorResponse(500, request.id));
  });
  return app;
}
