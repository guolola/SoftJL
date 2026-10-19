// Wraps document audit event recorders with route-oriented payload helpers.
import type { FastifyRequest } from "fastify";

export type DocumentAuditLogRecorder = (event: {
  actorUserId: string | null;
  action: string;
  targetType: "document";
  targetId: string | null;
  outcome: "success" | "failure";
  message: string;
  metadata?: Record<string, unknown>;
}) => Promise<unknown> | unknown;

export type DocumentAuditInput = {
  actorUserId?: string | null;
  action: string;
  documentId?: string | null;
  outcome: "success" | "failure";
  message: string;
  metadata?: Record<string, unknown>;
};

export function createDocumentEventRecorders({
  recordAuditLog,
}: {
  recordAuditLog?: DocumentAuditLogRecorder;
}) {
  async function auditDocument(input: DocumentAuditInput) {
    await recordAuditLog?.({
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: "document",
      targetId: input.documentId ?? null,
      outcome: input.outcome,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async function auditDocumentBestEffort(
    request: FastifyRequest,
    input: DocumentAuditInput,
  ) {
    try {
      await auditDocument(input);
    } catch (error) {
      request.log.warn(
        {
          operation: "document.audit_best_effort_failed",
          action: input.action,
          documentId: input.documentId ?? null,
          err: error,
        },
        "document audit logging failed after access was authorized",
      );
    }
  }

  return {
    auditDocument,
    auditDocumentBestEffort,
  };
}
