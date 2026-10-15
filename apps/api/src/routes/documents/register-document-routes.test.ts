// Covers document route authorization for legacy workspaces and project-scoped documents.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import type { ProjectPermission } from "@uml-platform/contracts";
import {
  createFileDocumentLibrary,
  createSignedDocumentAccessToken,
} from "../../documents/library/document-library.js";
import { onlyOfficeAccessTokenSecret } from "../../documents/onlyoffice/request-security.js";
import { registerDocumentRoutes } from "./register-document-routes.js";

const WORKSPACE_HEADERS = {
  "x-uml-workspace-id": "workspace-routes",
  "x-uml-workspace-secret": "workspace-routes-secret-value-123456",
};
// Callback fixtures must use the active signing secret when deployment tests configure OnlyOffice.
const ROUTE_ACCESS_SECRET = onlyOfficeAccessTokenSecret();

const PROJECT_MEMBERSHIPS: Record<
  string,
  Partial<Record<ProjectPermission, string[]>>
> = {
  "user-member": {
    view_documents: ["project-alpha"],
    manage_documents: ["project-alpha"],
  },
  "user-alpha": {
    view_documents: ["project-alpha"],
    manage_documents: ["project-alpha"],
  },
  "user-beta": {
    view_documents: ["project-beta"],
    manage_documents: ["project-beta"],
  },
  "user-both": {
    view_documents: ["project-alpha", "project-beta"],
    manage_documents: ["project-alpha", "project-beta"],
  },
  "viewer-alpha": { view_documents: ["project-alpha"] },
};

async function createDocumentRoutesApp(
  rootDir: string,
  options?: { failAuditActions?: string[] },
) {
  const app = Fastify({ logger: false });
  const documentLibrary = createFileDocumentLibrary(rootDir);
  const auditEvents: Array<{
    action: string;
    outcome: "success" | "failure";
    targetId: string | null;
    actorUserId: string | null;
  }> = [];
  const riskEvents: Array<{
    eventType: string;
    severity: "low" | "medium" | "high" | "critical";
    targetId: string | null;
  }> = [];
  await documentLibrary.authenticateWorkspace({
    workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
    workspaceSecret: WORKSPACE_HEADERS["x-uml-workspace-secret"],
  });
  registerDocumentRoutes({
    app,
    documentLibrary,
    projectMembershipGuard: async ({ projectId, userId, permission }) =>
      Boolean(PROJECT_MEMBERSHIPS[userId]?.[permission]?.includes(projectId)),
    recordAuditLog: async (event) => {
      if (options?.failAuditActions?.includes(event.action)) {
        throw new Error(`audit failed for ${event.action}`);
      }
      auditEvents.push({
        action: event.action,
        outcome: event.outcome,
        targetId: event.targetId,
        actorUserId: event.actorUserId,
      });
    },
    recordRiskEvent: async (event) => {
      riskEvents.push({
        eventType: event.eventType,
        severity: event.severity,
        targetId: event.targetId,
      });
    },
  });
  return { app, documentLibrary, auditEvents, riskEvents };
}

