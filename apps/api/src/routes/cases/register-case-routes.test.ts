// Verifies one-click marketing case project creation without depending on run history.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import {
  buildAcceptedRequirementSnapshot,
  buildFeasibilityImplementationFingerprint,
  readFeasibilityBusinessFlowArtifact,
} from "@uml-platform/contracts";
import {
  createInMemoryAuthStore,
  type AuthStore,
} from "../../auth/in-memory-auth-store.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { caseProjectTemplates } from "../../cases/case-project-templates.js";
import { registerCaseRoutes } from "./register-case-routes.js";

const caseIds = [
  ["lab-booking", "实验室预约系统", "booking"],
  ["order-management", "订单管理系统", "orders"],
  ["device-monitoring", "设备监控系统", "iot"],
  ["library-lending", "图书馆借阅系统", "campus"],
] as const;

const plantUmlJarPath = fileURLToPath(
  new URL("../../../../../plantuml/build/libs/plantuml-1.2026.3beta8.jar", import.meta.url),
);

const mockRenderClient: RenderClient = async (artifact) => ({
  svg: `<svg data-diagram="${artifact.diagramKind}" data-model="${artifact.modelId ?? artifact.diagramKind}"></svg>`,
  renderMeta: {
    engine: "mock-render",
    generatedAt: "2026-06-26T00:00:00.000Z",
    sourceLength: artifact.source.length,
    durationMs: 1,
  },
});

async function createTestApp(renderClient: RenderClient = mockRenderClient) {
  const app = Fastify();
  const authStore = createInMemoryAuthStore();
  registerCaseRoutes({ app, authStore, renderClient });
  return { app, authStore };
}

async function registerUser(input: {
  authStore: AuthStore;
  email: string;
  displayName: string;
}) {
  const user = await input.authStore.createUser({
    email: input.email,
    displayName: input.displayName,
    passwordHash: "test-password-hash",
  });
  assert.ok(user);
  const session = await input.authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });

  return {
    user,
    cookie: `uml_session=${encodeURIComponent(session.id)}`,
  };
}

async function renderPlantUmlSource(source: string) {
  const stdout = execFileSync(
    "java",
    ["-Xmx128m", "-jar", plantUmlJarPath, "-tsvg", "-charset", "UTF-8", "-pipe"],
    {
      input: source,
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    },
  );
  assert.match(stdout, /<svg[\s>]/);
}

test("case project templates contain PlantUML sources renderable by the real jar", async () => {
  for (const template of caseProjectTemplates) {
    for (const artifact of template.requirementSnapshot.plantUml) {
      await assert.doesNotReject(
        () => renderPlantUmlSource(artifact.source),
        `${template.id} requirement ${artifact.modelId ?? artifact.diagramKind} should render`,
      );
    }
    for (const artifact of template.designSnapshot.plantUml) {
      await assert.doesNotReject(
        () => renderPlantUmlSource(artifact.source),
        `${template.id} design ${artifact.modelId ?? artifact.diagramKind} should render`,
      );
    }
    const feasibilityArtifact = template.feasibilitySnapshot.contextPlantUml;
    assert.ok(feasibilityArtifact);
    await assert.doesNotReject(
      () => renderPlantUmlSource(feasibilityArtifact.source),
      `${template.id} feasibility context should render`,
    );
  }
});

test("case project creation requires an authenticated session", async () => {
  const { app } = await createTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/cases/lab-booking/project",
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Authentication required");
  await app.close();
});

