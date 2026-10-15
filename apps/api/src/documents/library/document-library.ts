// Persists generated DOCX files so editor services can load and save them by URL.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  documentLibraryItemSchema,
  documentLibraryVersionItemSchema,
  onlyOfficeEditorConfigResponseSchema,
  type DocumentKind,
  type DocumentLibraryItem,
  type DocumentLibraryVersionItem,
  type OnlyOfficeEditorConfigResponse,
  type OnlyOfficeUiTheme,
} from "@uml-platform/contracts";
import { documentTitle } from "../context/document-context.js";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCUMENT_FILE_NAME = "document.docx";
const METADATA_FILE_NAME = "metadata.json";
const VERSIONS_FOLDER_NAME = "versions";
const WORKSPACE_SECRET_FILE_NAME = "workspace-secret.json";

function fileNameWithDuplicateSuffix(fileName: string, suffix: number) {
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, extensionIndex)}-${suffix}${fileName.slice(
    extensionIndex,
  )}`;
}
const ONLYOFFICE_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

export type OnlyOfficeDocumentAccessPurpose = "file" | "callback";

export interface DocumentWorkspaceCredentials {
  workspaceId: string;
  workspaceSecret: string;
}

export interface DocumentLibrary {
  authenticateWorkspace(
    credentials: DocumentWorkspaceCredentials,
  ): Promise<{ workspaceId: string }>;
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
    sourceRunId: string;
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
  createOnlyOfficeConfig(input: {
    document: DocumentLibraryItem;
    publicBaseUrl: string;
    documentServerUrl: string;
    accessTokenSecret: string;
    userId?: string | null;
    uiTheme?: OnlyOfficeUiTheme;
    jwtSecret?: string;
  }): OnlyOfficeEditorConfigResponse;
  verifyOnlyOfficeAccessToken(input: {
    documentId: string;
    purpose: OnlyOfficeDocumentAccessPurpose;
    token: string | null | undefined;
    accessTokenSecret: string;
  }): { workspaceId: string; projectId: string | null; userId: string | null } | null;
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function safePathSegment(value: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    return null;
  }
  return value;
}

function safeContextId(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
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

function workspaceSecretPath(rootDir: string, workspaceId: string) {
  return join(workspaceFolder(rootDir, workspaceId), WORKSPACE_SECRET_FILE_NAME);
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

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(
    normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="),
    "base64",
  ).toString("utf8");
}

function signJwt(payload: unknown, secret: string) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64Url(signature)}`;
}

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function workspaceSecretHash(workspaceId: string, workspaceSecret: string) {
  return hmac(workspaceSecret, `uml-workspace:${workspaceId}`);
}

export function createSignedDocumentAccessToken(input: {
  workspaceId: string;
  documentId: string;
  purpose: OnlyOfficeDocumentAccessPurpose;
  secret: string;
  projectId?: string | null;
  userId?: string | null;
  expiresAt?: number;
}) {
  const payload = {
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    purpose: input.purpose,
    projectId: input.projectId ?? null,
    userId: input.userId ?? null,
    expiresAt: input.expiresAt ?? Date.now() + ONLYOFFICE_ACCESS_TOKEN_TTL_MS,
    nonce: base64Url(randomBytes(12)),
  };
  const body = base64Url(JSON.stringify(payload));
  const signature = hmac(body, input.secret);
  return `${body}.${signature}`;
}

