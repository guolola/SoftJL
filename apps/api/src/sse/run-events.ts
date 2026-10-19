// Registers shared Server-Sent Events endpoints for all run kinds.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHttpErrorResponse } from "../server/http-error-response.js";
import { runEventMetadataSchema, type RunEvent } from "@uml-platform/contracts";
import {
  refreshRunRecordIfAvailable,
  type RunRecord,
  type RunRecordStore,
} from "../runs/records/run-record-store.js";
import type {
  RunEventSubscription,
  SubscribeRunEvents,
} from "../runs/queue/run-queue.js";
import { DEFAULT_LOCAL_CORS_ORIGINS, readCorsOrigins } from "../server/cors.js";
import { queryValue } from "../runs/records/run-record-summaries.js";
import { projectRunProgressEvent } from "../runs/records/run-progress-transcript.js";

type CanReadRunRecord = (
  request: FastifyRequest,
  reply: FastifyReply,
  record: RunRecord,
) => Promise<boolean>;

export function registerRunEventsRoute({
  app,
  runs,
  path,
  defaultAllowOrigin,
  canReadRunRecord,
  subscribeRunEvents,
  heartbeatMs = 15000,
}: {
  app: FastifyInstance;
  runs: RunRecordStore;
  path: string;
  defaultAllowOrigin: string;
  canReadRunRecord?: CanReadRunRecord;
  subscribeRunEvents?: SubscribeRunEvents;
  heartbeatMs?: number;
}) {
  const allowedOrigins = new Set(
    readCorsOrigins("API_CORS_ORIGINS", DEFAULT_LOCAL_CORS_ORIGINS),
  );

  app.get(path, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const progressOnly = queryValue(request.query, "view") === "progress";
    const cursorValue = queryValue(request.query, "afterSequence") ?? request.headers["last-event-id"] ?? "0";
    const afterSequence = Number(cursorValue);
    if (!/^\d+$/.test(String(cursorValue)) || !Number.isSafeInteger(afterSequence)) {
      return reply.code(400).send(createHttpErrorResponse(reply));
    }
    const readOptions = { events: progressOnly ? "progress" as const : "all" as const, afterSequence };
    const initialRecord = await refreshRunRecordIfAvailable(runs, runId, readOptions);
    if (!initialRecord) {
      reply.code(404);
      return createHttpErrorResponse(reply);
    }
    let record = initialRecord;
    if (canReadRunRecord && !(await canReadRunRecord(request, reply, record))) {
      return reply;
    }
    // Reject obsolete in-memory history before opening SSE; replay must never invent metadata.
    for (const event of record.events) runEventMetadataSchema.parse(event);

    const requestOrigin =
      typeof request.headers.origin === "string" ? request.headers.origin : null;
    const allowOrigin =
      requestOrigin && allowedOrigins.has(requestOrigin)
        ? requestOrigin
        : requestOrigin
          ? null
          : defaultAllowOrigin;
    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      Vary: "Origin",
    };
    if (allowOrigin) {
      headers["Access-Control-Allow-Origin"] = allowOrigin;
      headers["Access-Control-Allow-Credentials"] = "true";
    }

    reply.hijack();
    reply.raw.writeHead(200, headers);

    const delivered = new Set<string>();
    const send = (event: RunEvent) => {
      if (event.sequence !== undefined && event.sequence <= afterSequence) return;
      const visible = progressOnly ? projectRunProgressEvent(event) : event;
      if (!visible) return;
      if (event.eventId && delivered.has(event.eventId)) return;
      if (event.eventId) delivered.add(event.eventId);
      reply.raw.write(`${event.sequence === undefined ? "" : `id: ${event.sequence}\n`}data: ${JSON.stringify(visible)}\n\n`);
    };
    let listener: ((event: RunEvent) => void) | null = null;
    let redisSubscription: RunEventSubscription | null = null;
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, heartbeatMs);
    let closed = false;
    const cleanup = () => {
      clearInterval(heartbeat);
      if (listener) {
        record.listeners.delete(listener);
        listener = null;
      }
      if (redisSubscription) {
        void redisSubscription.close();
        redisSubscription = null;
      }
    };
    const close = () => {
      if (closed) return;
      closed = true;
      cleanup();
      reply.raw.end();
    };
    const sendAndMaybeClose = (event: RunEvent) => {
      if (closed) return;
      send(event);
      if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
        close();
      }
    };

    // Buffer live publications until persisted replay finishes. A terminal publication
    // must not close the response before its earlier messages have been replayed.
    let replaying = true;
    const pending: RunEvent[] = [];
    const receive = (event: RunEvent) => {
      if (replaying) pending.push(event);
      else sendAndMaybeClose(event);
    };
    request.raw.on("close", cleanup);

    if (!record.terminal && subscribeRunEvents) {
      try {
        redisSubscription = await subscribeRunEvents(runId, receive, () => {
          close();
        });
        const refreshedRecord = await refreshRunRecordIfAvailable(runs, runId, readOptions);
        if (refreshedRecord) {
          record = refreshedRecord;
        }
      } catch (error) {
        app.log.warn({ err: error, runId }, "failed to subscribe redis run events");
        close();
        return;
      }
    }

    listener = receive;
    record.listeners.add(listener);
    for (const event of record.events) {
      send(event);
    }
    if (record.terminal) {
      close();
      return;
    }

    replaying = false;
    for (const event of pending) sendAndMaybeClose(event);
  });
}
