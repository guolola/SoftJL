// Persists generated DOCX files for project-scoped preview, download, and version management.
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  documentLibraryItemSchema,
  documentLibraryVersionItemSchema,
  type DocumentKind,
  type DocumentLibraryItem,
  type DocumentLibraryVersionItem,
} from "@uml-platform/contracts";
import { documentTitle } from "../context/document-context.js";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCUMENT_FILE_NAME = "document.docx";
const METADATA_FILE_NAME = "metadata.json";
const VERSIONS_FOLDER_NAME = "versions";

function fileNameWithDuplicateSuffix(fileName: string, suffix: number) {
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, extensionIndex)}-${suffix}${fileName.slice(
    extensionIndex,
  )}`;
}
export interface DocumentLibrary {
  listDocuments(
    workspaceId: string,
    options?: { projectId?: string | null; includeDeleted?: boolean },
  ): Promise<DocumentLibraryItem[]>;
  listAllDocuments(options?: {
    projectId?: string | null;
    includeDeleted?: boolean;
  }): Promise<DocumentLibraryItem[]>;
  getDocument(
    workspaceId: string,
    documentId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<DocumentLibraryItem | null>;
  getDocumentBuffer(workspaceId: string, documentId: string): Promise<Buffer | null>;
  saveGeneratedDocument(input: {
    workspaceId: string;
    projectId?: string | null;
    createdByUserId?: string | null;
    documentKind: DocumentKind;
    sourceRunId: string | null;
    fileName: string;
    mimeType?: string | null;
    buffer: Buffer;
  }): Promise<DocumentLibraryItem>;
  updateDocumentBuffer(
    workspaceId: string,
    documentId: string,
    buffer: Buffer,
  ): Promise<DocumentLibraryItem | null>;
  renameDocument(
    workspaceId: string,
    documentId: string,
    fileName: string,
  ): Promise<DocumentLibraryItem | null>;
  deleteDocument(workspaceId: string, documentId: string): Promise<boolean>;
  restoreDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentLibraryItem | null>;
  listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentLibraryVersionItem[]>;
}

function safePathSegment(value: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    return null;
  }
  return value;
}

function workspaceFolder(rootDir: string, workspaceId: string) {
  const safeWorkspaceId = safePathSegment(workspaceId);
  if (!safeWorkspaceId) {
    throw new Error("Invalid workspace id");
  }
  return join(rootDir, safeWorkspaceId);
}

function documentFolder(rootDir: string, workspaceId: string, documentId: string) {
  const safeDocumentId = safePathSegment(documentId);
  if (!safeDocumentId) {
    throw new Error("Invalid document id");
  }
  return join(workspaceFolder(rootDir, workspaceId), safeDocumentId);
}

function metadataPath(rootDir: string, workspaceId: string, documentId: string) {
  return join(documentFolder(rootDir, workspaceId, documentId), METADATA_FILE_NAME);
}

function contentPath(rootDir: string, workspaceId: string, documentId: string) {
  return join(documentFolder(rootDir, workspaceId, documentId), DOCUMENT_FILE_NAME);
}

function versionsFolder(rootDir: string, workspaceId: string, documentId: string) {
  return join(
    documentFolder(rootDir, workspaceId, documentId),
    VERSIONS_FOLDER_NAME,
  );
}

function versionMetadataPath(
  rootDir: string,
  workspaceId: string,
  documentId: string,
  version: number,
) {
  return join(
    versionsFolder(rootDir, workspaceId, documentId),
    `${version}.json`,
  );
}

async function readDocumentMetadata(
  rootDir: string,
  workspaceId: string,
  documentId: string,
  options?: { includeDeleted?: boolean },
) {
  try {
    const raw = await readFile(metadataPath(rootDir, workspaceId, documentId), "utf8");
    const item = documentLibraryItemSchema.parse(JSON.parse(raw));
    if (!options?.includeDeleted && item.status === "deleted") return null;
    return item;
  } catch {
    return null;
  }
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

async function writeDocumentMetadata(rootDir: string, item: DocumentLibraryItem) {
  const folder = documentFolder(rootDir, item.workspaceId, item.id);
  await mkdir(folder, { recursive: true });
  await writeFile(
    metadataPath(rootDir, item.workspaceId, item.id),
    JSON.stringify(item, null, 2),
  );
}

async function writeDocumentVersion(rootDir: string, item: DocumentLibraryItem) {
  const folder = versionsFolder(rootDir, item.workspaceId, item.id);
  await mkdir(folder, { recursive: true });
  await writeFile(
    versionMetadataPath(rootDir, item.workspaceId, item.id, item.version),
    JSON.stringify(versionItemFromDocument(item), null, 2),
  );
}

async function writeDocument(
  rootDir: string,
  item: DocumentLibraryItem,
  buffer: Buffer,
  options?: { recordVersion?: boolean },
) {
  const folder = documentFolder(rootDir, item.workspaceId, item.id);
  await mkdir(folder, { recursive: true });
  await writeFile(contentPath(rootDir, item.workspaceId, item.id), buffer);
  await writeDocumentMetadata(rootDir, item);
  if (options?.recordVersion !== false) {
    await writeDocumentVersion(rootDir, item);
  }
}

export function createFileDocumentLibrary(rootDir: string): DocumentLibrary {

  async function listDocuments(
    workspaceId: string,
    options?: { projectId?: string | null; includeDeleted?: boolean },
  ) {
    const folder = workspaceFolder(rootDir, workspaceId);
    await mkdir(folder, { recursive: true });
    const entries = await readdir(folder, { withFileTypes: true });
    const documents = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          readDocumentMetadata(rootDir, workspaceId, entry.name, {
            includeDeleted: options?.includeDeleted,
          }),
        ),
    );
    return documents
      .filter((item): item is DocumentLibraryItem => Boolean(item))
      .filter(
        (item) =>
          !options ||
          options.projectId === undefined ||
          (item.projectId ?? null) === options.projectId,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function listAllDocuments(options?: {
    projectId?: string | null;
    includeDeleted?: boolean;
  }) {
    await mkdir(rootDir, { recursive: true });
    const workspaces = await readdir(rootDir, { withFileTypes: true });
    const nested = await Promise.all(
      workspaces
        .filter((entry) => entry.isDirectory())
        .map((entry) => listDocuments(entry.name, options).catch(() => [])),
    );
    return nested
      .flat()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function getDocument(
    workspaceId: string,
    documentId: string,
    options?: { includeDeleted?: boolean },
  ) {
    return readDocumentMetadata(rootDir, workspaceId, documentId, options);
  }

  async function getDocumentBuffer(workspaceId: string, documentId: string) {
    const document = await getDocument(workspaceId, documentId);
    if (!document) return null;
    try {
      return await readFile(contentPath(rootDir, workspaceId, documentId));
    } catch {
      return null;
    }
  }

  async function saveGeneratedDocument(input: {
    workspaceId: string;
    projectId?: string | null;
    createdByUserId?: string | null;
    documentKind: DocumentKind;
    sourceRunId: string | null;
    fileName: string;
    mimeType?: string | null;
    buffer: Buffer;
  }) {
    const now = new Date().toISOString();
    const existingNames = new Set(
      (await listDocuments(input.workspaceId)).map((document) => document.fileName),
    );
    let fileName = input.fileName;
    for (let suffix = 2; existingNames.has(fileName); suffix += 1) {
      fileName = fileNameWithDuplicateSuffix(input.fileName, suffix);
    }
    const item = documentLibraryItemSchema.parse({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      documentKind: input.documentKind,
      title: documentTitle(input.documentKind),
      fileName,
      mimeType: input.mimeType ?? DOCX_MIME_TYPE,
      byteLength: input.buffer.byteLength,
      version: 1,
      status: "active",
      sourceRunId: input.sourceRunId,
      createdAt: now,
      updatedAt: now,
    });
    await writeDocument(rootDir, item, input.buffer);
    return item;
  }

  async function updateDocumentBuffer(
    workspaceId: string,
    documentId: string,
    buffer: Buffer,
  ) {
    const existing = await getDocument(workspaceId, documentId);
    if (!existing) return null;
    const item = documentLibraryItemSchema.parse({
      ...existing,
      byteLength: buffer.byteLength,
      version: existing.version + 1,
      status: "active",
      updatedAt: new Date().toISOString(),
    });
    await writeDocument(rootDir, item, buffer);
    return item;
  }

  async function renameDocument(
    workspaceId: string,
    documentId: string,
    fileName: string,
  ) {
    const existing = await getDocument(workspaceId, documentId);
    if (!existing) return null;
    const item = documentLibraryItemSchema.parse({
      ...existing,
      fileName,
      updatedAt: new Date().toISOString(),
    });
    const buffer = await getDocumentBuffer(workspaceId, documentId);
    if (!buffer) return null;
    await writeDocument(rootDir, item, buffer, { recordVersion: false });
    return item;
  }

  async function deleteDocument(workspaceId: string, documentId: string) {
    const existing = await getDocument(workspaceId, documentId);
    if (!existing) return false;
    const item = documentLibraryItemSchema.parse({
      ...existing,
      status: "deleted",
      updatedAt: new Date().toISOString(),
    });
    await writeDocumentMetadata(rootDir, item);
    return true;
  }

  async function restoreDocument(workspaceId: string, documentId: string) {
    const existing = await getDocument(workspaceId, documentId, {
      includeDeleted: true,
    });
    if (!existing) return null;
    const item = documentLibraryItemSchema.parse({
      ...existing,
      status: "active",
      updatedAt: new Date().toISOString(),
    });
    await writeDocumentMetadata(rootDir, item);
    return item;
  }

  async function listDocumentVersions(workspaceId: string, documentId: string) {
    const document = await getDocument(workspaceId, documentId, {
      includeDeleted: true,
    });
    if (!document) return [];
    try {
      const entries = await readdir(versionsFolder(rootDir, workspaceId, documentId), {
        withFileTypes: true,
      });
      const versions = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map(async (entry) => {
            try {
              const raw = await readFile(
                join(versionsFolder(rootDir, workspaceId, documentId), entry.name),
                "utf8",
              );
              return documentLibraryVersionItemSchema.parse(JSON.parse(raw));
            } catch {
              return null;
            }
          }),
      );
      const parsed = versions.filter(
        (version): version is DocumentLibraryVersionItem => Boolean(version),
      );
      return parsed.sort((left, right) => right.version - left.version);
    } catch {
      return [];
    }
  }

  return {
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
  };
}
