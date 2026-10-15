// Exposes generated DOCX files to the web app and OnlyOffice Document Server.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  documentLibraryListResponseSchema,
  documentLibraryItemSchema,
  documentLibraryVersionsResponseSchema,
  onlyOfficeEditorConfigResponseSchema,
  onlyOfficeUiThemeSchema,
} from "@uml-platform/contracts";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import {
  accessTokenFromRequest,
  onlyOfficeAccessTokenSecret,
  publicBaseUrlForRequest,
} from "../../documents/onlyoffice/request-security.js";
import {
  documentProjectContextFromRequest,
  isWorkspaceAuthError,
  requireDocumentWorkspace,
  type DocumentProjectMembershipGuard,
  type DocumentUserResolver,
} from "./document-workspace-auth.js";
import {
  isProjectAccessError,
  requireProjectAccessForDocument,
  requireProjectAccessFromPath,
  requireProjectAccessFromToken,
  requireProjectMembership,
} from "./document-project-access.js";
import {
  createDocumentEventRecorders,
  type DocumentAuditLogRecorder,
  type DocumentRiskEventRecorder,
} from "./document-audit-events.js";
import { handleOnlyOfficeCallbackSave } from "./document-onlyoffice-callback.js";
import type { DocumentLibraryItem } from "@uml-platform/contracts";

