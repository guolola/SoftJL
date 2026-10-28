import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
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
    assert.equal((await library.listAllDocuments()).length, 1);
    assert.equal(
      (await library.getDocumentBuffer("workspace-a", saved.id))?.toString(),
      "docx",
    );
    assert.equal(await library.getDocument("workspace-b", saved.id), null);

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
    assert.equal((await library.listAllDocuments()).length, 2);

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
    assert.deepEqual(await library.listAllDocuments(), []);
    const restored = await library.restoreDocument("workspace-project", saved.id);
    assert.equal(restored?.id, saved.id);
    assert.equal((await library.listAllDocuments()).length, 1);
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

test("file document reads reject obsolete metadata without rewriting or hiding it", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({ workspaceId: "workspace-current", documentKind: "requirementsSpec",
      sourceRunId: "run-current", fileName: "document.docx", buffer: Buffer.from("docx") });
    const path = join(rootDir, saved.workspaceId, saved.id, "metadata.json");
    const { fileName, ...obsolete } = saved;
    const raw = JSON.stringify(obsolete);
    await writeFile(path, raw);
    await assert.rejects(library.getDocument(saved.workspaceId, saved.id), /fileName/);
    await assert.rejects(library.listAllDocuments(), /fileName/);
    assert.equal(await readFile(path, "utf8"), raw);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});

test("file document version reads reject obsolete entries without rewriting them", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({ workspaceId: "workspace-current", documentKind: "requirementsSpec",
      sourceRunId: "run-current", fileName: "document.docx", buffer: Buffer.from("docx") });
    const path = join(rootDir, saved.workspaceId, saved.id, "versions", "1.json");
    const entry = JSON.parse(await readFile(path, "utf8"));
    delete entry.fileName;
    const raw = JSON.stringify(entry);
    await writeFile(path, raw);
    await assert.rejects(library.listDocumentVersions(saved.workspaceId, saved.id), /fileName/);
    assert.equal(await readFile(path, "utf8"), raw);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});

for (const blockedFile of ["metadata.json", "2.json"]) {
  test(`document readers see complete revisions while ${blockedFile} is being written`, async (t) => {
    const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
    let releaseWrite = () => {};
    let pendingWrite: Promise<unknown> | undefined;
    try {
      const library = createFileDocumentLibrary(rootDir);
      const saved = await library.saveGeneratedDocument({ workspaceId: "workspace-current", documentKind: "requirementsSpec",
        sourceRunId: "run-current", fileName: "document.docx", buffer: Buffer.from("docx") });
      const originalWriteFile = fs.writeFile;
      let writeStarted = () => {};
      const started = new Promise<void>(resolve => { writeStarted = resolve; });
      const released = new Promise<void>(resolve => { releaseWrite = resolve; });
      // Hold the file open after truncation: direct writes would expose empty JSON here.
      t.mock.method(fs, "writeFile", async (...args: Parameters<typeof fs.writeFile>) => {
        const path = args[0];
        if (typeof path !== "string" || !path.includes(blockedFile)) return originalWriteFile(...args);
        const file = await fs.open(path, "w");
        writeStarted();
        try { await released; await file.writeFile(args[1], args[2]); }
        finally { await file.close(); }
      });
      syncBuiltinESMExports();
      pendingWrite = library.updateDocumentBuffer(saved.workspaceId, saved.id, Buffer.from("updated"));
      await started;
      const current = await library.getDocument(saved.workspaceId, saved.id);
      assert.equal(current?.version, blockedFile === "metadata.json" ? 1 : 2);
      assert.equal((await library.listAllDocuments())[0]?.id, saved.id);
      assert.deepEqual((await library.listDocumentVersions(saved.workspaceId, saved.id)).map(item => item.version), [1]);
      releaseWrite();
      await pendingWrite;
      assert.deepEqual((await library.listDocumentVersions(saved.workspaceId, saved.id)).map(item => item.version), [2, 1]);
      assert.ok((await fs.readdir(rootDir, { recursive: true })).every(path => !path.endsWith(".tmp")));
    } finally {
      releaseWrite();
      await pendingWrite?.catch(() => undefined);
      t.mock.restoreAll();
      syncBuiltinESMExports();
      await rm(rootDir, { recursive: true, force: true });
    }
  });
}

test("failed metadata publication keeps the prior revision and removes the temporary file", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-documents-"));
  try {
    const library = createFileDocumentLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({ workspaceId: "workspace-current", documentKind: "requirementsSpec",
      sourceRunId: "run-current", fileName: "document.docx", buffer: Buffer.from("docx") });
    t.mock.method(fs, "rename", async () => { throw new Error("publication failed"); });
    syncBuiltinESMExports();
    await assert.rejects(library.renameDocument(saved.workspaceId, saved.id, "renamed.docx"), /publication failed/);
    assert.deepEqual(await library.getDocument(saved.workspaceId, saved.id), saved);
    assert.ok((await fs.readdir(rootDir, { recursive: true })).every(path => !path.endsWith(".tmp")));
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await rm(rootDir, { recursive: true, force: true });
  }
});
