// Registers marketing case project creation endpoints backed by deterministic workspace templates.
import type { FastifyInstance } from "fastify";
import {
  designRunSnapshotSchema,
  feasibilityRunSnapshotSchema,
  projectResponseSchema,
  runSnapshotSchema,
  type DesignPlantUmlArtifact,
  type DesignSvgArtifact,
  type PlantUmlArtifact,
  type SvgArtifact,
} from "@uml-platform/contracts";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import {
  getCaseProjectTemplate,
  type CaseProjectTemplate,
} from "../../cases/case-project-templates.js";
import { projectPayload } from "../../projects/project-route-payloads.js";
import { restoreRunSnapshotToWorkspaceState } from "../projects/workspace-snapshot-restore.js";

export function registerCaseRoutes({
  app,
  authStore,
  renderClient,
}: {
  app: FastifyInstance;
  authStore: AuthStore;
  renderClient: RenderClient;
}) {
  app.post("/api/cases/:caseId/project", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;

    const { caseId } = request.params as { caseId: string };
    const template = getCaseProjectTemplate(caseId);
    if (!template) {
      reply.code(404);
      return { message: "Case template not found" };
    }

    let seededState: ReturnType<typeof restoreRunSnapshotToWorkspaceState>;
    try {
      seededState = await buildTemplateWorkspaceState(template, renderClient);
    } catch (error) {
      request.log.error({ err: error, caseId }, "Case template rendering failed");
      reply.code(500);
      return { message: "Case template could not be rendered" };
    }

    const { project, ownerMember } = await authStore.createProject({
      ownerUserId: auth.user.id,
      name: template.title,
      description: template.description,
      visibility: "private",
      organizationId: null,
      courseId: null,
      classId: null,
      teamId: null,
      defaultProviderConfigId: null,
      retentionPolicy: "manual",
      backgroundKey: template.backgroundKey,
    });

    const saved = await authStore.saveProjectWorkspace({
      projectId: project.id,
      baseVersion: 0,
      state: seededState,
      updatedByUserId: auth.user.id,
      sourceRunId: null,
    });
    if (!saved.ok) {
      await authStore.updateProject(project.id, { status: "deleted" });
      reply.code(500);
      return { message: "Case project workspace could not be initialized" };
    }

    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "project.create",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
      message: `caseId=${template.id}`,
    });
    await authStore.recordAuditLog({
      actorUserId: auth.user.id,
      action: "project.case_seed",
      targetType: "project",
      targetId: project.id,
      outcome: "success",
      message: `caseId=${template.id}`,
    });

    reply.code(201);
    return projectResponseSchema.parse(projectPayload({ project, member: ownerMember }));
  });
}

async function buildTemplateWorkspaceState(
  template: CaseProjectTemplate,
  renderClient: RenderClient,
) {
  const requirementSnapshot = runSnapshotSchema.parse({
    ...template.requirementSnapshot,
    svgArtifacts: await renderRequirementArtifacts(
      template.requirementSnapshot.plantUml,
      renderClient,
    ),
  });
  const designSnapshot = designRunSnapshotSchema.parse({
    ...template.designSnapshot,
    svgArtifacts: await renderDesignArtifacts(
      template.designSnapshot.plantUml,
      renderClient,
    ),
  });
  const feasibilityArtifact = template.feasibilitySnapshot.contextPlantUml;
  if (!feasibilityArtifact) {
    throw new Error("Case template feasibility context source is missing");
  }
  const feasibilityRendered = await renderClient(feasibilityArtifact);
  const businessFlowRendered = await renderClient(template.businessFlow.plantUml);
  const feasibilitySnapshot = feasibilityRunSnapshotSchema.parse({
    ...template.feasibilitySnapshot,
    businessFlow: {
      ...template.businessFlow,
      fingerprint: template.feasibilitySnapshot.contextFingerprint,
      svg: { diagramKind: "activity", modelId: template.businessFlow.model.modelId,
        svg: businessFlowRendered.svg, renderMeta: businessFlowRendered.renderMeta },
    },
    contextSvg: {
      diagramKind: "context",
      modelId: feasibilityArtifact.modelId ?? "context",
      svg: feasibilityRendered.svg,
      renderMeta: feasibilityRendered.renderMeta,
    },
  });

  const requirementState = restoreRunSnapshotToWorkspaceState({
    currentState: {},
    snapshot: requirementSnapshot,
    replaceRequirementInput: true,
  });
  const designState = restoreRunSnapshotToWorkspaceState({
    currentState: requirementState,
    snapshot: designSnapshot,
  });
  
  return {
    ...designState,
    feasibilityInputs: feasibilitySnapshot.inputs,
    feasibilityBusinessFlow: feasibilitySnapshot.businessFlow,
    feasibilityContextModel: feasibilitySnapshot.contextModel,
    feasibilityContextTraceability: feasibilitySnapshot.contextTraceability,
    feasibilityContextPlantUml: feasibilitySnapshot.contextPlantUml?.source ?? "",
    feasibilityContextSvg: feasibilitySnapshot.contextSvg?.svg ?? "",
    feasibilityContextFingerprint: feasibilitySnapshot.contextFingerprint,
    feasibilityImplementationPlan: feasibilitySnapshot.implementationPlan,
    feasibilityImplementationFingerprint:
      feasibilitySnapshot.implementationFingerprint,
  };
}

async function renderRequirementArtifacts(
  artifacts: PlantUmlArtifact[],
  renderClient: RenderClient,
): Promise<SvgArtifact[]> {
  return Promise.all(
    artifacts.map(async (artifact) => {
      const rendered = await renderClient(artifact);
      return {
        ...(artifact.modelId ? { modelId: artifact.modelId } : {}),
        diagramKind: artifact.diagramKind,
        svg: rendered.svg,
        renderMeta: rendered.renderMeta,
      };
    }),
  );
}

async function renderDesignArtifacts(
  artifacts: DesignPlantUmlArtifact[],
  renderClient: RenderClient,
): Promise<DesignSvgArtifact[]> {
  return Promise.all(
    artifacts.map(async (artifact) => {
      const rendered = await renderClient(artifact);
      return {
        ...(artifact.modelId ? { modelId: artifact.modelId } : {}),
        diagramKind: artifact.diagramKind,
        svg: rendered.svg,
        renderMeta: rendered.renderMeta,
      };
    }),
  );
}
