// Provides cookie-based user/project API calls for the first authenticated pages.
import { buildApiUrl } from "../../../services/api-client";
import type {
  DesignDiagramKind,
  DiagramKind,
  DocumentKind,
  OnboardingStateResponse,
  OnboardingTour,
  OnboardingTourOutcome,
  ProviderModelCapabilityMap,
  ProviderModelDiscoveryResponse,
  ProviderModelDiscoveryProgressEvent,
} from "@uml-platform/contracts";
import type { RunError } from "@uml-platform/contracts";
import type { ProjectBackgroundKey } from "@uml-platform/contracts";
import type { RunHistorySnapshot } from "../../../entities/run-history";
import {
  isRequestAbort,
  localizeApiFailure,
  localizeNetworkFailure,
} from "../../../shared/i18n/api-errors";

export const AUTH_SESSION_CHANGED_EVENT = "uml-auth-session-changed";

export function notifyAuthSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export interface PlatformUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  status: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  systemRoles?: string[];
}

export interface PlatformProject {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  status: string;
  ownerUserId: string;
  ownerDisplayName?: string | null;
  ownerAvatarUrl?: string | null;
  organizationId?: string | null;
  courseId?: string | null;
  classId?: string | null;
  teamId?: string | null;
  defaultProviderConfigId?: string | null;
  retentionPolicy?: "manual" | "semester_180_days" | "one_year_365_days" | string;
  backgroundKey?: ProjectBackgroundKey | null;
  createdAt?: string;
  updatedAt: string;
  lastGeneratedAt?: string | null;
  memberCount?: number;
  memberPreviews?: PlatformProjectMemberPreview[];
  courseLabel?: string | null;
  classLabel?: string | null;
  teamLabel?: string | null;
}

export interface PlatformProjectMemberPreview {
  id: string;
  userId: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  role: string;
  status: string;
}

export interface PlatformProjectMember {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  role: string;
  status: string;
  invitedAt?: string | null;
  joinedAt?: string | null;
}

export interface PlatformProjectInvitation {
  id: string;
  projectId: string;
  email: string;
  role: string;
  status: "invited" | "active" | "expired" | "revoked" | string;
  invitedAt?: string | null;
  expiresAt?: string | null;
  project?: PlatformProject;
}

export interface PlatformRunSummary {
  runId: string;
  projectId?: string;
  status: string;
  stage?: string | null;
  runKind?: "requirements" | "design" | "document" | string | null;
  documentKind?: DocumentKind | null;
  selectedDiagrams?: DiagramKind[] | DesignDiagramKind[] | null;
  requestedDiagrams?: DesignDiagramKind[] | null;
  model?: string | null;
  createdByUserId?: string | null;
  sourceRunId?: string | null;
  sourceAction?: "retry" | "rerun" | string | null;
  sourceRunStatus?: string | null;
  derivedRunIds?: string[] | null;
  latestAction?: "retry" | "rerun" | string | null;
  latestActionRunId?: string | null;
  latestActionAt?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  errorMessage?: string | null;
  error?: RunError | null;
  
  
  
  terminal?: boolean | null;
  snapshotAvailable?: boolean | null;
  canRestore?: boolean | null;
  documentDownloadAvailable?: boolean | null;
  documentId?: string | null;
  documentFileName?: string | null;
  documentVersion?: number | null;
  documentStatus?: string | null;
  documentRestoreAvailable?: boolean | null;
  documentByteLength?: number | null;
}