test("legacy workspace document download routes are disabled by default", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-member",
      documentKind: "requirementsSpec",
      sourceRunId: "run-1",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("member only"),
    });

    const denied = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/download`,
      headers: {
        ...WORKSPACE_HEADERS,
        "x-uml-project-id": "project-alpha",
        "x-uml-user-id": "user-outsider",
      },
    });
    assert.equal(denied.statusCode, 410);

    const allowed = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/download`,
      headers: {
        ...WORKSPACE_HEADERS,
        "x-uml-project-id": "project-alpha",
        "x-uml-user-id": "user-member",
      },
    });
    assert.equal(allowed.statusCode, 410);
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("document routes reject expired and wrong-purpose file access tokens", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      documentKind: "requirementsSpec",
      sourceRunId: "run-1",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("docx"),
    });

    const expiredToken = createSignedDocumentAccessToken({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      documentId: document.id,
      purpose: "file",
      secret: ROUTE_ACCESS_SECRET,
      expiresAt: Date.now() - 1,
    });
    const expired = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/file?accessToken=${expiredToken}`,
    });
    assert.equal(expired.statusCode, 403);

    const callbackToken = createSignedDocumentAccessToken({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      documentId: document.id,
      purpose: "callback",
      secret: ROUTE_ACCESS_SECRET,
    });
    const wrongPurpose = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/file?accessToken=${callbackToken}`,
    });
    assert.equal(wrongPurpose.statusCode, 403);
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("document routes reject legacy workspace access", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      documentKind: "requirementsSpec",
      sourceRunId: "run-legacy",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("legacy doc"),
    });

    const list = await app.inject({
      method: "GET",
      url: "/api/documents",
      headers: WORKSPACE_HEADERS,
    });
    assert.equal(list.statusCode, 410);

    const download = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/download`,
      headers: WORKSPACE_HEADERS,
    });
    assert.equal(download.statusCode, 410);
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("project document routes rename and delete project documents only for project members", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-member",
      documentKind: "requirementsSpec",
      sourceRunId: "run-rename",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("rename me"),
    });

    const deniedRename = await app.inject({
      method: "PATCH",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: {
        "x-uml-user-id": "user-outsider",
      },
      payload: {
        fileName: "非法重命名.docx",
      },
    });
    assert.equal(deniedRename.statusCode, 403);

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: {
        "x-uml-user-id": "user-member",
      },
      payload: {
        fileName: "课程设计需求说明书.docx",
      },
    });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().document.fileName, "课程设计需求说明书.docx");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: {
        "x-uml-user-id": "user-member",
      },
    });
    assert.equal(deleted.statusCode, 204);

    const list = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-uml-user-id": "user-member",
      },
    });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json().documents, []);
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("document routes reject OnlyOffice callback save URLs outside document server origin", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const originalDocumentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
  process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = "https://office.example.edu";
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      documentKind: "requirementsSpec",
      sourceRunId: "run-callback",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("legacy doc"),
    });
    const callbackToken = createSignedDocumentAccessToken({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      documentId: document.id,
      purpose: "callback",
      secret: ROUTE_ACCESS_SECRET,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/onlyoffice/callback?accessToken=${callbackToken}`,
      payload: {
        status: 2,
        url: "http://127.0.0.1:12345/internal-file",
      },
    });

    assert.equal(response.statusCode, 403);
    assert.match(response.body, /not allowed/i);
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
    if (originalDocumentServerUrl === undefined) {
      delete process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
    } else {
      process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = originalDocumentServerUrl;
    }
  }
});

