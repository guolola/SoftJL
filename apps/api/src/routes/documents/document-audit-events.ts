// Wraps document audit and risk event recorders with route-oriented payload helpers.
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

export type DocumentRiskEventRecorder = (event: {
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  actorUserId: string | null;
  projectId: string | null;
  targetType: "document";
  targetId: string | null;
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

export type DocumentRiskInput = {
  eventType: string;
  severity: "low" | "medium" | "high" | "critical";
  actorUserId?: string | null;
  projectId?: string | null;
  documentId?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
};

export function createDocumentEventRecorders({
  recordAuditLog,
  recordRiskEvent,
}: {
  recordAuditLog?: DocumentAuditLogRecorder;
  recordRiskEvent?: DocumentRiskEventRecorder;
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

  async function recordDocumentRisk(input: DocumentRiskInput) {
    await recordRiskEvent?.({
      eventType: input.eventType,
      severity: input.severity,
      actorUserId: input.actorUserId ?? null,
      projectId: input.projectId ?? null,
      targetType: "document",
      targetId: input.documentId ?? null,
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
    recordDocumentRisk,
  };
}