export function verifySignedDocumentAccessToken(input: {
  documentId: string;
  purpose: OnlyOfficeDocumentAccessPurpose;
  token: string | null | undefined;
  secret: string;
}) {
  if (!input.token) return null;
  const [body, signature] = input.token.split(".");
  if (!body || !signature) return null;
  if (!constantTimeEqual(hmac(body, input.secret), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as {
      workspaceId?: unknown;
      documentId?: unknown;
      purpose?: unknown;
      projectId?: unknown;
      userId?: unknown;
      expiresAt?: unknown;
    };
    const projectId = payload.projectId ?? null;
    const userId = payload.userId ?? null;
    if (
      typeof payload.workspaceId !== "string" ||
      typeof payload.documentId !== "string" ||
      typeof payload.purpose !== "string" ||
      typeof payload.expiresAt !== "number" ||
      (projectId !== null && typeof projectId !== "string") ||
      (userId !== null && typeof userId !== "string") ||
      payload.documentId !== input.documentId ||
      payload.purpose !== input.purpose ||
      payload.expiresAt < Date.now() ||
      !safePathSegment(payload.workspaceId) ||
      (typeof projectId === "string" && !safeContextId(projectId)) ||
      (typeof userId === "string" && !safeContextId(userId))
    ) {
      return null;
    }
    return {
      workspaceId: payload.workspaceId,
      projectId: typeof projectId === "string" ? projectId : null,
      userId: typeof userId === "string" ? userId : null,
    };
  } catch {
    return null;
  }
}

function appendAccessToken(url: string, token: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}accessToken=${encodeURIComponent(token)}`;
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
  async function authenticateWorkspace(
    credentials: DocumentWorkspaceCredentials,
  ) {
    const workspaceId = credentials.workspaceId.trim();
    const workspaceSecret = credentials.workspaceSecret.trim();
    if (!safePathSegment(workspaceId) || workspaceSecret.length < 24) {
      throw new Error("Invalid workspace credentials");
    }

    const folder = workspaceFolder(rootDir, workspaceId);
    const secretPath = workspaceSecretPath(rootDir, workspaceId);
    const nextHash = workspaceSecretHash(workspaceId, workspaceSecret);
    await mkdir(folder, { recursive: true });

    try {
      const raw = await readFile(secretPath, "utf8");
      const existing = JSON.parse(raw) as { secretHash?: unknown };
      if (
        typeof existing.secretHash !== "string" ||
        !constantTimeEqual(existing.secretHash, nextHash)
      ) {
        throw new Error("Workspace secret mismatch");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Workspace secret mismatch") {
        throw error;
      }
      await writeFile(
        secretPath,
        JSON.stringify({ workspaceId, secretHash: nextHash }, null, 2),
      );
    }

    return { workspaceId };
  }

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
    sourceRunId: string;
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
      if (parsed.length > 0) {
        return parsed.sort((left, right) => right.version - left.version);
      }
    } catch {
      // Older metadata has no version folder; expose its current state as v1.
    }
    return [versionItemFromDocument(document)];
  }

  function verifyOnlyOfficeAccessToken(input: {
    documentId: string;
    purpose: OnlyOfficeDocumentAccessPurpose;
    token: string | null | undefined;
    accessTokenSecret: string;
  }) {
    return verifySignedDocumentAccessToken({
      documentId: input.documentId,
      purpose: input.purpose,
      token: input.token,
      secret: input.accessTokenSecret,
    });
  }

  function createOnlyOfficeConfig(input: {
    document: DocumentLibraryItem;
    publicBaseUrl: string;
    documentServerUrl: string;
    accessTokenSecret: string;
    userId?: string | null;
    uiTheme?: OnlyOfficeUiTheme;
    jwtSecret?: string;
  }) {
    const publicBaseUrl = normalizeBaseUrl(input.publicBaseUrl);
    const fileUrl = `${publicBaseUrl}/api/documents/${input.document.id}/file/${encodeURIComponent(
      input.document.fileName,
    )}`;
    const callbackUrl = `${publicBaseUrl}/api/documents/${input.document.id}/onlyoffice/callback`;
    const config = {
      documentType: "word",
      document: {
        fileType: "docx",
        key: `${input.document.id}-v${input.document.version}`,
        title: input.document.fileName,
        url: appendAccessToken(
          fileUrl,
          createSignedDocumentAccessToken({
            workspaceId: input.document.workspaceId,
            documentId: input.document.id,
            purpose: "file",
            projectId: input.document.projectId ?? null,
            userId: input.userId ?? input.document.createdByUserId ?? null,
            secret: input.accessTokenSecret,
          }),
        ),
        permissions: {
          download: true,
          edit: true,
          print: true,
        },
      },
      editorConfig: {
        callbackUrl: appendAccessToken(
          callbackUrl,
          createSignedDocumentAccessToken({
            workspaceId: input.document.workspaceId,
            documentId: input.document.id,
            purpose: "callback",
            projectId: input.document.projectId ?? null,
            userId: input.userId ?? input.document.createdByUserId ?? null,
            secret: input.accessTokenSecret,
          }),
        ),
        lang: "zh-CN",
        mode: "edit",
        customization: {
          uiTheme: input.uiTheme ?? "theme-dark",
        },
        user: {
          id: "uml-platform-user",
          name: "UML 用户",
        },
      },
    };
    const signedConfig = input.jwtSecret
      ? { ...config, token: signJwt(config, input.jwtSecret) }
      : config;
    return onlyOfficeEditorConfigResponseSchema.parse({
      document: input.document,
      documentServerUrl: normalizeBaseUrl(input.documentServerUrl),
      config: signedConfig,
    });
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