export interface PlatformDocument {
  id: string;
  projectId?: string;
  name?: string;
  title?: string;
  fileName?: string;
  type?: string;
  documentKind?: DocumentKind | string | null;
  status: string;
  version?: number;
  byteLength?: number | null;
  onlyOffice?: {
    status?: string | null;
    lockedBy?: string | null;
    lockedAt?: string | null;
  } | null;
  editLock?: {
    status?: string | null;
    lockedBy?: string | null;
    lockedAt?: string | null;
  } | null;
  download?: {
    status?: string | null;
    url?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformDocumentVersion {
  version: number;
  fileName: string;
  byteLength?: number | null;
  createdAt?: string | null;
  projectId?: string | null;
}

export interface PlatformProviderConfig {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  defaultModel?: string;
  allowedModels?: string[];
  modelCapabilities?: Record<
    string,
    {
      id?: string;
      supportsJsonSchema?: boolean;
      supportsJsonObject?: boolean;
      structuredOutputMode?: "strict_json" | "json_object" | "compatible";
      modeLabel?: string;
    }
  >;
  maskedKey: string;
  keyPurpose: string;
  status: string;
  riskState: string;
  quota: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  allowlisted: boolean;
  scopeType: string;
  scopeId: string | null;
}

export interface PlatformAcademicOptionsResponse {
  organizations: Array<{ id: string; name: string; code?: string | null; status: string }>;
  courses: Array<{
    id: string;
    organizationId: string;
    name: string;
    code?: string | null;
    term?: string | null;
    status: string;
  }>;
  classes: Array<{
    id: string;
    courseId: string;
    name: string;
    code?: string | null;
    status: string;
  }>;
  teams: Array<{
    id: string;
    classId: string;
    name: string;
    code?: string | null;
    status: string;
  }>;
}

export interface PlatformSessionResponse {
  user?: PlatformUser;
  session?: PlatformAccountSession;
  mfaChallenge?: PlatformMfaChallenge;
  mfa?: {
    required?: boolean;
    challengeId?: string;
    expiresAt?: string;
    method?: string;
  };
}

export interface PlatformAccountSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  locationLabel?: string | null;
  region?: string | null;
}

export interface PlatformLoginEvent {
  id: string;
  userId: string | null;
  email: string | null;
  outcome: "success" | "failure";
  ipAddress: string | null;
  userAgent: string | null;
  locationLabel?: string | null;
  region?: string | null;
  message: string | null;
  createdAt: string;
}

export interface PlatformProjectListResponse {
  projects: PlatformProject[];
}

export interface PlatformMfaChallenge {
  challengeId: string;
  expiresAt?: string;
}

export interface PlatformMfaSetup {
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}

export interface PlatformMfaState {
  enabled: boolean;
  enforcement: "totp" | "placeholder" | "none";
}

export interface PlatformAccountProfileResponse {
  user: PlatformUser;
  session: PlatformAccountSession;
  mfa?: PlatformMfaState;
  generationUsage?: {
    usedToday: number;
    limit: number | null;
    remaining: number | null;
    windowSeconds: number;
    limited: boolean;
    scope: "user" | "visitor";
  };
}

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
    public readonly retryable = false,
    public readonly params: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}

async function fetchPlatformResponse(input: RequestInfo | URL, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (isRequestAbort(error)) throw error;
    throw new PlatformApiError(
      localizeNetworkFailure(),
      0,
      "NETWORK_FAILURE",
      true,
    );
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetchPlatformResponse(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Non-JSON failures use the localized HTTP fallback.
    }
    const nested = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: unknown }).error
      : null;
    const structured = nested && typeof nested === "object"
      ? nested as Record<string, unknown>
      : null;
    const params = structured?.params && typeof structured.params === "object"
      ? Object.fromEntries(Object.entries(structured.params as Record<string, unknown>).filter(
          ([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value),
        )) as Record<string, string | number | boolean | null>
      : {};
    const code = typeof structured?.code === "string"
      ? structured.code
      : legacyApiErrorCode(payload, response.status);
    throw new PlatformApiError(
      localizeApiFailure(code && !structured ? { error: { code } } : payload, response.status),
      response.status,
      code,
      structured?.retryable === true,
      params,
    );
  }

  if (response.status === 204) {
    return {} as T;
  }
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

async function requestBlob(path: string, init: RequestInit = {}) {
  const response = await fetchPlatformResponse(buildApiUrl(path), {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Non-JSON failures use the localized HTTP fallback.
    }
    throw new PlatformApiError(localizeApiFailure(payload, response.status), response.status);
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const quotedMatch = disposition.match(/filename="?([^";]+)"?/);
  return {
    blob: await response.blob(),
    fileName: utf8Match
      ? decodeURIComponent(utf8Match[1])
      : quotedMatch?.[1] ?? "download",
  };
}

async function requestFormJson<T>(path: string, body: FormData): Promise<T> {
  const response = await fetchPlatformResponse(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    body,
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Non-JSON failures use the localized HTTP fallback.
    }
    throw new PlatformApiError(localizeApiFailure(payload, response.status), response.status);
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

function flushProviderDiscoverySseChunk(
  chunk: string,
  onEvent: (event: ProviderModelDiscoveryProgressEvent) => void,
) {
  const data = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data) return;
  onEvent(JSON.parse(data) as ProviderModelDiscoveryProgressEvent);
}

