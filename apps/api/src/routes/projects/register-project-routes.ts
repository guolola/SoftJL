// Registers project and membership endpoints; business rules stay in auth store/guards.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModelSemanticError } from "@uml-platform/contracts";
import { normalizeWorkspaceModelState } from "../../normalizers/workspace/model-state.js";
import {
  projectInvitationAcceptResponseSchema,
  projectInvitationCreateRequestSchema,
  projectInvitationResponseSchema,
  projectCreateRequestSchema,
  projectListResponseSchema,
  projectMemberInviteRequestSchema,
  projectMemberResponseSchema,
  projectMembersResponseSchema,
  projectMemberUpdateRequestSchema,
  projectRetentionPolicyUpdateRequestSchema,
  projectResponseSchema,
  projectTransferOwnerRequestSchema,
  projectUpdateRequestSchema,
} from "@uml-platform/contracts";
import {
  isAuthError,
  isProjectPermissionError,
  requireAuth,
  requireProjectPermission,
} from "../../auth/guards.js";
import { toProjectDto, toProjectMemberDto } from "../../auth/dto.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import {
  buildTokenMail,
  createMailAdapterFromEnv,
  type MailAdapter,
} from "../../mail/mail-adapter.js";
import type { AcademicAdminRepository } from "../../db/academic-admin-repository.js";
import { refreshRunRecordIfAvailable, type RunRecordStore } from "../../runs/records/run-record-store.js";
import { isRestorableRunSnapshot } from "./workspace-snapshot-restore.js";
import {
  devTokenPayload,
  isWorkspaceSourceRunConstraintError,
  projectListPayload,
  projectPayload,
  projectWorkspaceBodyLimitBytes,
  projectWorkspacePayload,
  toProjectInvitationDto,
} from "../../projects/project-route-payloads.js";
import { requireProjectSettingsContext } from "../../projects/project-settings-access.js";

const projectWorkspaceSaveRequestSchema = z.object({
  baseVersion: z.number().int().min(0),
  state: z.record(z.string(), z.unknown()),
  sourceRunId: z.string().trim().min(1).nullable().optional(),
});