export type {
  DocumentAuditLogRecorder,
  DocumentRiskEventRecorder,
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
  recordRiskEvent,
  allowLegacyWorkspaceRoutes = false,
}: {
  app: FastifyInstance;
  documentLibrary: DocumentLibrary;
  projectMembershipGuard?: DocumentProjectMembershipGuard;
  resolveUserId?: DocumentUserResolver;
  recordAuditLog?: DocumentAuditLogRecorder;
  recordRiskEvent?: DocumentRiskEventRecorder;
  allowLegacyWorkspaceRoutes?: boolean;
}) {
  const {
    auditDocument,
    auditDocumentBestEffort,
    recordDocumentRisk,
  } = createDocumentEventRecorders({ recordAuditLog, recordRiskEvent });

  const legacyWorkspaceRoutesDeprecated = async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(410);
    return {
      message:
        "Legacy document workspace routes are disabled; use project-scoped document routes.",
    };
  };

  if (!allowLegacyWorkspaceRoutes) {
    app.get("/api/documents", legacyWorkspaceRoutesDeprecated);
    app.get("/api/documents/:documentId/editor-config", legacyWorkspaceRoutesDeprecated);
    app.get("/api/documents/:documentId/download", legacyWorkspaceRoutesDeprecated);
    app.patch("/api/documents/:documentId", legacyWorkspaceRoutesDeprecated);
    app.delete("/api/documents/:documentId", legacyWorkspaceRoutesDeprecated);
  }

  if (allowLegacyWorkspaceRoutes) {
  app.get("/api/documents", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const projectContext = await documentProjectContextFromRequest(
      request,
      "view_documents",
      resolveUserId,
    );
    if (projectContext === "missing-project-context") {
      reply.code(401);
      return { error: { message: "缺少项目访问凭据" } };
    }
    if (!projectContext) {
      reply.code(401);
      return { error: { message: "请先登录并进入项目" } };
    }
    if (projectContext) {
      const projectAccess = await requireProjectMembership(
        request,
        reply,
        projectMembershipGuard,
        projectContext,
      );
      if (isProjectAccessError(projectAccess)) return projectAccess;
    }

    await auditDocument({
      actorUserId: projectContext?.userId ?? null,
      action: "document.list",
      outcome: "success",
      message: projectContext
        ? `Listed documents for project ${projectContext.projectId}`
        : `Listed documents for workspace ${workspace.workspaceId}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: projectContext?.projectId ?? null,
      },
    });
    return documentLibraryListResponseSchema.parse({
      documents: await documentLibrary.listDocuments(workspace.workspaceId, {
        projectId: projectContext ? projectContext.projectId : null,
      }),
    });
  });
  }

  app.get("/api/projects/:projectId/documents", async (request, reply) => {
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
      documents: await documentLibrary.listAllDocuments({ projectId }),
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
      return { error: { message: "Document not found" } } as const;
    }
    if ((document.projectId ?? null) !== projectId) {
      reply.code(403);
      return { error: { message: "说明书不属于当前项目" } } as const;
    }
    if (!options?.includeDeleted && document.status === "deleted") {
      reply.code(404);
      return { error: { message: "Document not found" } } as const;
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
        return { message: "Document file not found" };
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
    "/api/projects/:projectId/documents/:documentId/editor-config",
    async (request, reply) => {
      const { projectId } = request.params as {
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

      const documentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim();
      if (!documentServerUrl) {
        reply.code(503);
        return { message: "请先配置 ONLYOFFICE_DOCUMENT_SERVER_URL" };
      }
      const rawUiTheme = (request.query as { uiTheme?: unknown }).uiTheme;
      const parsedUiTheme = onlyOfficeUiThemeSchema.safeParse(
        rawUiTheme ?? "theme-dark",
      );
      if (!parsedUiTheme.success) {
        reply.code(400);
        return { message: "Invalid OnlyOffice uiTheme" };
      }

      return onlyOfficeEditorConfigResponseSchema.parse(
        documentLibrary.createOnlyOfficeConfig({
          document,
          documentServerUrl,
          publicBaseUrl: publicBaseUrlForRequest(request),
          accessTokenSecret: onlyOfficeAccessTokenSecret(),
          userId: projectAccess.userId,
          uiTheme: parsedUiTheme.data,
          jwtSecret: process.env.ONLYOFFICE_JWT_SECRET,
        }),
      );
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
        return { message: "Document not found" };
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
        return { message: "Document not found" };
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
        return { message: "Document not found" };
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

  if (allowLegacyWorkspaceRoutes) {
  app.get("/api/documents/:documentId/editor-config", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const { documentId } = request.params as { documentId: string };
    const document = await documentLibrary.getDocument(
      workspace.workspaceId,
      documentId,
    );
    if (!document) {
      reply.code(404);
      return { message: "Document not found" };
    }
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "manage_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    const documentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim();
    if (!documentServerUrl) {
      reply.code(503);
      return { message: "请先配置 ONLYOFFICE_DOCUMENT_SERVER_URL" };
    }
    const rawUiTheme = (request.query as { uiTheme?: unknown }).uiTheme;
    const parsedUiTheme = onlyOfficeUiThemeSchema.safeParse(
      rawUiTheme ?? "theme-dark",
    );
    if (!parsedUiTheme.success) {
      reply.code(400);
      return { message: "Invalid OnlyOffice uiTheme" };
    }
    const uiTheme = parsedUiTheme.data;

    return onlyOfficeEditorConfigResponseSchema.parse(
      documentLibrary.createOnlyOfficeConfig({
        document,
        documentServerUrl,
        publicBaseUrl: publicBaseUrlForRequest(request),
        accessTokenSecret: onlyOfficeAccessTokenSecret(),
        userId: projectAccess?.userId,
        uiTheme,
        jwtSecret: process.env.ONLYOFFICE_JWT_SECRET,
      }),
    );
  });
  }

  const handleOnlyOfficeFileRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const { documentId } = request.params as { documentId: string };
    const access = documentLibrary.verifyOnlyOfficeAccessToken({
      documentId,
      purpose: "file",
      token: accessTokenFromRequest(request),
      accessTokenSecret: onlyOfficeAccessTokenSecret(),
    });
    if (!access) {
      await auditDocument({
        action: "document.file_access",
        documentId,
        outcome: "failure",
        message: "Document file access token invalid",
      });
      reply.code(403);
      return { message: "Document access token invalid" };
    }

    const document = await documentLibrary.getDocument(
      access.workspaceId,
      documentId,
    );
    const buffer = await documentLibrary.getDocumentBuffer(
      access.workspaceId,
      documentId,
    );
    if (!document || !buffer) {
      reply.code(404);
      return { message: "Document file not found" };
    }
    const projectAccess = await requireProjectAccessFromToken({
      request,
      reply,
      document,
      access,
      projectMembershipGuard,
      permission: "manage_documents",
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    await auditDocument({
      actorUserId: projectAccess?.userId ?? access.userId,
      action: "document.file_access",
      documentId,
      outcome: "success",
      message: `OnlyOffice file URL accessed document ${documentId}`,
      metadata: {
        workspaceId: access.workspaceId,
        projectId: document.projectId ?? null,
      },
    });
    reply.header("Content-Type", document.mimeType);
    reply.header(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    return buffer;
  };

  app.get("/api/documents/:documentId/file", handleOnlyOfficeFileRequest);
  app.get("/api/documents/:documentId/file/:fileName", handleOnlyOfficeFileRequest);

  if (allowLegacyWorkspaceRoutes) {
  app.get("/api/documents/:documentId/download", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const { documentId } = request.params as { documentId: string };
    const document = await documentLibrary.getDocument(
      workspace.workspaceId,
      documentId,
    );
    const buffer = await documentLibrary.getDocumentBuffer(
      workspace.workspaceId,
      documentId,
    );
    if (!document || !buffer) {
      reply.code(404);
      return { message: "Document file not found" };
    }
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "view_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;
    request.log.info(
      {
        operation: "document.download",
        documentId,
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
        userId: projectAccess?.userId ?? null,
      },
      "document download requested",
    );
    await auditDocumentBestEffort(request, {
      actorUserId: projectAccess?.userId ?? null,
      action: "document.download",
      documentId,
      outcome: "success",
      message: `Downloaded document ${document.fileName}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
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
  });
  }

  if (allowLegacyWorkspaceRoutes) {
  app.patch("/api/documents/:documentId", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const { documentId } = request.params as { documentId: string };
    const document = await documentLibrary.getDocument(
      workspace.workspaceId,
      documentId,
    );
    if (!document) {
      reply.code(404);
      return { message: "Document not found" };
    }
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "manage_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    const input = documentRenameRequestSchema.parse(request.body);
    const updated = await documentLibrary.renameDocument(
      workspace.workspaceId,
      documentId,
      input.fileName,
    );
    if (!updated) {
      reply.code(404);
      return { message: "Document not found" };
    }
    request.log.info(
      {
        operation: "document.rename",
        documentId,
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
        userId: projectAccess?.userId ?? null,
      },
      "document renamed",
    );
    await auditDocument({
      actorUserId: projectAccess?.userId ?? null,
      action: "document.rename",
      documentId,
      outcome: "success",
      message: `Renamed document ${documentId} to ${updated.fileName}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
      },
    });

    return { document: documentLibraryItemSchema.parse(updated) };
  });
  }

  if (allowLegacyWorkspaceRoutes) {
  app.delete("/api/documents/:documentId", async (request, reply) => {
    const workspace = await requireDocumentWorkspace(
      request,
      reply,
      documentLibrary,
    );
    if (isWorkspaceAuthError(workspace)) return workspace;

    const { documentId } = request.params as { documentId: string };
    const document = await documentLibrary.getDocument(
      workspace.workspaceId,
      documentId,
    );
    if (!document) {
      reply.code(404);
      return { message: "Document not found" };
    }
    const projectAccess = await requireProjectAccessForDocument({
      request,
      reply,
      document,
      projectMembershipGuard,
      permission: "manage_documents",
      resolveUserId,
    });
    if (isProjectAccessError(projectAccess)) return projectAccess;

    const deleted = await documentLibrary.deleteDocument(
      workspace.workspaceId,
      documentId,
    );
    if (!deleted) {
      reply.code(404);
      return { message: "Document not found" };
    }
    request.log.info(
      {
        operation: "document.delete",
        documentId,
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
        userId: projectAccess?.userId ?? null,
      },
      "document deleted",
    );
    await auditDocument({
      actorUserId: projectAccess?.userId ?? null,
      action: "document.delete",
      documentId,
      outcome: "success",
      message: `Deleted document ${documentId}`,
      metadata: {
        workspaceId: workspace.workspaceId,
        projectId: document.projectId ?? null,
      },
    });

    reply.code(204);
    return null;
  });
  }

  app.post("/api/documents/:documentId/onlyoffice/callback", async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const access = documentLibrary.verifyOnlyOfficeAccessToken({
      documentId,
      purpose: "callback",
      token: accessTokenFromRequest(request),
      accessTokenSecret: onlyOfficeAccessTokenSecret(),
    });
    if (!access) {
      await auditDocument({
        action: "document.onlyoffice_callback",
        documentId,
        outcome: "failure",
        message: "OnlyOffice callback access token invalid",
      });
      await recordDocumentRisk({
        eventType: "document.onlyoffice_callback_invalid_token",
        severity: "high",
        documentId,
        message: "OnlyOffice callback access token invalid",
      });
      reply.code(403);
      return { error: 1, message: "Document access token invalid" };
    }

    const document = await documentLibrary.getDocument(
      access.workspaceId,
      documentId,
    );
    if (!document) {
      await auditDocument({
        actorUserId: access.userId,
        action: "document.onlyoffice_callback",
        documentId,
        outcome: "failure",
        message: "OnlyOffice callback document not found",
        metadata: { workspaceId: access.workspaceId },
      });
      reply.code(404);
      return { error: 1, message: "Document not found" };
    }
    const projectAccess = await requireProjectAccessFromToken({
      request,
      reply,
      document,
      access,
      projectMembershipGuard,
      permission: "manage_documents",
    });
    if (isProjectAccessError(projectAccess)) {
      await auditDocument({
        actorUserId: access.userId,
        action: "document.onlyoffice_callback",
        documentId,
        outcome: "failure",
        message: projectAccess.error.message,
        metadata: {
          workspaceId: access.workspaceId,
          projectId: document.projectId ?? null,
        },
      });
      await recordDocumentRisk({
        eventType: "document.onlyoffice_callback_permission_denied",
        severity: "high",
        actorUserId: access.userId,
        projectId: document.projectId ?? null,
        documentId,
        message: projectAccess.error.message,
      });
      return { error: 1, message: projectAccess.error.message };
    }

    return handleOnlyOfficeCallbackSave({
      request,
      reply,
      documentLibrary,
      access,
      document,
      documentId,
      projectAccess,
      auditDocument,
      recordDocumentRisk,
    });
  });
}
