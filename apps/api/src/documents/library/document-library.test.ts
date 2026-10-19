import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  createFileDocumentLibrary,
} from "./document-library.js";

test("file document library persists generated documents and versions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({
      workspaceId: "workspace-a",
      documentKind: "requirementsSpec",
      sourceRunId: "run-1",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("docx"),
    });

    assert.equal(saved.title, "需求规格说明书");
    assert.equal(saved.workspaceId, "workspace-a");
    assert.equal(saved.version, 1);
    assert.equal((await library.listDocuments("workspace-a")).length, 1);
    assert.equal(
      (await library.getDocumentBuffer("workspace-a", saved.id))?.toString(),
      "docx",
    );
    assert.equal((await library.listDocuments("workspace-b")).length, 0);

    const second = await library.saveGeneratedDocument({
      workspaceId: "workspace-a",
      documentKind: "requirementsSpec",
      sourceRunId: "run-2",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("docx-2"),
    });
    assert.notEqual(second.id, saved.id);
    assert.equal(second.fileName, "需求规格说明书-2.docx");
    assert.equal(second.version, 1);
    assert.equal((await library.listDocuments("workspace-a")).length, 2);

    const updated = await library.updateDocumentBuffer(
      "workspace-a",
      saved.id,
      Buffer.from("edited"),
    );
    assert.equal(updated?.version, 2);
    assert.equal(
      (await library.getDocumentBuffer("workspace-a", saved.id))?.toString(),
      "edited",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("file document library stores project ownership metadata when provided", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);

    const saved = await library.saveGeneratedDocument({
      workspaceId: "workspace-project",
      projectId: "project-alpha",
      createdByUserId: "user-a",
      documentKind: "requirementsSpec",
      sourceRunId: "run-1",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("docx"),
    });

    assert.equal(saved.projectId, "project-alpha");
    assert.equal(saved.createdByUserId, "user-a");
    assert.equal(
      (await library.getDocument("workspace-project", saved.id))?.projectId,
      "project-alpha",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("file document library soft deletes and restores project documents", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({
      workspaceId: "workspace-project",
      projectId: "project-alpha",
      createdByUserId: "user-a",
      documentKind: "requirementsSpec",
      sourceRunId: "run-soft-delete",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("restorable docx"),
    });

    assert.equal(await library.deleteDocument("workspace-project", saved.id), true);
    assert.deepEqual(await library.listDocuments("workspace-project"), []);
    const restored = await library.restoreDocument("workspace-project", saved.id);
    assert.equal(restored?.id, saved.id);
    assert.equal((await library.listDocuments("workspace-project")).length, 1);
    assert.equal(
      (await library.getDocumentBuffer("workspace-project", saved.id))?.toString(),
      "restorable docx",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("file document library records document versions with project metadata", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({
      workspaceId: "workspace-project",
      projectId: "project-alpha",
      createdByUserId: "user-a",
      documentKind: "requirementsSpec",
      sourceRunId: "run-version-1",
      fileName: "需求规格说明书.docx",
      buffer: Buffer.from("version one"),
    });
    await library.updateDocumentBuffer(
      "workspace-project",
      saved.id,
      Buffer.from("version two"),
    );

    const versions = await library.listDocumentVersions(
      "workspace-project",
      saved.id,
    );
    assert.deepEqual(
      versions.map((version) => version.version),
      [2, 1],
    );
    assert.deepEqual(
      versions.map((version) => version.projectId),
      ["project-alpha", "project-alpha"],
    );
    assert.deepEqual(
      versions.map((version) => version.byteLength),
      [11, 11],
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("file document library does not synthesize missing version records", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({ workspaceId: "workspace-current", documentKind: "requirementsSpec",
      sourceRunId: "run-current", fileName: "需求规格说明书.docx", buffer: Buffer.from("docx") });
    await rm(join(rootDir, saved.workspaceId, saved.id, "versions"), { recursive: true });
    assert.deepEqual(await library.listDocumentVersions(saved.workspaceId, saved.id), []);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});