export function registerProjectRoutes({
  app,
  authStore,
  mailAdapter = createMailAdapterFromEnv(),
  nodeEnv = process.env.NODE_ENV ?? null,
  academicStore,
  runs,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  mailAdapter?: MailAdapter;
  nodeEnv?: string | null;
  academicStore?: AcademicAdminRepository;
  runs?: RunRecordStore;
}) {
  app.get("/api/academic-options", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    if (!academicStore) {
      return { organizations: [], courses: [], classes: [], teams: [] };
    }
    return {
      organizations: (await academicStore.listOrganizations()).filter(
        (item) => item.status === "active",
      ),
      courses: (await academicStore.listCourses()).filter((item) => item.status === "active"),
      classes: (await academicStore.listClasses()).filter((item) => item.status === "active"),
      teams: (await academicStore.listTeams()).filter((item) => item.status === "active"),
    };
  });

  app.get("/api/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const projects = await authStore.listProjectsForUser(auth.user.id);
    return projectListResponseSchema.parse({
      projects: await Promise.all(
        projects.map((project) => projectListPayload(authStore, project)),
      ),
    });
  });

  app.post("/api/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const parsedInput = projectCreateRequestSchema.safeParse(request.body);
    if (!parsedInput.success) {
      reply.code(400);
      return {
        message: "Invalid request body",
        issues: parsedInput.error.issues,
      };
    }
    const input = parsedInput.data;
    const { project, ownerMember } = await authStore.createProject({
      ownerUserId: auth.user.id,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      organizationId: input.organizationId ?? null,
      courseId: input.courseId ?? null,
      classId: input.classId ?? null,
      teamId: input.teamId ?? null,
      defaultProviderConfigId: null,
      retentionPolicy: input.retentionPolicy ?? "manual",
      backgroundKey: input.backgroundKey ?? null,
    });
    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "project.create",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
    });

    reply.code(201);
    return projectResponseSchema.parse(projectPayload({ project, member: ownerMember }));
  });

  app.get("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "view_project",
    );
    if (isProjectPermissionError(context)) return context;

    return projectResponseSchema.parse(projectPayload({ project: context.project, member: context.member }));
  });

  app.get("/api/projects/:projectId/workspace", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "view_project",
    );
    if (isProjectPermissionError(context)) return context;

    return projectWorkspacePayload(await authStore.getProjectWorkspace(projectId));
  });

  app.put(
    "/api/projects/:projectId/workspace",
    { bodyLimit: projectWorkspaceBodyLimitBytes() },
    async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "update_project",
    );
    if (isProjectPermissionError(context)) return context;

    const input = projectWorkspaceSaveRequestSchema.parse(request.body);
    let result: Awaited<ReturnType<AuthStore["saveProjectWorkspace"]>>;
    try {
      const currentWorkspace = await authStore.getProjectWorkspace(projectId);
      result = await authStore.saveProjectWorkspace({
        projectId,
        baseVersion: input.baseVersion,
        state: normalizeWorkspaceModelState(input.state, currentWorkspace.state),
        updatedByUserId: context.user.id,
        sourceRunId: input.sourceRunId ?? null,
      });
    } catch (error) {
      if (error instanceof ModelSemanticError) {
        reply.code(400);
        return { message: "模型未通过语义校验", diagnostics: error.diagnostics };
      }
      if (isWorkspaceSourceRunConstraintError(error)) {
        reply.code(400);
        return { message: "Source run not found for project workspace" };
      }
      throw error;
    }
    if (!result.ok) {
      reply.code(409);
      const current = projectWorkspacePayload(result.workspace);
      return {
        message: "项目已由其他成员更新，请刷新最新状态后再保存。",
        projectId,
        currentVersion: current.version,
        workspace: current,
      };
    }

    await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.workspace.update",
      targetType: "project",
      targetId: projectId,
      outcome: "success",
      message: input.sourceRunId ? `sourceRunId=${input.sourceRunId}` : undefined,
    });

    return projectWorkspacePayload(result.workspace);
    },
  );

  app.post("/api/projects/:projectId/runs/:runId/restore-workspace", async (request, reply) => {
    const { projectId, runId } = request.params as {
      projectId: string;
      runId: string;
    };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "update_project",
    );
    if (isProjectPermissionError(context)) return context;
    if (!runs) {
      reply.code(404);
      return { message: "Run history is not available" };
    }

    const record = await refreshRunRecordIfAvailable(runs, runId, { events: "none" });
    if (!record || record.metadata?.projectId !== projectId) {
      reply.code(404);
      return { message: "Run not found" };
    }
    if (!record.terminal) {
      reply.code(409);
      return { message: "运行尚未结束，暂不能恢复快照。" };
    }
    if (!isRestorableRunSnapshot(record.snapshot)) {
      reply.code(400);
      return { message: "说明书快照不能恢复为项目工作台。" };
    }
    reply.code(410);
    return {
      message:
        "历史快照暂仅支持查看，不能直接覆盖当前项目工作区。请重新运行对应阶段生成当前状态。",
    };
  });

  app.patch("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "update_project",
    );
    if (isProjectPermissionError(context)) return context;

    const parsedInput = projectUpdateRequestSchema.safeParse(request.body);
    if (!parsedInput.success) {
      reply.code(400);
      return {
        message: "Invalid request body",
        issues: parsedInput.error.issues,
      };
    }
    const input = parsedInput.data;
    const project = await authStore.updateProject(projectId, {
      ...input,
      defaultProviderConfigId: null,
    });
    if (!project) {
      reply.code(404);
      return { message: "Project not found" };
    }

    await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.update",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
    });

    return projectResponseSchema.parse(projectPayload({ project, member: context.member }));
  });

  app.post("/api/projects/:projectId/archive", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "manage_project_settings",
    );
    if (isProjectPermissionError(context)) return context;

    const project = await authStore.updateProject(projectId, { status: "archived" });
    if (!project) {
      reply.code(404);
      return { message: "Project not found" };
    }
    const auditLog = await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.archive",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
    });
    return {
      ...projectResponseSchema.parse(projectPayload({ project, member: context.member })),
      message: "Project archived",
      auditLog,
    };
  });

  app.post("/api/projects/:projectId/restore", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectSettingsContext(
      request,
      reply,
      authStore,
      projectId,
      { allowDeleted: true },
    );
    if (isProjectPermissionError(context)) return context;

    const project = await authStore.updateProject(projectId, { status: "active" });
    if (!project) {
      reply.code(404);
      return { message: "Project not found" };
    }
    const auditLog = await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.restore",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
    });
    return {
      ...projectResponseSchema.parse(projectPayload({ project, member: context.member })),
      message: "Project restored",
      auditLog,
    };
  });

  app.patch("/api/projects/:projectId/retention-policy", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "manage_project_settings",
    );
    if (isProjectPermissionError(context)) return context;

    const input = projectRetentionPolicyUpdateRequestSchema.parse(request.body);
    const project = await authStore.updateProject(projectId, {
      retentionPolicy: input.retentionPolicy,
    });
    if (!project) {
      reply.code(404);
      return { message: "Project not found" };
    }
    const auditLog = await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.retention_policy.update",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
      message: `Retention policy set to ${input.retentionPolicy}`,
    });
    return {
      ...projectResponseSchema.parse(projectPayload({ project, member: context.member })),
      message: "Project retention policy updated",
      auditLog,
    };
  });

  app.post("/api/projects/:projectId/transfer-owner", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "manage_project_settings",
    );
    if (isProjectPermissionError(context)) return context;

    const input = projectTransferOwnerRequestSchema.parse(request.body);
    const members = await authStore.listProjectMembers(projectId);
    const nextOwner = members.find(
      (member) => member.userId === input.newOwnerUserId && member.status === "active",
    );
    if (!nextOwner) {
      reply.code(400);
      return { message: "New owner must be an active project member" };
    }

    for (const member of members) {
      if (member.role === "owner" && member.id !== nextOwner.id) {
        await authStore.updateMember(member.id, { role: "editor" });
      }
    }
    const updatedOwnerMember = await authStore.updateMember(nextOwner.id, { role: "owner" });
    const project = await authStore.updateProject(projectId, {
      ownerUserId: input.newOwnerUserId,
    });
    if (!project || !updatedOwnerMember) {
      reply.code(404);
      return { message: "Project not found" };
    }

    const auditLog = await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.transfer_owner",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
      message: `Owner transferred to ${input.newOwnerUserId}`,
    });
    return {
      ...projectResponseSchema.parse(projectPayload({ project, member: updatedOwnerMember })),
      message: "Project owner transferred",
      auditLog,
    };
  });

  app.delete("/api/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "delete_project",
    );
    if (isProjectPermissionError(context)) return context;

    await authStore.updateProject(projectId, { status: "deleted" });
    await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.delete",
      targetType: "project",
      targetId: projectId,
      outcome: "success",
    });
    reply.code(204);
    return null;
  });

  app.get("/api/projects/:projectId/members", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "view_project",
    );
    if (isProjectPermissionError(context)) return context;

    return projectMembersResponseSchema.parse({
      members: (await authStore.listProjectMembers(projectId)).map(toProjectMemberDto),
    });
  });

  app.post("/api/projects/:projectId/invitations", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "invite_members",
    );
    if (isProjectPermissionError(context)) return context;

    const input = projectInvitationCreateRequestSchema.parse(request.body);
    if (await authStore.findProjectMemberByEmail(projectId, input.email)) {
      reply.code(409);
      return { message: "Project invitation already exists" };
    }

    const now = new Date().toISOString();
    const member = await authStore.createMember({
      projectId,
      userId: null,
      email: input.email,
      displayName: null,
      role: input.role,
      status: "invited",
      invitedByUserId: context.user.id,
      invitedAt: now,
      joinedAt: null,
    });
    const invitationToken = await authStore.createProjectInvitationToken({
      projectMemberId: member.id,
      createdByUserId: context.user.id,
    });
    await mailAdapter.send(
      buildTokenMail({
        email: member.email,
        purpose: "project_invitation",
        token: invitationToken.token,
        expiresAt: invitationToken.expiresAt,
        projectName: context.project.name,
      }),
    );

    await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.invitation.create",
      targetType: "project_member",
      targetId: member.id,
      outcome: "success",
    });

    reply.code(201);
    return projectInvitationResponseSchema.parse({
      invitation: toProjectInvitationDto({
        member,
        expiresAt: invitationToken.expiresAt,
      }),
      ...devTokenPayload(invitationToken.token, invitationToken.expiresAt, nodeEnv),
    });
  });

  app.post(
    "/api/projects/:projectId/invitations/:invitationId/resend",
    async (request, reply) => {
      const { projectId, invitationId } = request.params as {
        projectId: string;
        invitationId: string;
      };
      const context = await requireProjectPermission(
        request,
        reply,
        authStore,
        projectId,
        "invite_members",
      );
      if (isProjectPermissionError(context)) return context;

      const member = await authStore.getMember(invitationId);
      if (!member || member.projectId !== projectId || member.status !== "invited") {
        reply.code(404);
        return { message: "Project invitation not found" };
      }

      const invitationToken = await authStore.createProjectInvitationToken({
        projectMemberId: member.id,
        createdByUserId: context.user.id,
      });
      await mailAdapter.send(
        buildTokenMail({
          email: member.email,
          purpose: "project_invitation",
          token: invitationToken.token,
          expiresAt: invitationToken.expiresAt,
          projectName: context.project.name,
        }),
      );
      await authStore.recordAuditLog({
        actorUserId: context.user.id,
        action: "project.invitation.resend",
        targetType: "project_member",
        targetId: member.id,
        outcome: "success",
      });

      return projectInvitationResponseSchema.parse({
        invitation: toProjectInvitationDto({
          member,
          expiresAt: invitationToken.expiresAt,
        }),
        ...devTokenPayload(invitationToken.token, invitationToken.expiresAt, nodeEnv),
      });
    },
  );

  app.delete(
    "/api/projects/:projectId/invitations/:invitationId",
    async (request, reply) => {
      const { projectId, invitationId } = request.params as {
        projectId: string;
        invitationId: string;
      };
      const context = await requireProjectPermission(
        request,
        reply,
        authStore,
        projectId,
        "remove_members",
      );
      if (isProjectPermissionError(context)) return context;

      const member = await authStore.getMember(invitationId);
      if (!member || member.projectId !== projectId || member.status !== "invited") {
        reply.code(404);
        return { message: "Project invitation not found" };
      }

      await authStore.revokeProjectInvitationTokens(member.id);
      await authStore.deleteMember(member.id);
      await authStore.recordAuditLog({
        actorUserId: context.user.id,
        action: "project.invitation.revoke",
        targetType: "project_member",
        targetId: member.id,
        outcome: "success",
      });

      reply.code(204);
      return null;
    },
  );

  app.get("/api/invitations/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const invitation = await authStore.findActiveProjectInvitationToken(token);
    if (!invitation) {
      reply.code(404);
      return { message: "Project invitation token is invalid or expired" };
    }

    return projectInvitationResponseSchema.parse({
      invitation: toProjectInvitationDto({
        member: invitation.member,
        project: invitation.project,
        expiresAt: invitation.token.expiresAt,
      }),
      expiresAt: invitation.token.expiresAt,
    });
  });

  app.post("/api/invitations/:token/accept", async (request, reply) => {
    const { token } = request.params as { token: string };
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) {
      reply.code(401);
      return { message: "Log in to accept this project invitation" };
    }

    const result = await authStore.acceptProjectInvitationToken(token, auth.user);
    if (!result) {
      reply.code(400);
      return { message: "Project invitation token is invalid or expired" };
    }
    if ("error" in result) {
      reply.code(403);
      return { message: "Project invitation is for a different email address" };
    }

    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "project.invitation.accept",
      targetType: "project_member",
      targetId: result.member.id,
      outcome: "success",
    });

    return projectInvitationAcceptResponseSchema.parse({
      member: toProjectMemberDto(result.member),
    });
  });

  app.post("/api/projects/:projectId/members", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "invite_members",
    );
    if (isProjectPermissionError(context)) return context;

    const input = projectMemberInviteRequestSchema.parse(request.body);
    if (await authStore.findProjectMemberByEmail(projectId, input.email)) {
      reply.code(409);
      return { message: "Project member already exists" };
    }

    const user = await authStore.findUserByEmail(input.email);
    const now = new Date().toISOString();
    const member = await authStore.createMember({
      projectId,
      userId: user?.id ?? null,
      email: input.email,
      displayName: user?.displayName ?? null,
      role: input.role,
      status: user ? "active" : "invited",
      invitedByUserId: context.user.id,
      invitedAt: now,
      joinedAt: user ? now : null,
    });

    await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.member.invite",
      targetType: "project_member",
      targetId: member.id,
      outcome: "success",
    });

    reply.code(201);
    return projectMemberResponseSchema.parse({
      member: toProjectMemberDto(member),
    });
  });

  app.patch("/api/projects/:projectId/members/:memberId", async (request, reply) => {
    const { projectId, memberId } = request.params as {
      projectId: string;
      memberId: string;
    };
    const context = await requireProjectPermission(
      request,
      reply,
      authStore,
      projectId,
      "manage_members",
    );
    if (isProjectPermissionError(context)) return context;

    const member = await authStore.getMember(memberId);
    if (!member || member.projectId !== projectId) {
      reply.code(404);
      return { message: "Project member not found" };
    }

    const input = projectMemberUpdateRequestSchema.parse(request.body);
    if (
      member.role === "owner" &&
      input.role !== "owner" &&
      (await authStore.countOwners(projectId)) <= 1
    ) {
      reply.code(400);
      return { message: "Cannot remove the last project owner" };
    }
    if (input.role === "owner" && !member.userId) {
      reply.code(400);
      return { message: "Invited members cannot become owners before joining" };
    }

    const updated = await authStore.updateMember(memberId, { role: input.role });
    if (!updated) {
      reply.code(404);
      return { message: "Project member not found" };
    }
    if (updated.role === "owner" && updated.userId) {
      await authStore.updateProject(projectId, { ownerUserId: updated.userId });
    }

    await authStore.recordAuditLog({
      actorUserId: context.user.id,
      action: "project.member.update",
      targetType: "project_member",
      targetId: updated.id,
      outcome: "success",
    });

    return projectMemberResponseSchema.parse({
      member: toProjectMemberDto(updated),
    });
  });

  app.delete(
    "/api/projects/:projectId/members/:memberId",
    async (request, reply) => {
      const { projectId, memberId } = request.params as {
        projectId: string;
        memberId: string;
      };
      const context = await requireProjectPermission(
        request,
        reply,
        authStore,
        projectId,
        "remove_members",
      );
      if (isProjectPermissionError(context)) return context;

      const member = await authStore.getMember(memberId);
      if (!member || member.projectId !== projectId) {
        reply.code(404);
        return { message: "Project member not found" };
      }
      if (member.role === "owner" && (await authStore.countOwners(projectId)) <= 1) {
        reply.code(400);
        return { message: "Cannot remove the last project owner" };
      }

      await authStore.deleteMember(memberId);
      await authStore.recordAuditLog({
        actorUserId: context.user.id,
        action: "project.member.remove",
        targetType: "project_member",
        targetId: member.id,
        outcome: "success",
      });

      reply.code(204);
      return null;
    },
  );
}
