// Verifies the PostgreSQL document repository while file storage remains the blob backend.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { DocumentLibraryItem } from "@uml-platform/contracts";
import type { Queryable } from "../../db/transactions.js";
import {
  createFileDocumentLibrary,
  type DocumentLibrary,
} from "./document-library.js";
import { createPostgresDocumentLibrary } from "./postgres-document-library.js";

interface DocumentRecordRow {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  created_by_user_id: string | null;
  document_kind: string;
  title: string;
  file_name: string | null;
  mime_type: string;
  byte_length: number | null;
  version: number;
  status: string;
  run_id: string | null;
  source_run_id: string | null;
  storage_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface DocumentVersionRow {
  document_id: string;
  workspace_id: string | null;
  project_id: string | null;
  created_by_user_id: string | null;
  version: number;
  file_name: string | null;
  mime_type: string;
  byte_length: number | null;
  source_run_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

class FakeDocumentDb implements Queryable {
  readonly records = new Map<string, DocumentRecordRow>();
  readonly versions: DocumentVersionRow[] = [];

  async query<T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ) {
    if (sql.includes("document_records:insert")) {
      const row: DocumentRecordRow = {
        id: String(params[0]),
        workspace_id: String(params[1]),
        project_id: params[2] === null ? null : String(params[2]),
        created_by_user_id: params[3] === null ? null : String(params[3]),
        document_kind: String(params[4]),
        title: String(params[5]),
        file_name: String(params[6]),
        mime_type: String(params[7]),
        byte_length: Number(params[8]),
        version: Number(params[9]),
        status: String(params[10]),
        run_id: params[11] === null ? null : String(params[11]),
        source_run_id: params[11] === null ? null : String(params[11]),
        storage_key: String(params[12]),
        metadata: JSON.parse(String(params[13])) as Record<string, unknown>,
        created_at: String(params[14]),
        updated_at: String(params[15]),
      };
      this.records.set(row.id, row);
      return { rows: [row] as T[], rowCount: 1 };
    }

    if (sql.includes("document_record_versions:insert")) {
      const row: DocumentVersionRow = {
        document_id: String(params[0]),
        workspace_id: String(params[1]),
        project_id: params[2] === null ? null : String(params[2]),
        created_by_user_id: params[3] === null ? null : String(params[3]),
        version: Number(params[4]),
        file_name: String(params[5]),
        mime_type: String(params[6]),
        byte_length: Number(params[7]),
        source_run_id: params[8] === null ? null : String(params[8]),
        metadata: JSON.parse(String(params[10])) as Record<string, unknown>,
        created_at: String(params[11]),
      };
      this.versions.push(row);
      return { rows: [row] as T[], rowCount: 1 };
    }

    if (sql.includes("document_records:list_by_workspace")) {
      const [workspaceId, projectId, includeDeleted, filterProject] = params;
      return {
        rows: this.sortedRecords().filter(
          (row) =>
            row.workspace_id === workspaceId &&
            (includeDeleted || row.status !== "deleted") &&
            (!filterProject || row.project_id === projectId),
        ) as T[],
        rowCount: 0,
      };
    }

    if (sql.includes("document_records:list_all")) {
      const [projectId, includeDeleted, filterProject] = params;
      return {
        rows: this.sortedRecords().filter(
          (row) =>
            (includeDeleted || row.status !== "deleted") &&
            (!filterProject || row.project_id === projectId),
        ) as T[],
        rowCount: 0,
      };
    }

    if (sql.includes("document_records:get_by_workspace")) {
      const [workspaceId, documentId, includeDeleted] = params;
      const row = this.records.get(String(documentId));
      const rows =
        row &&
        row.workspace_id === workspaceId &&
        (includeDeleted || row.status !== "deleted")
          ? [row]
          : [];
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (sql.includes("document_records:update_buffer")) {
      const [documentId, byteLength, version, updatedAt] = params;
      const row = this.mustRecord(String(documentId));
      row.byte_length = Number(byteLength);
      row.version = Number(version);
      row.status = "active";
      row.updated_at = String(updatedAt);
      return { rows: [row] as T[], rowCount: 1 };
    }

    if (sql.includes("document_records:rename")) {
      const [documentId, fileName, updatedAt] = params;
      const row = this.mustRecord(String(documentId));
      row.file_name = String(fileName);
      row.updated_at = String(updatedAt);
      return { rows: [row] as T[], rowCount: 1 };
    }

    if (sql.includes("document_records:set_status")) {
      const [documentId, status, updatedAt] = params;
      const row = this.mustRecord(String(documentId));
      row.status = String(status);
      row.updated_at = String(updatedAt);
      return { rows: [row] as T[], rowCount: 1 };
    }

    if (sql.includes("document_record_versions:list")) {
      const [documentId] = params;
      const rows = this.versions
        .filter((row) => row.document_id === documentId)
        .sort((left, right) => right.version - left.version);
      return { rows: rows as T[], rowCount: rows.length };
    }

    throw new Error(`Unhandled fake document query: ${sql}`);
  }

  private sortedRecords() {
    return [...this.records.values()].sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    );
  }

  private mustRecord(documentId: string) {
    const row = this.records.get(documentId);
    if (!row) throw new Error(`Missing fake document ${documentId}`);
    return row;
  }
}

async function createLibrary(rootDir: string): Promise<{
  db: FakeDocumentDb;
  library: DocumentLibrary;
}> {
  const blobStorage = createFileDocumentLibrary(rootDir);
  await blobStorage.authenticateWorkspace({
    workspaceId: "workspace-postgres",
    workspaceSecret: "workspace-postgres-secret-value-123456",
  });
  const db = new FakeDocumentDb();
  return {
    db,
    library: createPostgresDocumentLibrary({ db, blobStorage }),
  };
}

test("postgres document library uses DB metadata as the document source of truth", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-postgres-documents-"));
  try {
    const { db, library } = await createLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({
      workspaceId: "workspace-postgres",
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-alpha",
      fileName: "原始说明书.docx",
      buffer: Buffer.from("db-backed docx"),
    });
    db.records.get(saved.id)!.file_name = "DB 事实源说明书.docx";

    const listed = await library.listAllDocuments({ projectId: "project-alpha" });
    assert.deepEqual(
      listed.map((document) => document.fileName),
      ["DB 事实源说明书.docx"],
    );
    assert.equal(
      (await library.getDocumentBuffer("workspace-postgres", saved.id))?.toString(),
      "db-backed docx",
    );

    const renamed = await library.renameDocument(
      "workspace-postgres",
      saved.id,
      "重命名说明书.docx",
    );
    assert.equal(renamed?.fileName, "重命名说明书.docx");
    assert.equal(
      (await library.getDocument("workspace-postgres", saved.id))?.fileName,
      "重命名说明书.docx",
    );

    assert.equal(await library.deleteDocument("workspace-postgres", saved.id), true);
    assert.deepEqual(await library.listDocuments("workspace-postgres"), []);
    assert.equal(
      (await library.listDocuments("workspace-postgres", {
        includeDeleted: true,
      }))[0]?.status,
      "deleted",
    );

    const restored = await library.restoreDocument("workspace-postgres", saved.id);
    assert.equal(restored?.status, "active");
    assert.equal(
      (await library.listDocuments("workspace-postgres"))[0]?.id,
      saved.id,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("postgres document library records DB versions when document buffers change", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-postgres-documents-"));
  try {
    const { library } = await createLibrary(rootDir);
    const saved = await library.saveGeneratedDocument({
      workspaceId: "workspace-postgres",
      projectId: "project-alpha",
      createdByUserId: "user-alpha",
      documentKind: "requirementsSpec",
      sourceRunId: "run-version-1",
      fileName: "版本说明书.docx",
      buffer: Buffer.from("version one"),
    });

    await library.updateDocumentBuffer(
      "workspace-postgres",
      saved.id,
      Buffer.from("version two"),
    );

    const versions = await library.listDocumentVersions(
      "workspace-postgres",
      saved.id,
    );
    assert.deepEqual(
      versions.map((version) => ({
        version: version.version,
        fileName: version.fileName,
        projectId: version.projectId,
        byteLength: version.byteLength,
      })),
      [
        {
          version: 2,
          fileName: "版本说明书.docx",
          projectId: "project-alpha",
          byteLength: 11,
        },
        {
          version: 1,
          fileName: "版本说明书.docx",
          projectId: "project-alpha",
          byteLength: 11,
        },
      ],
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("postgres document library delegates legacy workspace authentication to blob storage", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "uml-postgres-documents-"));
  try {
    const { library } = await createLibrary(rootDir);

    await assert.rejects(
      () =>
        library.authenticateWorkspace({
          workspaceId: "workspace-postgres",
          workspaceSecret: "workspace-postgres-secret-value-changed",
        }),
      /Workspace secret mismatch/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