test("case project creation rejects unknown case ids", async () => {
  const { app, authStore } = await createTestApp();
  const owner = await registerUser({
    authStore,
    email: "case-owner@example.com",
    displayName: "Case Owner",
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/cases/unknown-case/project",
    headers: { cookie: owner.cookie },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().message, "Case template not found");
  await app.close();
});

test("case project creation seeds every marketing case workspace", async () => {
  for (const [caseId, title, backgroundKey] of caseIds) {
    const { app, authStore } = await createTestApp();
    const owner = await registerUser({
      authStore,
      email: `${caseId}@example.com`,
      displayName: "Case Owner",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/project`,
      headers: { cookie: owner.cookie },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.project.name, title);
    assert.doesNotMatch(body.project.description, /示例|样例/u);
    assert.equal(body.project.visibility, "private");
    assert.equal(body.currentUserRole, "owner");
    assert.equal((await authStore.getProject(body.project.id))?.backgroundKey, backgroundKey);

    const workspace = await authStore.getProjectWorkspace(body.project.id);
    assert.equal(workspace.version, 1);
    assert.equal(workspace.updatedByUserId, owner.user.id);
    assert.equal(typeof workspace.state.requirementText, "string");
    assert.ok(String(workspace.state.requirementText).trim().length > 0);
    assert.ok(Array.isArray(workspace.state.rules));
    assert.ok((workspace.state.rules as unknown[]).length >= 4);
    assert.ok(Object.keys(workspace.state.models as Record<string, unknown>).length >= 3);
    assert.ok(Object.keys(workspace.state.plantUml as Record<string, unknown>).length >= 3);
    const svgArtifacts = workspace.state.svgArtifacts as Record<string, { svg: string }>;
    assert.ok(Object.keys(svgArtifacts).length >= 3);
    assert.ok(Object.values(svgArtifacts).every((artifact) => artifact.svg.includes("<svg")));
    assert.ok(Object.keys(workspace.state.designModels as Record<string, unknown>).length >= 4);
    assert.ok(Object.keys(workspace.state.designPlantUml as Record<string, unknown>).length >= 4);
    const designSvgArtifacts = workspace.state.designSvgArtifacts as Record<string, { svg: string }>;
    assert.ok(Object.keys(designSvgArtifacts).length >= 4);
    assert.ok(Object.values(designSvgArtifacts).every((artifact) => artifact.svg.includes("<svg")));
    // Case workspaces retain evidence; Coding Agents implement locally instead of restoring retired prototypes.
    for (const key of ["codeFiles", "codeEntryFile", "codeSpec", "codeBusinessLogic"]) {
      assert.equal(key in workspace.state, false);
    }
    assert.ok(workspace.state.feasibilityContextModel);
    assert.ok(readFeasibilityBusinessFlowArtifact(workspace.state.feasibilityBusinessFlow));
    assert.match(String(workspace.state.feasibilityContextPlantUml), /@startuml/u);
    assert.match(String(workspace.state.feasibilityContextSvg), /<svg/u);
    assert.equal(
      (workspace.state.feasibilityContextModel as {
        externalSystems: Array<{ id: string }>;
      }).externalSystems[0]?.id,
      "external-main",
    );
    const implementationPlan = workspace.state.feasibilityImplementationPlan as {
      candidates: Array<{
        implementation: {
          integrations: Array<{ contextExternalSystemId: string }>;
          verdicts: unknown[];
        };
      }>;
    };
    assert.equal(implementationPlan.candidates.length, 2);
    assert.equal(
      implementationPlan.candidates[0]?.implementation.integrations[0]
        ?.contextExternalSystemId,
      "external-main",
    );
    assert.equal(
      implementationPlan.candidates[0]?.implementation.verdicts.length,
      5,
    );
    assert.ok(workspace.state.feasibilityContextFingerprint);
    assert.ok(workspace.state.feasibilityImplementationFingerprint);
    const requirementSource = buildAcceptedRequirementSnapshot(
      workspace.state.rules,
      workspace.state.requirementBaseline,
    );
    assert.equal(
      workspace.state.feasibilityContextFingerprint,
      requirementSource.snapshot.fingerprint,
    );
    assert.equal(
      workspace.state.feasibilityImplementationFingerprint,
      buildFeasibilityImplementationFingerprint({
        rules: requirementSource.rules,
        requirementBaseline: requirementSource.baseline,
        businessFlow: readFeasibilityBusinessFlowArtifact(workspace.state.feasibilityBusinessFlow),
        contextModel: workspace.state.feasibilityContextModel,
        inputs: workspace.state.feasibilityInputs,
      }),
    );

    const logs = await authStore.listAuditLogs();
    assert.ok(logs.some((entry) => entry.action === "project.create" && entry.targetId === body.project.id));
    assert.ok(logs.some((entry) => entry.action === "project.case_seed" && entry.targetId === body.project.id));
    await app.close();
  }
});

test("case project creation does not create a project when template rendering fails", async () => {
  const failingRenderClient: RenderClient = async () => {
    throw new Error("render unavailable");
  };
  const { app, authStore } = await createTestApp(failingRenderClient);
  const owner = await registerUser({
    authStore,
    email: "render-failure@example.com",
    displayName: "Render Failure",
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/cases/lab-booking/project",
    headers: { cookie: owner.cookie },
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json().message, "Case template could not be rendered");
  assert.equal(authStore.listProjectsForUser(owner.user.id).length, 0);
  await app.close();
});