test("project document routes list, download, and versions only for authorized project documents", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const alpha = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-alpha-1",
      fileName: "项目 A 需求规格说明书.docx",
      buffer: Buffer.from("alpha v1"),
    });
    const beta = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-beta",
      createdByUserId: "user-beta",
      documentKind: "softwareDesignSpec",
      sourceRunId: "run-beta-1",
      fileName: "项目 B 软件设计说明书.docx",
      buffer: Buffer.from("beta v1"),
    });
    await documentLibrary.updateDocumentBuffer(
      WORKSPACE_HEADERS["x-uml-workspace-id"],
      alpha.id,
      Buffer.from("alpha v2"),
    );

    const anonymousList = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
    });
    assert.equal(anonymousList.statusCode, 401);

    const nonMemberList = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-uml-user-id": "user-beta",
      },
    });
    assert.equal(nonMemberList.statusCode, 403);

    const list = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(
      list.json().documents.map((document: { id: string }) => document.id),
      [alpha.id],
    );

    const viewerList = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-uml-user-id": "viewer-alpha",
      },
    });
    assert.equal(viewerList.statusCode, 200);
    assert.deepEqual(
      viewerList.json().documents.map((document: { id: string }) => document.id),
      [alpha.id],
    );

    const crossProjectDownload = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${beta.id}/download`,
      headers: {
        "x-uml-user-id": "user-both",
      },
    });
    assert.equal(crossProjectDownload.statusCode, 403);

    const download = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${alpha.id}/download`,
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.equal(download.statusCode, 200);
    assert.equal(download.body, "alpha v2");

    const viewerDownload = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${alpha.id}/download`,
      headers: {
        "x-uml-user-id": "viewer-alpha",
      },
    });
    assert.equal(viewerDownload.statusCode, 200);
    assert.equal(viewerDownload.body, "alpha v2");
    assert.equal(viewerDownload.headers["content-length"], "8");

    const crossProjectVersions = await app.inject({
      method: "GET",
      url: `/api/projects/project-beta/documents/${alpha.id}/versions`,
      headers: {
        "x-uml-user-id": "user-both",
      },
    });
    assert.equal(crossProjectVersions.statusCode, 403);

    const versions = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${alpha.id}/versions`,
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.equal(versions.statusCode, 200);
    assert.deepEqual(
      versions.json().versions.map((version: { version: number }) => version.version),
      [2, 1],
    );

    const viewerVersions = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${alpha.id}/versions`,
      headers: {
        "x-uml-user-id": "viewer-alpha",
      },
    });
    assert.equal(viewerVersions.statusCode, 200);
    assert.deepEqual(
      viewerVersions.json().versions.map((version: { version: number }) => version.version),
      [2, 1],
    );
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("project document download remains available when authorized download audit logging fails", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary, auditEvents } = await createDocumentRoutesApp(
    rootDir,
    { failAuditActions: ["document.download"] },
  );
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-alpha-1",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("viewer file"),
    });

    const viewerDownload = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${document.id}/download`,
      headers: {
        "x-uml-user-id": "viewer-alpha",
      },
    });

    assert.equal(viewerDownload.statusCode, 200);
    assert.equal(viewerDownload.body, "viewer file");
    assert.equal(viewerDownload.headers["content-length"], "11");
    assert.equal(
      auditEvents.some(
        (event) =>
          event.action === "document.download" &&
          event.actorUserId === "viewer-alpha",
      ),
      false,
    );
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("project document routes build OnlyOffice editor config without workspace credentials", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const originalDocumentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
  process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = "https://office.example.edu";
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-alpha-editor",
      fileName: "项目 A 需求规格说明书.docx",
      buffer: Buffer.from("alpha editor"),
    });

    const missingUser = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${document.id}/editor-config`,
    });
    assert.equal(missingUser.statusCode, 401);

    const nonMember = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${document.id}/editor-config`,
      headers: {
        "x-uml-user-id": "user-beta",
      },
    });
    assert.equal(nonMember.statusCode, 403);

    const allowed = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${document.id}/editor-config?uiTheme=theme-classic-light`,
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.json().documentServerUrl, "https://office.example.edu");
    assert.equal(
      allowed.json().config.editorConfig.customization.uiTheme,
      "theme-classic-light",
    );
    const fileUrl = new URL(allowed.json().config.document.url);
    assert.equal(
      fileUrl.pathname,
      `/api/documents/${document.id}/file/${encodeURIComponent(document.fileName)}`,
    );

    const onlyOfficeFile = await app.inject({
      method: "GET",
      url: `${fileUrl.pathname}${fileUrl.search}`,
    });
    assert.equal(onlyOfficeFile.statusCode, 200);
    assert.equal(onlyOfficeFile.body, "alpha editor");

    const viewerEditorConfig = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${document.id}/editor-config`,
      headers: {
        "x-uml-user-id": "viewer-alpha",
      },
    });
    assert.equal(viewerEditorConfig.statusCode, 403);
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
    if (originalDocumentServerUrl === undefined) {
      delete process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
    } else {
      process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = originalDocumentServerUrl;
    }
  }
});

