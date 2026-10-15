// Stores document metadata in PostgreSQL while delegating DOCX blobs to a storage backend.
import {
  documentLibraryItemSchema,
  documentLibraryVersionItemSchema,
  type DocumentLibraryItem,
  type DocumentLibraryVersionItem,
} from "@uml-platform/contracts";
import type { Queryable } from "../../db/transactions.js";
import type {
  DocumentLibrary,
  DocumentWorkspaceCredentials,
  OnlyOfficeDocumentAccessPurpose,
} from "./document-library.js";

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
  source_run_id?: string | null;
  storage_key: string;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
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
  metadata: unknown;
  created_at: Date | string;
}

export interface PostgresDocumentLibraryOptions {
  db: Queryable;
  blobStorage: DocumentLibrary;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function storageKeyForDocument(item: DocumentLibraryItem) {
  return `${item.workspaceId}/${item.id}/document.docx`;
}

function rowToDocumentItem(row: DocumentRecordRow) {
  const metadata = readMetadata(row.metadata);
  const workspaceId = row.workspace_id ?? readString(metadata.workspaceId);
  const fileName = row.file_name ?? readString(metadata.fileName);
  if (!workspaceId || !fileName) return null;

  return documentLibraryItemSchema.parse({
    id: row.id,
    workspaceId,
    projectId: row.project_id,
    createdByUserId: row.created_by_user_id,
    documentKind: row.document_kind,
    title: row.title,
    fileName,
    mimeType: row.mime_type,
    byteLength:
      row.byte_length ??
      (typeof metadata.byteLength === "number" ? metadata.byteLength : 0),
    version: row.version,
    status: row.status,
    sourceRunId:
      row.source_run_id ??
      row.run_id ??
      readString(metadata.sourceRunId) ??
      null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function rowToVersionItem(row: DocumentVersionRow) {
  const metadata = readMetadata(row.metadata);
  const workspaceId = row.workspace_id ?? readString(metadata.workspaceId);
  const fileName = row.file_name ?? readString(metadata.fileName);
  if (!workspaceId || !fileName) return null;

  return documentLibraryVersionItemSchema.parse({
    documentId: row.document_id,
    workspaceId,
    projectId: row.project_id,
    createdByUserId: row.created_by_user_id,
    version: row.version,
    fileName,
    mimeType: row.mime_type,
    byteLength:
      row.byte_length ??
      (typeof metadata.byteLength === "number" ? metadata.byteLength : 0),
    sourceRunId: row.source_run_id ?? readString(metadata.sourceRunId) ?? null,
    createdAt: toIsoString(row.created_at),
  });
}

function versionItemFromDocument(
  item: DocumentLibraryItem,
): DocumentLibraryVersionItem {
  return documentLibraryVersionItemSchema.parse({
    documentId: item.id,
    workspaceId: item.workspaceId,
    projectId: item.projectId ?? null,
    createdByUserId: item.createdByUserId ?? null,
    version: item.version,
    fileName: item.fileName,
    mimeType: item.mimeType,
    byteLength: item.byteLength,
    sourceRunId: item.sourceRunId,
    createdAt: item.updatedAt,
  });
}

function metadataForDocument(item: DocumentLibraryItem) {
  return {
    workspaceId: item.workspaceId,
    fileName: item.fileName,
    byteLength: item.byteLength,
    sourceRunId: item.sourceRunId,
  };
}

async function recordDocument(db: Queryable, item: DocumentLibraryItem) {
  await db.query(
    `
      /* document_records:insert */
      insert into document_records (
        id, workspace_id, project_id, created_by_user_id, document_kind, title,
        file_name, mime_type, byte_length, version, status, run_id, source_run_id,
        storage_key, metadata, created_at, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $12,
        $13, $14::jsonb, $15, $16
      )
      on conflict (id) do update set
        workspace_id = excluded.workspace_id,
        project_id = excluded.project_id,
        created_by_user_id = excluded.created_by_user_id,
        document_kind = excluded.document_kind,
        title = excluded.title,
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        byte_length = excluded.byte_length,
        version = excluded.version,
        status = excluded.status,
        run_id = excluded.run_id,
        source_run_id = excluded.source_run_id,
        storage_key = excluded.storage_key,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `,
    [
      item.id,
      item.workspaceId,
      item.projectId ?? null,
      item.createdByUserId ?? null,
      item.documentKind,
      item.title,
      item.fileName,
      item.mimeType,
      item.byteLength,
      item.version,
      item.status,
      item.sourceRunId,
      storageKeyForDocument(item),
      JSON.stringify(metadataForDocument(item)),
      item.createdAt,
      item.updatedAt,
    ],
  );
}

async function recordVersion(db: Queryable, item: DocumentLibraryItem) {
  await db.query(
    `
      /* document_record_versions:insert */
      insert into document_record_versions (
        document_id, workspace_id, project_id, created_by_user_id, version,
        file_name, mime_type, byte_length, source_run_id, storage_key, metadata,
        created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
      on conflict (document_id, version) do update set
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        byte_length = excluded.byte_length,
        source_run_id = excluded.source_run_id,
        storage_key = excluded.storage_key,
        metadata = excluded.metadata
    `,
    [
      item.id,
      item.workspaceId,
      item.projectId ?? null,
      item.createdByUserId ?? null,
      item.version,
      item.fileName,
      item.mimeType,
      item.byteLength,
      item.sourceRunId,
      storageKeyForDocument(item),
      JSON.stringify(metadataForDocument(item)),
      item.updatedAt,
    ],
  );
}

async function listRows(
  db: Queryable,
  options: {
    workspaceId?: string;
    projectId?: string | null;
    filterProject?: boolean;
    includeDeleted?: boolean;
  },
) {
  const result = options.workspaceId
    ? await db.query<DocumentRecordRow>(
        `
          /* document_records:list_by_workspace */
          select id, workspace_id, project_id, created_by_user_id, document_kind,
            title, file_name, mime_type, byte_length, version, status, run_id,
            source_run_id, storage_key, metadata, created_at, updated_at
          from document_records
          where workspace_id = $1
            and ($4::boolean = false or project_id is not distinct from $2)
            and ($3::boolean = true or status <> 'deleted')
          order by updated_at desc
        `,
        [
          options.workspaceId,
          options.projectId ?? null,
          options.includeDeleted === true,
          options.filterProject === true,
        ],
      )
    : await db.query<DocumentRecordRow>(
        `
          /* document_records:list_all */
          select id, workspace_id, project_id, created_by_user_id, document_kind,
            title, file_name, mime_type, byte_length, version, status, run_id,
            source_run_id, storage_key, metadata, created_at, updated_at
          from document_records
          where ($3::boolean = false or project_id is not distinct from $1)
            and ($2::boolean = true or status <> 'deleted')
          order by updated_at desc
        `,
        [
          options.projectId ?? null,
          options.includeDeleted === true,
          options.filterProject === true,
        ],
      );

  return result.rows
    .map(rowToDocumentItem)
    .filter((item): item is DocumentLibraryItem => Boolean(item));
}

export function createPostgresDocumentLibrary({
  db,
  blobStorage,
}: PostgresDocumentLibraryOptions): DocumentLibrary {
  async function authenticateWorkspace(credentials: DocumentWorkspaceCredentials) {
    return blobStorage.authenticateWorkspace(credentials);
  }

  async function listDocuments(
    workspaceId: string,
    options?: { projectId?: string | null; includeDeleted?: boolean },
  ) {
    return listRows(db, {
      workspaceId,
      projectId: options?.projectId ?? null,
      filterProject: options?.projectId !== undefined,
      includeDeleted: options?.includeDeleted,
    });
  }

  async function listAllDocuments(options?: {
    projectId?: string | null;
    includeDeleted?: boolean;
  }) {
    return listRows(db, {
      projectId: options?.projectId ?? null,
      filterProject: options?.projectId !== undefined,
      includeDeleted: options?.includeDeleted,
    });
  }

  async function getDocument(
    workspaceId: string,
    documentId: string,
    options?: { includeDeleted?: boolean },
  ) {
    const result = await db.query<DocumentRecordRow>(
      `
        /* document_records:get_by_workspace */
        select id, workspace_id, project_id, created_by_user_id, document_kind,
          title, file_name, mime_type, byte_length, version, status, run_id,
          source_run_id, storage_key, metadata, created_at, updated_at
        from document_records
        where workspace_id = $1
          and id = $2
          and ($3::boolean = true or status <> 'deleted')
        limit 1
      `,
      [workspaceId, documentId, options?.includeDeleted === true],
    );
    return result.rows[0] ? rowToDocumentItem(result.rows[0]) : null;
  }

  async function getDocumentBuffer(workspaceId: string, documentId: string) {
    const document = await getDocument(workspaceId, documentId);
    if (!document) return null;
    return blobStorage.getDocumentBuffer(document.workspaceId, document.id);
  }

  async function saveGeneratedDocument(input: Parameters<DocumentLibrary["saveGeneratedDocument"]>[0]) {
    const stored = await blobStorage.saveGeneratedDocument(input);
    await recordDocument(db, stored);
    await recordVersion(db, stored);
    return stored;
  }

  async function updateDocumentBuffer(
    workspaceId: string,
    documentId: string,
    buffer: Buffer,
  ) {
    const existing = await getDocument(workspaceId, documentId);
    if (!existing) return null;
    const stored = await blobStorage.updateDocumentBuffer(workspaceId, documentId, buffer);
    if (!stored) return null;
    const now = new Date().toISOString();
    const item = documentLibraryItemSchema.parse({
      ...existing,
      byteLength: buffer.byteLength,
      version: existing.version + 1,
      status: "active",
      updatedAt: now,
    });
    await db.query(
      `
        /* document_records:update_buffer */
        update document_records
        set byte_length = $2,
          version = $3,
          status = 'active',
          metadata = jsonb_set(
            jsonb_set(metadata, '{byteLength}', to_jsonb($2::integer), true),
            '{fileName}', to_jsonb(file_name),
            true
          ),
          updated_at = $4
        where id = $1
      `,
      [documentId, item.byteLength, item.version, item.updatedAt],
    );
    await recordVersion(db, item);
    return item;
  }

  async function renameDocument(
    workspaceId: string,
    documentId: string,
    fileName: string,
  ) {
    const existing = await getDocument(workspaceId, documentId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const item = documentLibraryItemSchema.parse({
      ...existing,
      fileName,
      updatedAt: now,
    });
    await db.query(
      `
        /* document_records:rename */
        update document_records
        set file_name = $2,
          metadata = jsonb_set(metadata, '{fileName}', to_jsonb($2::text), true),
          updated_at = $3
        where id = $1
      `,
      [documentId, fileName, now],
    );
    return item;
  }

  async function deleteDocument(workspaceId: string, documentId: string) {
    const existing = await getDocument(workspaceId, documentId);
    if (!existing) return false;
    await db.query(
      `
        /* document_records:set_status */
        update document_records
        set status = $2, updated_at = $3
        where id = $1
      `,
      [documentId, "deleted", new Date().toISOString()],
    );
    return true;
  }

  async function restoreDocument(workspaceId: string, documentId: string) {
    const existing = await getDocument(workspaceId, documentId, {
      includeDeleted: true,
    });
    if (!existing) return null;
    const now = new Date().toISOString();
    const item = documentLibraryItemSchema.parse({
      ...existing,
      status: "active",
      updatedAt: now,
    });
    await db.query(
      `
        /* document_records:set_status */
        update document_records
        set status = $2, updated_at = $3
        where id = $1
      `,
      [documentId, "active", now],
    );
    return item;
  }

  async function listDocumentVersions(workspaceId: string, documentId: string) {
    const document = await getDocument(workspaceId, documentId, {
      includeDeleted: true,
    });
    if (!document) return [];
    const result = await db.query<DocumentVersionRow>(
      `
        /* document_record_versions:list */
        select document_id, workspace_id, project_id, created_by_user_id, version,
          file_name, mime_type, byte_length, source_run_id, metadata, created_at
        from document_record_versions
        where document_id = $1
        order by version desc
      `,
      [documentId],
    );
    const versions = result.rows
      .map(rowToVersionItem)
      .filter((item): item is DocumentLibraryVersionItem => Boolean(item));
    return versions.length > 0 ? versions : [versionItemFromDocument(document)];
  }

  function createOnlyOfficeConfig(
    input: Parameters<DocumentLibrary["createOnlyOfficeConfig"]>[0],
  ) {
    return blobStorage.createOnlyOfficeConfig(input);
  }

  function verifyOnlyOfficeAccessToken(input: {
    documentId: string;
    purpose: OnlyOfficeDocumentAccessPurpose;
    token: string | null | undefined;
    accessTokenSecret: string;
  }) {
    return blobStorage.verifyOnlyOfficeAccessToken(input);
  }

  return {
    authenticateWorkspace,
    listDocuments,
    listAllDocuments,
    getDocument,
    getDocumentBuffer,
    saveGeneratedDocument,
    updateDocumentBuffer,
    renameDocument,
    deleteDocument,
    restoreDocument,
    listDocumentVersions,
    createOnlyOfficeConfig,
    verifyOnlyOfficeAccessToken,
  };
}
