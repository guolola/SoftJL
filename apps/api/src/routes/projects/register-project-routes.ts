// Registers project and membership endpoints; business rules stay in auth store/guards.
import { createHttpErrorResponse } from "../../server/http-error-response.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ModelSemanticError } from "@uml-platform/contracts";
import { normalizeWorkspaceModelState } from "../../normalizers/workspace/model-state.js";

import {
  projectInvitationCreateRequestSchema,
  projectInvitationResponseSchema,
  projectInviteeSearchQuerySchema,
  projectInviteeSearchResponseSchema,
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
import { toProjectMemberDto } from "../../auth/dto.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import {
  isWorkspaceSourceRunConstraintError,
  projectListPayload,
  projectPayload,
  projectWorkspaceBodyLimitBytes,
  projectWorkspacePayload,
  toProjectInvitationDto,
} from "../../projects/project-route-payloads.js";
import { requireProjectSettingsContext } from "../../projects/project-settings-access.js";
import { resolveRegisteredProjectInvitee, searchProjectInvitees } from "../../projects/project-invitation-eligibility.js";

function isSchemaError(error: unknown): error is z.ZodError {
  // Contracts may resolve a workspace-local Zod copy, so constructor identity alone is insufficient.
  return error instanceof z.ZodError || error instanceof Error && error.name === "ZodError" && "issues" in error && Array.isArray(error.issues);
}

const projectWorkspaceSaveRequestSchema = z.object({
  baseVersion: z.number().int().min(0),
  state: z.record(z.string(), z.unknown()),
  sourceRunId: z.string().trim().min(1).nullable().optional(),
});