async function requestProviderModelDiscoveryStream(
  input: { baseUrl: string; apiKey: string },
  onEvent: (event: ProviderModelDiscoveryProgressEvent) => void,
) {
  const response = await fetchPlatformResponse(buildApiUrl("/api/provider-configs/discover-models/stream"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Non-JSON failures use the localized HTTP fallback.
    }
    throw new PlatformApiError(localizeApiFailure(payload, response.status), response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("模型发现进度流不可用");

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        flushProviderDiscoverySseChunk(chunk, onEvent);
      }
      if (done) break;
    }
    if (buffer.trim()) {
      flushProviderDiscoverySseChunk(buffer, onEvent);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// Converts known legacy natural-language responses into stable codes during API migration.
function legacyApiErrorCode(payload: unknown, status: number) {
  if (!payload || typeof payload !== "object") return null;
  const message = typeof (payload as { message?: unknown }).message === "string"
    ? (payload as { message: string }).message
    : "";
  if ((status === 401 || status === 403) && /email verification (?:is )?required|verify (?:your )?email/iu.test(message)) {
    return "AUTH_EMAIL_VERIFICATION_REQUIRED";
  }
  if (status === 401 && /invalid (?:email|username|credentials)|incorrect (?:email|username|password)/iu.test(message)) {
    return "AUTH_INVALID_CREDENTIALS";
  }
  return null;
}

export const platformApi = {
  me() {
    return requestJson<PlatformAccountProfileResponse>("/api/auth/me");
  },
  getAccountProfile() {
    return requestJson<PlatformAccountProfileResponse>("/api/account/profile");
  },
  getOnboardingState() {
    return requestJson<OnboardingStateResponse>("/api/account/onboarding");
  },
  saveOnboardingOutcome(tour: OnboardingTour, outcome: OnboardingTourOutcome) {
    return requestJson<OnboardingStateResponse>("/api/account/onboarding", {
      method: "PUT",
      body: JSON.stringify({ tour, outcome }),
    });
  },
  updateAccountProfile(input: { displayName: string; avatarUrl?: string | null }) {
    return requestJson<PlatformAccountProfileResponse>("/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  changePassword(input: { currentPassword: string; newPassword: string }) {
    return requestJson<PlatformSessionResponse>("/api/account/security", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  uploadAccountAvatar(file: File) {
    const formData = new FormData();
    formData.append("avatar", file);
    return requestFormJson<PlatformAccountProfileResponse>(
      "/api/account/avatar",
      formData,
    );
  },
  login(input: { identifier: string; password: string }) {
    return requestJson<PlatformSessionResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  register(input: {
    email: string;
    username: string;
    password: string;
    displayName: string;
    invitationToken?: string;
  }) {
    return requestJson<PlatformSessionResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  logout() {
    return requestJson<{ message?: string }>("/api/auth/logout", {
      method: "POST",
    });
  },
  verifyEmail(input: { token: string }) {
    return requestJson<{ message?: string; user?: PlatformUser }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  resendVerification(input: { email: string }) {
    return requestJson<{ message: string }>("/api/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  forgotPassword(input: { email: string }) {
    return requestJson<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  resetPassword(input: { token: string; newPassword: string }) {
    return requestJson<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  verifyMfa(input: { challengeId: string; code: string }) {
    return requestJson<PlatformSessionResponse>("/api/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  inspectInvitation(token: string) {
    return requestJson<{ invitation: PlatformProjectInvitation; expiresAt: string }>(
      `/api/invitations/${encodeURIComponent(token)}`,
    );
  },
  acceptInvitation(token: string) {
    return requestJson<{ message?: string; member?: PlatformProjectMember }>(
      `/api/invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST" },
    );
  },
  listAccountSessions() {
    return requestJson<{ sessions: PlatformAccountSession[] }>(
      "/api/account/sessions",
    );
  },
  revokeOtherSessions() {
    return requestJson<{ revokedCount: number }>(
      "/api/account/sessions/revoke-others",
      { method: "POST" },
    );
  },
  listLoginEvents() {
    return requestJson<{ events: PlatformLoginEvent[] }>(
      "/api/account/login-events",
    );
  },
  setupMfa() {
    return requestJson<PlatformMfaSetup>("/api/account/mfa/setup", {
      method: "POST",
    });
  },
  confirmMfa(input: { code: string }) {
    return requestJson<{ mfa: PlatformMfaState }>("/api/account/mfa/confirm", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateMfa(input: { enabled: false; code?: string }) {
    return requestJson<{ mfa: PlatformMfaState }>("/api/account/mfa", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  listProjects() {
    return requestJson<PlatformProjectListResponse>("/api/projects");
  },
  listAcademicOptions() {
    return requestJson<PlatformAcademicOptionsResponse>("/api/academic-options");
  },
  createProject(input: {
    name: string;
    description: string | null;
    visibility?: string;
    organizationId?: string | null;
    courseId?: string | null;
    classId?: string | null;
    teamId?: string | null;
    defaultProviderConfigId?: string | null;
    retentionPolicy?: string;
    backgroundKey?: ProjectBackgroundKey | null;
  }) {
    return requestJson<{ project: PlatformProject }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  createCaseProject(caseId: string) {
    return requestJson<{ project: PlatformProject }>(
      `/api/cases/${encodeURIComponent(caseId)}/project`,
      { method: "POST" },
    );
  },
  getProject(projectId: string) {
    return requestJson<{
      project: PlatformProject;
      generationExecutionMode?: "offline-demo" | "provider";
      membership?: PlatformProjectMember | null;
    }>(`/api/projects/${projectId}`);
  },
  updateProject(
    projectId: string,
    input: {
      name?: string;
      description?: string | null;
      visibility?: string;
      status?: string;
      organizationId?: string | null;
      courseId?: string | null;
      classId?: string | null;
      teamId?: string | null;
      defaultProviderConfigId?: string | null;
      retentionPolicy?: string;
      backgroundKey?: ProjectBackgroundKey | null;
    },
  ) {
    return requestJson<{ project: PlatformProject }>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  deleteProject(projectId: string) {
    return requestJson<{ message?: string }>(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
  },
  archiveProject(projectId: string) {
    return requestJson<{ project: PlatformProject; message?: string; auditLog?: unknown }>(
      `/api/projects/${projectId}/archive`,
      { method: "POST" },
    );
  },
  restoreProject(projectId: string) {
    return requestJson<{ project: PlatformProject; message?: string; auditLog?: unknown }>(
      `/api/projects/${projectId}/restore`,
      { method: "POST" },
    );
  },
  transferProjectOwner(projectId: string, newOwnerUserId: string) {
    return requestJson<{ project: PlatformProject; message?: string; auditLog?: unknown }>(
      `/api/projects/${projectId}/transfer-owner`,
      {
        method: "POST",
        body: JSON.stringify({ newOwnerUserId }),
      },
    );
  },
  updateProjectRetentionPolicy(projectId: string, retentionPolicy: string) {
    return requestJson<{ project: PlatformProject; message?: string; auditLog?: unknown }>(
      `/api/projects/${projectId}/retention-policy`,
      {
        method: "PATCH",
        body: JSON.stringify({ retentionPolicy }),
      },
    );
  },
  listProjectMembers(projectId: string) {
    return requestJson<{ members: PlatformProjectMember[] }>(
      `/api/projects/${projectId}/members`,
    );
  },
  inviteProjectMember(
    projectId: string,
    input: { email: string; role: string },
  ) {
    return requestJson<{ invitation?: PlatformProjectInvitation; member?: PlatformProjectMember }>(
      `/api/projects/${projectId}/invitations`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  resendProjectInvitation(projectId: string, invitationId: string) {
    return requestJson<{ invitation?: PlatformProjectInvitation; member?: PlatformProjectMember }>(
      `/api/projects/${projectId}/invitations/${invitationId}/resend`,
      { method: "POST" },
    );
  },
  revokeProjectInvitation(projectId: string, invitationId: string) {
    return requestJson<{ message?: string }>(
      `/api/projects/${projectId}/invitations/${invitationId}`,
      { method: "DELETE" },
    );
  },
  updateProjectMemberRole(projectId: string, memberId: string, role: string) {
    return requestJson<{ member: PlatformProjectMember }>(
      `/api/projects/${projectId}/members/${memberId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    );
  },
  removeProjectMember(projectId: string, memberId: string) {
    return requestJson<{ message?: string }>(
      `/api/projects/${projectId}/members/${memberId}`,
      { method: "DELETE" },
    );
  },
  listProjectRuns(projectId: string) {
    return requestJson<{
      generatedAt?: string;
      projectId: string;
      runs: PlatformRunSummary[];
    }>(`/api/projects/${projectId}/runs`);
  },
  getProjectRun(projectId: string, runId: string, options: { includeEvents?: boolean; signal?: AbortSignal } = {}) {
    return requestJson<{
      projectId: string;
      run: PlatformRunSummary;
      snapshot?: RunHistorySnapshot;
      events?: unknown[];
    }>(`/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}${options.includeEvents ? '?includeEvents=true' : ''}`, { signal: options.signal });
  },
  cancelProjectRun(projectId: string, runId: string) {
    return requestJson<{
      run?: PlatformRunSummary;
      runId?: string;
      status?: string;
      message?: string;
    }>(
      `/api/projects/${projectId}/runs/${runId}/cancel`,
      { method: "POST" },
    );
  },
  retryProjectRun(projectId: string, runId: string) {
    return requestJson<{
      run?: PlatformRunSummary;
      runId?: string;
      sourceRunId?: string;
      action?: "retry" | "rerun" | string;
      status?: string;
      message?: string;
    }>(
      `/api/projects/${projectId}/runs/${runId}/retry`,
      { method: "POST" },
    );
  },
  rerunProjectRun(projectId: string, runId: string) {
    return requestJson<{
      run?: PlatformRunSummary;
      runId?: string;
      sourceRunId?: string;
      action?: "retry" | "rerun" | string;
      status?: string;
      message?: string;
    }>(
      `/api/projects/${projectId}/runs/${runId}/rerun`,
      { method: "POST" },
    );
  },
  deleteProjectRun(projectId: string, runId: string) {
    return requestJson<{ message?: string }>(
      `/api/projects/${projectId}/runs/${runId}`,
      { method: "DELETE" },
    );
  },
  listProjectDocuments(projectId: string) {
    return requestJson<{ documents: PlatformDocument[] }>(
      `/api/projects/${projectId}/documents`,
    );
  },
  renameProjectDocument(projectId: string, documentId: string, name: string) {
    return requestJson<{ document: PlatformDocument }>(
      `/api/projects/${projectId}/documents/${documentId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fileName: name }),
      },
    );
  },
  deleteProjectDocument(projectId: string, documentId: string) {
    return requestJson<{ message?: string }>(
      `/api/projects/${projectId}/documents/${documentId}`,
      { method: "DELETE" },
    );
  },
  restoreProjectDocument(projectId: string, documentId: string) {
    return requestJson<{ document: PlatformDocument }>(
      `/api/projects/${projectId}/documents/${documentId}/restore`,
      { method: "POST" },
    );
  },
  listProjectDocumentVersions(projectId: string, documentId: string) {
    return requestJson<{ versions: PlatformDocumentVersion[] }>(
      `/api/projects/${projectId}/documents/${documentId}/versions`,
    );
  },
  downloadProjectDocument(projectId: string, documentId: string) {
    return requestBlob(
      `/api/projects/${projectId}/documents/${documentId}/download`,
    );
  },
  listProviderConfigs() {
    return requestJson<{
      generatedAt?: string;
      providerConfigs: PlatformProviderConfig[];
    }>("/api/provider-configs");
  },
  listProjectProviderConfigs(projectId: string) {
    return requestJson<{
      generatedAt?: string;
      projectId?: string;
      providerConfigs: PlatformProviderConfig[];
    }>(`/api/projects/${projectId}/provider-configs`);
  },
  discoverProviderModels(input: { baseUrl: string; apiKey: string }) {
    return requestJson<ProviderModelDiscoveryResponse>(
      "/api/provider-configs/discover-models",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  discoverProviderModelsStream(
    input: { baseUrl: string; apiKey: string },
    onEvent: (event: ProviderModelDiscoveryProgressEvent) => void,
  ) {
    return requestProviderModelDiscoveryStream(input, onEvent);
  },
  testTemporaryProviderConfig(input: {
    baseUrl: string;
    apiKey: string;
    model: string;
  }) {
    return requestJson<{ ok?: boolean; message?: string }>(
      "/api/provider-configs/test-temporary",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  createProviderConfig(input: {
    name: string;
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
    allowedModels: string[];
    modelCapabilities?: ProviderModelCapabilityMap;
  }) {
    return requestJson<PlatformProviderConfig>("/api/provider-configs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateProviderConfig(
    providerConfigId: string,
    input: {
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      allowedModels?: string[];
      modelCapabilities?: ProviderModelCapabilityMap;
    },
  ) {
    return requestJson<PlatformProviderConfig>(
      `/api/provider-configs/${providerConfigId}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },
  revokeProviderConfig(providerConfigId: string) {
    return requestJson<PlatformProviderConfig>(
      `/api/provider-configs/${providerConfigId}/revoke`,
      { method: "POST" },
    );
  },
  testProviderConfig(providerConfigId: string, model?: string) {
    return requestJson<{ ok?: boolean; message?: string }>(
      `/api/provider-configs/${providerConfigId}/test`,
      {
        method: "POST",
        body: JSON.stringify(model?.trim() ? { model: model.trim() } : {}),
      },
    );
  },
};
