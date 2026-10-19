// Exposes generated DOCX files to authenticated project members for preview and download.
import { createHttpErrorResponse } from "../../server/http-error-response.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  documentLibraryListResponseSchema,
  documentLibraryItemSchema,
  documentLibraryVersionsResponseSchema,
} from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import {
  type DocumentProjectMembershipGuard,
  type DocumentUserResolver,
} from "./document-workspace-auth.js";
import {
  isProjectAccessError,
  requireProjectAccessFromPath,
} from "./document-project-access.js";
import {
  createDocumentEventRecorders,
  type DocumentAuditLogRecorder,
} from "./document-audit-events.js";


export type {
  DocumentAuditLogRecorder,
} from "./document-audit-events.js";

const documentRenameRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine((value) => !/[\\/]/.test(value), {
      message: "Document fileName must not contain path separators",
    }),
});

export function registerDocumentRoutes({
  app,
  documentLibrary,
  projectMembershipGuard,
  resolveUserId,
  recordAuditLog,
}: {
  app: FastifyInstance;
  documentLibrary: DocumentLibrary;
  projectMembershipGuard: DocumentProjectMembershipGuard;
  resolveUserId: DocumentUserResolver;
  recordAuditLog?: DocumentAuditLogRecorder;
}) {
  const {
    auditDocument,
    auditDocumentBestEffort,
  } = createDocumentEventRecorders({ recordAuditLog });

  app.get("/api/projects/:projectId/documents", async (request, reply) => {
    const query = z.object({ includeDeleted: z.enum(["true", "false"]).optional() }).parse(request.query);
    const { projectId } = request.params as { projectId: string };
    const projectAccess = await requireProjectAccessFromPath({
      request,
      reply,
      projectId,
      projectMembershipGuard,
      permission: "view_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    await auditDocument({
      actorUserId: projectAccess.userId,
      action: "document.list",
      outcome: "success",
      message: `Listed documents for project ${projectId}`,
      metadata: { projectId },
    });
    return documentLibraryListResponseSchema.parse({
      documents: await documentLibrary.listAllDocuments({ projectId, includeDeleted: query.includeDeleted === "true" }),
    });
  });

  async function projectDocumentFromRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    options?: { includeDeleted?: boolean },
  ) {
    const { projectId, documentId } = request.params as {
      projectId: string;
      documentId: string;
    };
    const documents = await documentLibrary.listAllDocuments({
      includeDeleted: true,
    });
    const document = documents.find((item) => item.id === documentId);
    if (!document) {
      reply.code(404);
      return createHttpErrorResponse(reply);
    }
    if ((document.projectId ?? null) !== projectId) {
      reply.code(403);
      return createHttpErrorResponse(reply);
    }
    if (!options?.includeDeleted && document.status === "deleted") {
      reply.code(404);
      return createHttpErrorResponse(reply);
    }
    return document;
  }

  app.get(
    "/api/projects/:projectId/documents/:documentId/download",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "view_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply);
      if (isProjectAccessError(document)) return document;
      const buffer = await documentLibrary.getDocumentBuffer(
        document.workspaceId,
        documentId,
      );
      if (!buffer) {
        reply.code(404);
        return createHttpErrorResponse(reply);
      }
      request.log.info(
        {
          operation: "document.project_download",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document download requested",
      );
      await auditDocumentBestEffort(request, {
        actorUserId: projectAccess.userId,
        action: "document.download",
        documentId,
        outcome: "success",
        message: `Downloaded document ${document.fileName} for project ${projectId}`,
        metadata: {
          workspaceId: document.workspaceId,
          projectId,
          byteLength: document.byteLength,
        },
      });

      reply.header("Content-Type", document.mimeType);
      reply.header("Content-Length", String(buffer.byteLength));
      reply.header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
      );
      return buffer;
    },
  );

  app.get(
    "/api/projects/:projectId/documents/:documentId/versions",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "view_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply, {
        includeDeleted: true,
      });
      if (isProjectAccessError(document)) return document;
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.versions",
        documentId,
        outcome: "success",
        message: `Listed versions for document ${documentId}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      return documentLibraryVersionsResponseSchema.parse({
        versions: await documentLibrary.listDocumentVersions(
          document.workspaceId,
          documentId,
        ),
      });
    },
  );

  app.patch(
    "/api/projects/:projectId/documents/:documentId",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "manage_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply);
      if (isProjectAccessError(document)) return document;
      const input = documentRenameRequestSchema.parse(request.body);
      const updated = await documentLibrary.renameDocument(
        document.workspaceId,
        documentId,
        input.fileName,
      );
      if (!updated) {
        reply.code(404);
        return createHttpErrorResponse(reply);
      }
      request.log.info(
        {
          operation: "document.project_rename",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document renamed",
      );
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.rename",
        documentId,
        outcome: "success",
        message: `Renamed document ${documentId} to ${updated.fileName}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      return { document: documentLibraryItemSchema.parse(updated) };
    },
  );

  app.delete(
    "/api/projects/:projectId/documents/:documentId",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "manage_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply);
      if (isProjectAccessError(document)) return document;
      const deleted = await documentLibrary.deleteDocument(
        document.workspaceId,
        documentId,
      );
      if (!deleted) {
        reply.code(404);
        return createHttpErrorResponse(reply);
      }
      request.log.info(
        {
          operation: "document.project_delete",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document deleted",
      );
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.delete",
        documentId,
        outcome: "success",
        message: `Deleted document ${documentId}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      reply.code(204);
      return null;
    },
  );

  app.post(
    "/api/projects/:projectId/documents/:documentId/restore",
    async (request, reply) => {
      const { projectId, documentId } = request.params as {
        projectId: string;
        documentId: string;
      };
      const projectAccess = await requireProjectAccessFromPath({
        request,
        reply,
        projectId,
        projectMembershipGuard,
        permission: "manage_documents",
        resolveUserId,
      });
      if (isProjectAccessError(projectAccess)) return projectAccess;

      const document = await projectDocumentFromRequest(request, reply, {
        includeDeleted: true,
      });
      if (isProjectAccessError(document)) return document;
      const restored = await documentLibrary.restoreDocument(
        document.workspaceId,
        documentId,
      );
      if (!restored) {
        reply.code(404);
        return createHttpErrorResponse(reply);
      }
      request.log.info(
        {
          operation: "document.project_restore",
          documentId,
          workspaceId: document.workspaceId,
          projectId,
          userId: projectAccess.userId,
        },
        "project document restored",
      );
      await auditDocument({
        actorUserId: projectAccess.userId,
        action: "document.restore",
        documentId,
        outcome: "success",
        message: `Restored document ${documentId}`,
        metadata: { workspaceId: document.workspaceId, projectId },
      });
      return { document: documentLibraryItemSchema.parse(restored) };
    },
  );

}
