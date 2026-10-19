// Covers retired workspace endpoint rejection and project-scoped document authorization.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import type { ProjectPermission } from "@uml-platform/contracts";
import {
  createFileDocumentLibrary,
} from "../../documents/library/document-library.js";
import { registerDocumentRoutes } from "./register-document-routes.js";

const WORKSPACE_HEADERS = {
  "x-uml-workspace-id": "workspace-routes",
  "x-uml-workspace-secret": "workspace-routes-secret-value-123456",
};
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
  registerDocumentRoutes({
    app,
    documentLibrary,
    resolveUserId: (request) => typeof request.headers["x-test-user-id"] === "string" ? request.headers["x-test-user-id"] : null,
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
  });
  return { app, documentLibrary, auditEvents };
}

test("workspace document download routes are not registered", async () => {
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
        "x-test-user-id": "user-outsider",
      },
    });
    assert.equal(denied.statusCode, 404);

    const allowed = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/download`,
      headers: {
        ...WORKSPACE_HEADERS,
        "x-uml-project-id": "project-alpha",
        "x-test-user-id": "user-member",
      },
    });
    assert.equal(allowed.statusCode, 404);
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("retired editor, token file, and save callback routes are not registered", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-document-preview-"));
  const { app } = await createDocumentRoutesApp(rootDir);
  try {
    for (const request of [
      { method: "GET" as const, url: "/api/projects/project-alpha/documents/document-a/editor-config" },
      { method: "GET" as const, url: "/api/documents/document-a/file?accessToken=obsolete" },
      { method: "GET" as const, url: "/api/documents/document-a/file/document.docx" },
      { method: "POST" as const, url: "/api/documents/document-a/onlyoffice/callback" },
    ]) {
      const response = await app.inject({ ...request, headers: { "x-test-user-id": "user-alpha" } });
      assert.equal(response.statusCode, 404);
    }
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("workspace document collection routes are not registered", async () => {
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
    assert.equal(list.statusCode, 404);

    const download = await app.inject({
      method: "GET",
      url: `/api/documents/${document.id}/download`,
      headers: WORKSPACE_HEADERS,
    });
    assert.equal(download.statusCode, 404);
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
        "x-test-user-id": "user-outsider",
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
        "x-test-user-id": "user-member",
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
        "x-test-user-id": "user-member",
      },
    });
    assert.equal(deleted.statusCode, 204);

    const list = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-test-user-id": "user-member",
      },
    });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.json().documents, []);
    const deletedList = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents?includeDeleted=true",
      headers: { "x-test-user-id": "user-member" },
    });
    assert.equal(deletedList.statusCode, 200);
    assert.equal(deletedList.json().documents[0]?.id, document.id);
    assert.equal(deletedList.json().documents[0]?.status, "deleted");
  } finally {
    await app.close();
    await rm(rootDir, { recursive: true, force: true });
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
        "x-test-user-id": "user-beta",
      },
    });
    assert.equal(nonMemberList.statusCode, 403);

    const list = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-test-user-id": "user-alpha",
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
        "x-test-user-id": "viewer-alpha",
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
        "x-test-user-id": "user-both",
      },
    });
    assert.equal(crossProjectDownload.statusCode, 403);

    const download = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${alpha.id}/download`,
      headers: {
        "x-test-user-id": "user-alpha",
      },
    });
    assert.equal(download.statusCode, 200);
    assert.equal(download.body, "alpha v2");

    const viewerDownload = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${alpha.id}/download`,
      headers: {
        "x-test-user-id": "viewer-alpha",
      },
    });
    assert.equal(viewerDownload.statusCode, 200);
    assert.equal(viewerDownload.body, "alpha v2");
    assert.equal(viewerDownload.headers["content-length"], "8");

    const crossProjectVersions = await app.inject({
      method: "GET",
      url: `/api/projects/project-beta/documents/${alpha.id}/versions`,
      headers: {
        "x-test-user-id": "user-both",
      },
    });
    assert.equal(crossProjectVersions.statusCode, 403);

    const versions = await app.inject({
      method: "GET",
      url: `/api/projects/project-alpha/documents/${alpha.id}/versions`,
      headers: {
        "x-test-user-id": "user-alpha",
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
        "x-test-user-id": "viewer-alpha",
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
        "x-test-user-id": "viewer-alpha",
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
        "x-test-user-id": "user-both",
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
        "x-test-user-id": "user-alpha",
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
        "x-test-user-id": "user-both",
      },
    });
    assert.equal(crossProjectDelete.statusCode, 403);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: {
        "x-test-user-id": "user-alpha",
      },
    });
    assert.equal(deleted.statusCode, 204);

    const hiddenAfterDelete = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-test-user-id": "user-alpha",
      },
    });
    assert.deepEqual(hiddenAfterDelete.json().documents, []);

    const crossProjectRestore = await app.inject({
      method: "POST",
      url: `/api/projects/project-beta/documents/${document.id}/restore`,
      headers: {
        "x-test-user-id": "user-both",
      },
    });
    assert.equal(crossProjectRestore.statusCode, 403);

    const restored = await app.inject({
      method: "POST",
      url: `/api/projects/project-alpha/documents/${document.id}/restore`,
      headers: {
        "x-test-user-id": "user-alpha",
      },
    });
    assert.equal(restored.statusCode, 200);
    assert.equal(restored.json().document.id, document.id);

    const visibleAfterRestore = await app.inject({
      method: "GET",
      url: "/api/projects/project-alpha/documents",
      headers: {
        "x-test-user-id": "user-alpha",
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
      headers: { "x-test-user-id": "user-alpha" },
    });
    await app.inject({
      method: "PATCH",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: { "x-test-user-id": "user-alpha" },
      payload: { fileName: "项目 A 审计说明书.docx" },
    });
    await app.inject({
      method: "DELETE",
      url: `/api/projects/project-alpha/documents/${document.id}`,
      headers: { "x-test-user-id": "user-alpha" },
    });
    await app.inject({
      method: "POST",
      url: `/api/projects/project-alpha/documents/${document.id}/restore`,
      headers: { "x-test-user-id": "user-alpha" },
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
