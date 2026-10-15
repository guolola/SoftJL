// Handles OnlyOffice save callbacks after route-level token and project checks.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DocumentLibraryItem } from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import {
  isAllowedOnlyOfficeDownloadUrl,
  onlyOfficeCallbackMaxBytes,
  onlyOfficeCallbackPayload,
  responseContentLength,
} from "../../documents/onlyoffice/request-security.js";
import type {
  DocumentAuditInput,
  DocumentRiskInput,
} from "./document-audit-events.js";
import type { DocumentProjectContext } from "./document-workspace-auth.js";

type OnlyOfficeCallbackAccess = {
  workspaceId: string;
  projectId: string | null;
  userId: string | null;
};

type DocumentEventRecorder<T> = (input: T) => Promise<unknown> | unknown;

type OnlyOfficeCallbackResponse =
  | { error: 0 }
  | { error: 1; message: string };

export async function handleOnlyOfficeCallbackSave({
  request,
  reply,
  documentLibrary,
  access,
  document,
  documentId,
  projectAccess,
  auditDocument,
  recordDocumentRisk,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  documentLibrary: DocumentLibrary;
  access: OnlyOfficeCallbackAccess;
  document: DocumentLibraryItem;
  documentId: string;
  projectAccess: Pick<DocumentProjectContext, "userId"> | null;
  auditDocument: DocumentEventRecorder<DocumentAuditInput>;
  recordDocumentRisk: DocumentEventRecorder<DocumentRiskInput>;
}): Promise<OnlyOfficeCallbackResponse> {
  const { status, url } = onlyOfficeCallbackPayload(request.body);

  if ((status !== 2 && status !== 6) || !url) {
    return { error: 0 };
  }

  const actorUserId = projectAccess?.userId ?? access.userId;
  const projectId = document.projectId ?? null;

  if (!isAllowedOnlyOfficeDownloadUrl(url)) {
    await auditDocument({
      actorUserId,
      action: "document.onlyoffice_callback",
      documentId,
      outcome: "failure",
      message: "OnlyOffice save URL origin is not allowed",
      metadata: { workspaceId: access.workspaceId, projectId, url },
    });
    await recordDocumentRisk({
      eventType: "document.onlyoffice_callback_untrusted_origin",
      severity: "high",
      actorUserId,
      projectId,
      documentId,
      message: "OnlyOffice save URL origin is not allowed",
      metadata: { url },
    });
    reply.code(403);
    return { error: 1, message: "OnlyOffice save URL origin is not allowed" };
  }

  const response = await fetch(url);
  if (!response.ok) {
    await auditDocument({
      actorUserId,
      action: "document.onlyoffice_callback",
      documentId,
      outcome: "failure",
      message: `OnlyOffice save download failed: ${response.status}`,
      metadata: { workspaceId: access.workspaceId, projectId },
    });
    reply.code(502);
    return {
      error: 1,
      message: `OnlyOffice save download failed: ${response.status}`,
    };
  }

  const maxBytes = onlyOfficeCallbackMaxBytes();
  const declaredLength = responseContentLength(response);
  if (declaredLength !== null && declaredLength > maxBytes) {
    await auditDocument({
      actorUserId,
      action: "document.onlyoffice_callback",
      documentId,
      outcome: "failure",
      message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
      metadata: {
        workspaceId: access.workspaceId,
        projectId,
        declaredLength,
        maxBytes,
      },
    });
    await recordDocumentRisk({
      eventType: "document.onlyoffice_callback_oversized",
      severity: "high",
      actorUserId,
      projectId,
      documentId,
      message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
      metadata: { declaredLength, maxBytes },
    });
    reply.code(413);
    return { error: 1, message: "OnlyOffice save download is too large" };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    await auditDocument({
      actorUserId,
      action: "document.onlyoffice_callback",
      documentId,
      outcome: "failure",
      message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
      metadata: {
        workspaceId: access.workspaceId,
        projectId,
        byteLength: buffer.byteLength,
        maxBytes,
      },
    });
    await recordDocumentRisk({
      eventType: "document.onlyoffice_callback_oversized",
      severity: "high",
      actorUserId,
      projectId,
      documentId,
      message: `OnlyOffice save download exceeded ${maxBytes} bytes`,
      metadata: { byteLength: buffer.byteLength, maxBytes },
    });
    reply.code(413);
    return { error: 1, message: "OnlyOffice save download is too large" };
  }

  const updated = await documentLibrary.updateDocumentBuffer(
    access.workspaceId,
    documentId,
    buffer,
  );
  if (!updated) {
    await auditDocument({
      actorUserId,
      action: "document.onlyoffice_callback",
      documentId,
      outcome: "failure",
      message: "Document not found during OnlyOffice save",
      metadata: { workspaceId: access.workspaceId, projectId },
    });
    reply.code(404);
    return { error: 1, message: "Document not found" };
  }

  request.log.info(
    {
      operation: "document.onlyoffice_callback_save",
      documentId,
      workspaceId: access.workspaceId,
      projectId,
      userId: projectAccess?.userId ?? null,
      status,
    },
    "OnlyOffice document save callback accepted",
  );
  await auditDocument({
    actorUserId,
    action: "document.onlyoffice_callback",
    documentId,
    outcome: "success",
    message: `OnlyOffice save callback updated document ${documentId}`,
    metadata: {
      workspaceId: access.workspaceId,
      projectId,
      status,
      byteLength: updated.byteLength,
    },
  });

  return { error: 0 };
}
