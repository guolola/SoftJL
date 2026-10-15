// Builds project route response payloads without owning endpoint authorization.
import {
  projectDtoSchema,
  projectInvitationDtoSchema,
  projectMemberRolePermissions,
} from "@uml-platform/contracts";
import { toProjectDto, toProjectMemberDto } from "../auth/dto.js";
import { isOfflineDemoProject } from "../runs/demo/offline-demo-runs.js";
import type {
  AuthStore,
  ProjectMemberRecord,
  ProjectRecord,
} from "../auth/in-memory-auth-store.js";

const DEFAULT_PROJECT_WORKSPACE_BODY_LIMIT_BYTES = 50 * 1024 * 1024;

const stableProjectWorkspaceDefaults = {
  requirementText: "",
  selectedDiagramTypes: [],
  rules: [],
  models: {},
  requirementReviewCandidates: {},
  requirementModelTraceability: [],
  generatedDiagramTypes: [],
  plantUml: {},
  svgArtifacts: {},
  diagramErrors: {},
  selectedDesignDiagramTypes: [],
  designModels: {},
  designModelTraceability: [],
  generatedDesignDiagramTypes: [],
  designPlantUml: {},
  designSvgArtifacts: {},
  designDiagramErrors: {},
  manualModelEditStatus: {},
  
  
  
  
  
  
  
  
  
  
  
  
  requirementInputFingerprint: null,
  diagramInputFingerprints: {},
  designInputFingerprints: {},
  rulesVersion: 0,
  rulesBasedOnTextVersion: null,
  diagramVersions: {},
} satisfies Record<string, unknown>;

export function projectWorkspaceBodyLimitBytes() {
  const parsed = Number(process.env.UML_PROJECT_WORKSPACE_BODY_LIMIT_BYTES);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_PROJECT_WORKSPACE_BODY_LIMIT_BYTES;
}

export function isWorkspaceSourceRunConstraintError(error: unknown) {
  const candidate = error as { code?: unknown; constraint?: unknown };
  return (
    candidate.code === "23503" &&
    candidate.constraint === "project_workspace_states_source_run_id_fkey"
  );
}

export function devTokenPayload(
  token: string,
  expiresAt: string,
  nodeEnv: string | null,
) {
  return nodeEnv === "production" ? { expiresAt } : { devToken: token, expiresAt };
}

export function projectWorkspacePayload(
  workspace: Awaited<ReturnType<AuthStore["getProjectWorkspace"]>>,
) {
  return {
    projectId: workspace.projectId,
    version: workspace.version,
    state: {
      ...stableProjectWorkspaceDefaults,
      ...workspace.state,
    },
    updatedByUserId: workspace.updatedByUserId,
    sourceRunId: workspace.sourceRunId,
    updatedAt: workspace.updatedAt,
  };
}

export function toProjectInvitationDto(input: {
  member: Parameters<typeof toProjectMemberDto>[0];
  expiresAt: string;
  project?: Parameters<typeof toProjectDto>[0];
}) {
  return projectInvitationDtoSchema.parse({
    id: input.member.id,
    projectId: input.member.projectId,
    email: input.member.email,
    role: input.member.role,
    status: input.member.status,
    invitedByUserId: input.member.invitedByUserId,
    invitedAt: input.member.invitedAt,
    expiresAt: input.expiresAt,
    createdAt: input.member.createdAt,
    updatedAt: input.member.updatedAt,
    project: input.project ? toProjectDto(input.project) : undefined,
  });
}

export function projectPayload(input: {
  project: Parameters<typeof toProjectDto>[0];
  member: Parameters<typeof toProjectMemberDto>[0];
}) {
  return {
    project: toProjectDto(input.project),
    generationExecutionMode: isOfflineDemoProject(input.project.id, input.project.name)
      ? "offline-demo" as const : "provider" as const,
    membership: toProjectMemberDto(input.member),
    currentUserRole: input.member.role,
    capabilities: projectMemberRolePermissions[input.member.role],
  };
}

function displayNameFromMember(member: ProjectMemberRecord) {
  return member.displayName?.trim() || member.email.split("@")[0] || member.userId || null;
}

function activeMemberPreviewSort(project: ProjectRecord) {
  return (left: ProjectMemberRecord, right: ProjectMemberRecord) => {
    if (left.userId === project.ownerUserId) return -1;
    if (right.userId === project.ownerUserId) return 1;
    return left.createdAt.localeCompare(right.createdAt);
  };
}

export async function projectListPayload(
  authStore: AuthStore,
  project: ProjectRecord,
) {
  const activeMembers = (await authStore.listProjectMembers(project.id))
    .filter((member) => member.status === "active")
    .sort(activeMemberPreviewSort(project));
  const ownerMember = activeMembers.find(
    (member) => member.userId === project.ownerUserId,
  );
  const ownerUser = await authStore.getUser(project.ownerUserId);
  const ownerDisplayName = ownerMember
    ? displayNameFromMember(ownerMember)
    : ownerUser?.displayName ?? ownerUser?.email ?? null;

  return projectDtoSchema.parse({
    ...project,
    ownerDisplayName,
    ownerAvatarUrl: ownerMember?.avatarUrl ?? ownerUser?.avatarUrl ?? null,
    memberCount: activeMembers.length,
    memberPreviews: activeMembers.slice(0, 3).map((member) => ({
      id: member.id,
      userId: member.userId,
      displayName: displayNameFromMember(member),
      avatarUrl: member.avatarUrl ?? null,
      role: member.role,
      status: member.status,
    })),
  });
}