test("project document routes reject cross-project rename, delete, and restore", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-alpha-rename",
      fileName: "项目 A 需求规格说明书.docx",
      buffer: Buffer.from("alpha"),
    });

    const crossProjectRename = await app.inject({
      method: "PATCH",
      url: `/api/projects/project-beta/documents/${document.id}`,
      headers: {
        "x-uml-user-id": "user-both",
      },
      payload: {
        fileName: "不应成功.docx",
      },
    });
    assert.equal(crossProjectRename.statusCode, 403);

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: {
        "x-uml-user-id": "user-alpha",
      },
      payload: {
        fileName: "项目 A 重命名说明书.docx",
      },
    });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().document.fileName, "项目 A 重命名说明书.docx");

    const crossProjectDelete = await app.inject({
      method: "DELETE",
      url: `/api/projects/project-beta/documents/${document.id}`,
      headers: {
        "x-uml-user-id": "user-both",
      },
    });
    assert.equal(crossProjectDelete.statusCode, 403);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.equal(deleted.statusCode, 204);

    const hiddenAfterDelete = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.deepEqual(hiddenAfterDelete.json().documents, []);

    const crossProjectRestore = await app.inject({
      method: "POST",
      url: `/api/projects/project-beta/documents/${document.id}/restore`,
      headers: {
        "x-uml-user-id": "user-both",
      },
    });
    assert.equal(crossProjectRestore.statusCode, 403);

    const restored = await app.inject({
      method: "POST",
      url: `/api/projects/project-alpha/documents/${document.id}/restore`,
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().document.id, document.id);

    const visibleAfterRestore = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-uml-user-id": "user-alpha",
      },
    });
    assert.deepEqual(
      visibleAfterRestore.json().documents.map(
        (item: { id: string }) => item.id,
      ),
      [document.id],
    );
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("project document routes audit download, rename, delete, and restore outcomes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const { app, documentLibrary, auditEvents } = await createDocumentRoutesApp(rootDir);
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-alpha-audit",
      fileName: "项目 A 需求规格说明书.docx",
      buffer: Buffer.from("alpha"),
    });

    await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${document.id}/download`,
      headers: { "x-uml-user-id": "user-alpha" },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: { "x-uml-user-id": "user-alpha" },
      payload: { fileName: "项目 A 审计说明书.docx" },
    });
    await app.inject({
      method: "DELETE",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: { "x-uml-user-id": "user-alpha" },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/project-alpha/documents/${document.id}/restore`,
      headers: { "x-uml-user-id": "user-alpha" },
    });

    assert.deepEqual(
      auditEvents.map((event) => [
        event.action,
        event.outcome,
        event.targetId,
        event.actorUserId,
      ]),
      [
        ["document.download", "success", document.id, "user-alpha"],
        ["document.rename", "success", document.id, "user-alpha"],
        ["document.delete", "success", document.id, "user-alpha"],
        ["document.restore", "success", document.id, "user-alpha"],
      ],
    );
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("OnlyOffice callback writes audit and risk events for oversized saves", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-routes-"));
  const originalDocumentServerUrl = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
  const originalMaxBytes = process.env.ONLYOFFICE_CALLBACK_MAX_BYTES;
  process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = "https://office.example.edu";
  process.env.ONLYOFFICE_CALLBACK_MAX_BYTES = "4";
  const { app, documentLibrary, auditEvents, riskEvents } =
    await createDocumentRoutesApp(rootDir);
  const originalFetch = globalThis.fetch;
  try {
    const document = await documentLibrary.saveGeneratedDocument({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-callback-size",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("docx"),
    });
    const callbackToken = createSignedDocumentAccessToken({
      workspaceId: WORKSPACE_HEADERS["x-uml-workspace-id"],
      documentId: document.id,
      purpose: "callback",
      projectId: "project-alpha",
      userId: "user-alpha",
      secret: ROUTE_ACCESS_SECRET,
    });
    globalThis.fetch = (async () =>
      new Response(Buffer.from("too large"), {
        status: 200,
        headers: { "Content-Length": "9" },
      })) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: `/api/documents/${document.id}/onlyoffice/callback?accessToken=${callbackToken}`,
      payload: {
        status: 2,
        url: "https://office.example.edu/cache/document.docx",
      },
    });

    assert.equal(response.statusCode, 413);
    assert.deepEqual(
      auditEvents.map((event) => [event.action, event.outcome, event.targetId]),
      [["document.onlyoffice_callback", "failure", document.id]],
    );
    assert.deepEqual(
      riskEvents.map((event) => [event.eventType, event.severity, event.targetId]),
      [["document.onlyoffice_callback_oversized", "high", document.id]],
    );
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
    if (originalDocumentServerUrl === undefined) {
      delete process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
    } else {
      process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = originalDocumentServerUrl;
    }
    if (originalMaxBytes === undefined) {
      delete process.env.ONLYOFFICE_CALLBACK_MAX_BYTES;
    } else {
      process.env.ONLYOFFICE_CALLBACK_MAX_BYTES = originalMaxBytes;
    }
  }
});