export function registerProjectRoutes({
  app,
  authStore,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
}) {
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
      return createHttpErrorResponse(reply, { issues: parsedInput.error.issues });
    }
    const input = parsedInput.data;
    const { project, ownerMember } = await authStore.createProject({
      projectMode: input.projectMode,
      ownerUserId: auth.user.id,
      name: input.name,
      description: input.description,
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

    try {
      return projectWorkspacePayload(await authStore.getProjectWorkspace(projectId));
    } catch (error) {
      if (error instanceof ModelSemanticError || isSchemaError(error)) {
        reply.code(409);
        return createHttpErrorResponse(reply);
      }
      throw error;
    }
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
        // Ordinary workflow state is server-owned. Older clients cannot delete it or forge generated results.
        state: normalizeWorkspaceModelState({ ...input.state, standardProject: currentWorkspace.state.standardProject }, currentWorkspace.state),
        updatedByUserId: context.user.id,
        sourceRunId: input.sourceRunId ?? null,
      });
    } catch (error) {
      if (error instanceof ModelSemanticError) {
        reply.code(400);
        return createHttpErrorResponse(reply, { diagnostics: error.diagnostics });
      }
      if (isSchemaError(error)) {
        reply.code(400);
        return createHttpErrorResponse(reply, { issues: error.issues });
      }
      if (isWorkspaceSourceRunConstraintError(error)) {
        reply.code(400);
        return createHttpErrorResponse(reply);
      }
      throw error;
    }
    if (!result.ok) {
      reply.code(409);
      const current = projectWorkspacePayload(result.workspace);
      return createHttpErrorResponse(reply, { projectId, currentVersion: current.version, workspace: current });
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
      return createHttpErrorResponse(reply, { issues: parsedInput.error.issues });
    }
    const input = parsedInput.data;
    const project = await authStore.updateProject(projectId, {
      ...input,
    });
    if (!project) {
      reply.code(404);
      return createHttpErrorResponse(reply);
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
      return createHttpErrorResponse(reply);
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
      return createHttpErrorResponse(reply);
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
      return createHttpErrorResponse(reply);
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
      return createHttpErrorResponse(reply);
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
      return createHttpErrorResponse(reply);
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

  app.get("/api/projects/:projectId/invitees", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await requireProjectPermission(request, reply, authStore, projectId, "invite_members");
    if (isProjectPermissionError(context)) return context;
    const input = projectInviteeSearchQuerySchema.safeParse(request.query);
    if (!input.success) {
      reply.code(400);
      return createHttpErrorResponse(reply, { issues: input.error.issues });
    }
    return projectInviteeSearchResponseSchema.parse({
      users: await searchProjectInvitees(authStore, projectId, context.user.id, input.data.query),
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

    const parsedInput = projectInvitationCreateRequestSchema.safeParse(request.body);
    if (!parsedInput.success) {
      reply.code(400);
      return createHttpErrorResponse(reply, { issues: parsedInput.error.issues });
    }
    const input = parsedInput.data;
    const invitee = await resolveRegisteredProjectInvitee(authStore, context.user, input.username);
    if ("error" in invitee) {
      reply.code(400);
      return invitee;
    }
    if (await authStore.findProjectMemberByUsername(projectId, input.username)) {
      reply.code(409);
      return { error: { code: "PROJECT_INVITATION_ALREADY_EXISTS", category: "conflict", retryable: false } };
    }

    const now = new Date().toISOString();
    const member = await authStore.createMember({
      projectId,
      userId: invitee.user.id,
      username: input.username,
      displayName: invitee.user.displayName,
      role: input.role,
      status: "invited",
      invitedByUserId: context.user.id,
      invitedAt: now,
      joinedAt: null,
    });

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
      }),
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

      let member = await authStore.getMember(invitationId);
      if (!member || member.projectId !== projectId || member.status !== "invited") {
        reply.code(404);
        return createHttpErrorResponse(reply);
      }

      const invitee = await resolveRegisteredProjectInvitee(authStore, context.user, member.username);
      if ("error" in invitee) {
        reply.code(400);
        return invitee;
      }
        member = await authStore.refreshProjectInvitation(member.id);
      if (!member) { reply.code(409); return createHttpErrorResponse(reply); }
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
        }),
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
        return createHttpErrorResponse(reply);
      }

      await authStore.updateMember(member.id, { status: "revoked" });
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

    const parsedInput = projectMemberInviteRequestSchema.safeParse(request.body);
    if (!parsedInput.success) {
      reply.code(400);
      return createHttpErrorResponse(reply, { issues: parsedInput.error.issues });
    }
    const input = parsedInput.data;
    const invitee = await resolveRegisteredProjectInvitee(authStore, context.user, input.username);
    if ("error" in invitee) {
      reply.code(400);
      return invitee;
    }
    if (await authStore.findProjectMemberByUsername(projectId, input.username)) {
      reply.code(409);
      return { error: { code: "PROJECT_INVITATION_ALREADY_EXISTS", category: "conflict", retryable: false } };
    }

    const user = invitee.user;
    const now = new Date().toISOString();
    const member = await authStore.createMember({
      projectId,
      userId: user.id,
      username: input.username,
      displayName: user.displayName,
      role: input.role,
      status: "active",
      invitedByUserId: context.user.id,
      invitedAt: now,
      joinedAt: now,
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
      return createHttpErrorResponse(reply);
    }

    const input = projectMemberUpdateRequestSchema.parse(request.body);
    if (
      member.role === "owner" &&
      input.role !== "owner" &&
      (await authStore.countOwners(projectId)) <= 1
    ) {
      reply.code(400);
      return createHttpErrorResponse(reply);
    }
    if (input.role === "owner" && !member.userId) {
      reply.code(400);
      return createHttpErrorResponse(reply);
    }

    const updated = await authStore.updateMember(memberId, { role: input.role });
    if (!updated) {
      reply.code(404);
      return createHttpErrorResponse(reply);
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
        return createHttpErrorResponse(reply);
      }
      if (member.role === "owner" && (await authStore.countOwners(projectId)) <= 1) {
        reply.code(400);
        return createHttpErrorResponse(reply);
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
