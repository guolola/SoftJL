// Verifies terminal project runs reconcile their snapshots into workspace state without a browser client.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
} from "@uml-platform/contracts";
import { snapshotInputFingerprint, feasibilityInputsSchema } from "@uml-platform/contracts";
import { createBusinessFlowArtifact } from "../../test-fixtures/feasibility/business-flow.js";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import {  createEmptyDesignSnapshot, createEmptyDocumentSnapshot, createEmptyFeasibilitySnapshot, createEmptySnapshot } from "../../runs/records/snapshots.js";
import { emitEvent, type RunRecord } from "../../runs/records/run-record-store.js";
import { buildRequirementBaseline } from "../../runs/baselines/requirement-baseline.js";
import {
  attachProjectWorkspaceSync,
  createProjectWorkspaceSync,
} from "./project-workspace-sync.js";

const rule = {
  id: "REQ-001",
  category: "功能需求" as const,
  text: "用户可以发布文章并由管理员审核。",
  relatedDiagrams: ["usecase", "class"] as const,
};

const useCaseModel: DiagramModelSpec = {
  diagramKind: "usecase",
  title: "用例模型",
  summary: "文章发布与审核用例。",
  notes: [],
  actors: [],
  useCases: [],
  systemBoundaries: [],
  relationships: [],
};

const designClassModel: DesignDiagramModelSpec = {
  diagramKind: "class",
  modelId: "class:design",
  title: "设计类图",
  summary: "文章发布设计类。",
  notes: [],
  classes: [],
  interfaces: [],
  enums: [],
  relationships: [],
};

const interfaceModel: DesignDiagramModelSpec = {
  diagramKind: "navigation",
  modelId: "navigation:design-interface-relations",
  title: "界面关系图",
  summary: "文章发布界面跳转。",
  notes: [],
  nodes: [],
  relationships: [],
};

const componentModel: DesignDiagramModelSpec = {
  diagramKind: "component",
  modelId: "component:design",
  title: "组件关系图",
  summary: "文章发布组件。",
  notes: [],
  components: [],
  interfaces: [],
  relationships: [],
};

const deploymentModel: DesignDiagramModelSpec = {
  diagramKind: "deployment",
  modelId: "deployment:design",
  title: "部署设计",
  summary: "文章发布部署。",
  notes: [],
  nodes: [],
  databases: [],
  components: [],
  externalSystems: [],
  artifacts: [],
  relationships: [],
};

test("design completion preserves changed requirements and manual design branches while merging independent results", async () => {
  const { authStore, project, user, syncProjectWorkspace } = await createWorkspaceSyncFixture();
  const baseline = buildRequirementBaseline({ runId: "baseline", requirementText: rule.text, rules: [rule] });
  const snapshot = createEmptyDesignSnapshot("concurrent-design", { selectedDiagrams: ["class", "navigation"], requirementBaseline: baseline, requirementModels: [useCaseModel], requirementModelTraceability: [] });
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false, metadata: { createdAt: new Date().toISOString(), projectId: project.id, userId: user.id } };
  await syncProjectWorkspace.prepare!(record);
  const current = await authStore.getProjectWorkspace(project.id);
  const manual = { ...designClassModel, summary: "人工编辑，必须保留" };
  await authStore.saveProjectWorkspace({ projectId: project.id, baseVersion: current.version, updatedByUserId: user.id, sourceRunId: null, state: { requirementText: "生成期间的新需求", rules: [rule], models: { usecase: { ...useCaseModel, title: "人工需求模型" } }, designModels: { [manual.modelId!]: manual } } });
  snapshot.models = [designClassModel, interfaceModel]; snapshot.status = "completed";
  await syncProjectWorkspace(record);
  const state = (await authStore.getProjectWorkspace(project.id)).state;
  assert.deepEqual((state.designModels as Record<string, unknown>)[manual.modelId!], manual);
  assert.deepEqual((state.designModels as Record<string, unknown>)[interfaceModel.modelId!], interfaceModel);
  assert.equal(state.requirementText, "生成期间的新需求");
  assert.equal((state.models as Record<string, { title: string }>).usecase.title, "人工需求模型");
  assert.equal(snapshot.models.length, 2, "complete generated result remains in history");
});

async function createWorkspaceSyncFixture() {
  const authStore = createInMemoryAuthStore();
  const runs = new Map<string, RunRecord>();
  const user = await authStore.createUser({
    email: "workspace-sync@example.com",
    displayName: "Workspace Sync",
    passwordHash: "test",
    emailVerified: true,
  });
  assert.ok(user);
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Workspace Sync Project",
    description: null,
    visibility: "private",
  });
  return {
    authStore,
    project,
    runs,
    user,
    syncProjectWorkspace: createProjectWorkspaceSync(authStore, { runs }),
  };
}

function attachAndComplete(record: RunRecord, syncProjectWorkspace: ReturnType<typeof createProjectWorkspaceSync>) {
  attachProjectWorkspaceSync(record, syncProjectWorkspace);
  emitEvent(record, { type: "completed", snapshot: record.snapshot });
}

async function waitForWorkspace(
  read: () => Promise<Record<string, unknown>>,
  predicate: (state: Record<string, unknown>) => boolean,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await read();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const state = await read();
  assert.equal(predicate(state), true);
  return state;
}

async function waitForCondition(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(await predicate(), true);
}

test("business flow is published atomically and preserved after failed or cancelled regeneration", async () => {
  const { authStore, project, user, syncProjectWorkspace } = await createWorkspaceSyncFixture();
  const businessFlow = createBusinessFlowArtifact([rule]);
  const snapshot = createEmptyFeasibilitySnapshot("flow-completed", {
    projectId: project.id, selectedArtifacts: ["business-flow"], rules: [{ ...rule, relatedDiagrams: [...rule.relatedDiagrams] }],
    requirementBaseline: null, providerSettings: { providerConfigId: "provider-a", model: "model-a" },
    inputs: feasibilityInputsSchema.parse({}), businessFlow,
  });
  snapshot.visualReviews[businessFlow.model.modelId ?? "business-flow"] = {
    status: "pending_review", issues: ["标签不可读"], reason: "请人工确认", attempts: 3, checkedAt: new Date().toISOString(),
  };
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: true,
    metadata: { projectId: project.id, userId: user.id, createdAt: "2026-09-01T00:00:00.000Z" } };
  snapshot.status = "completed";
  await syncProjectWorkspace(record);
  assert.deepEqual((await authStore.getProjectWorkspace(project.id)).state.feasibilityBusinessFlow, businessFlow);
  assert.deepEqual((await authStore.getProjectWorkspace(project.id)).state.visualReviews, {
    [`feasibility:${businessFlow.model.modelId ?? "business-flow"}`]: snapshot.visualReviews[businessFlow.model.modelId ?? "business-flow"],
  });
  for (const status of ["failed", "cancelled"] as const) {
    snapshot.status = status;
    snapshot.businessFlow = null;
    await syncProjectWorkspace(record);
    assert.deepEqual((await authStore.getProjectWorkspace(project.id)).state.feasibilityBusinessFlow, businessFlow);
  }
});

test("terminal requirement snapshots auto-sync into project workspace", async () => {
  const { authStore, project, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  const snapshot = createEmptySnapshot("run-requirement-sync", rule.text, ["usecase"], [rule], {
    models: [useCaseModel],
  });
  snapshot.status = "completed";
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      projectId: project.id,
      userId: user.id,
      createdAt: "2026-06-20T00:00:00.000Z",
    },
  };

  attachAndComplete(record, syncProjectWorkspace);

  const state = await waitForWorkspace(
    async () => (await authStore.getProjectWorkspace(project.id)).state,
    (candidate) => Boolean((candidate.models as Record<string, unknown> | undefined)?.usecase),
  );
  assert.equal((state.models as Record<string, { diagramKind: string }>).usecase.diagramKind, "usecase");
  assert.deepEqual(state.selectedDiagramTypes, []);
});

test("rules-only drafts commit with successful rules and stay untouched after failure", async () => {
  const { authStore, project, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  await authStore.saveProjectWorkspace({
    projectId: project.id,
    baseVersion: 0,
    state: { requirementText: "旧需求", rules: [rule] },
    updatedByUserId: user.id,
    sourceRunId: null,
  });
  for (const status of ["failed", "cancelled"] as const) {
    const snapshot = createEmptySnapshot(`run-draft-${status}`, "新需求", [], []);
    snapshot.status = status;
    await syncProjectWorkspace({
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata: { projectId: project.id, userId: user.id },
    });
    const workspace = await authStore.getProjectWorkspace(project.id);
    assert.equal(workspace.state.requirementText, "旧需求");
    assert.deepEqual(workspace.state.rules, [rule]);
  }
  const empty = createEmptySnapshot("run-draft-empty", "无效草稿", [], []);
  empty.status = "completed";
  await syncProjectWorkspace({
    snapshot: empty,
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: { projectId: project.id, userId: user.id },
  });
  assert.equal((await authStore.getProjectWorkspace(project.id)).state.requirementText, "旧需求");
  const completed = createEmptySnapshot("run-draft-completed", "新需求", [], [rule]);
  completed.status = "completed";
  await syncProjectWorkspace({
    snapshot: completed,
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: { projectId: project.id, userId: user.id },
  });
  const workspace = await authStore.getProjectWorkspace(project.id);
  assert.equal(workspace.state.requirementText, "新需求");
  assert.equal(workspace.sourceRunId, completed.runId);
});

test("older same-kind terminal snapshots do not overwrite newer project workspace source", async () => {
  const { authStore, project, runs, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  const newerSnapshot = createEmptySnapshot(
    "run-requirement-newer",
    rule.text,
    ["usecase"],
    [rule],
    {
      models: [{ ...useCaseModel, title: "较新用例模型" }],
    },
  );
  newerSnapshot.status = "completed";
  const olderSnapshot = createEmptySnapshot(
    "run-requirement-older",
    rule.text,
    ["usecase"],
    [rule],
    {
      models: [{ ...useCaseModel, title: "较旧用例模型" }],
    },
  );
  olderSnapshot.status = "completed";
  const newerRecord: RunRecord = {
    snapshot: newerSnapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      projectId: project.id,
      userId: user.id,
      createdAt: "2026-06-20T00:01:00.000Z",
    },
  };
  const olderRecord: RunRecord = {
    snapshot: olderSnapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      projectId: project.id,
      userId: user.id,
      createdAt: "2026-06-20T00:00:00.000Z",
    },
  };
  runs.set(newerSnapshot.runId, newerRecord);
  runs.set(olderSnapshot.runId, olderRecord);

  attachAndComplete(newerRecord, syncProjectWorkspace);
  await waitForCondition(async () => {
    const workspace = await authStore.getProjectWorkspace(project.id);
    return workspace.sourceRunId === newerSnapshot.runId;
  });
  const afterNewer = await authStore.getProjectWorkspace(project.id);

  attachAndComplete(olderRecord, syncProjectWorkspace);
  await waitForCondition(async () => {
    const logs = await authStore.listAuditLogs();
    return logs.some(
      (log) =>
        log.action === "project.workspace.auto-sync" &&
        log.message?.includes("sourceRunId=run-requirement-older") &&
        log.message.includes("skipped older terminal snapshot"),
    );
  });
  const afterOlder = await authStore.getProjectWorkspace(project.id);

  assert.equal(afterOlder.version, afterNewer.version);
  assert.equal(afterOlder.sourceRunId, newerSnapshot.runId);
  assert.equal(
    (
      afterOlder.state.models as Record<string, { title: string }> | undefined
    )?.usecase?.title,
    "较新用例模型",
  );
});

test("terminal design snapshots auto-sync successful design models into project workspace", async () => {
  const { authStore, project, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  const baseline = buildRequirementBaseline({
    runId: "design-baseline",
    requirementText: rule.text,
    rules: [rule],
  });
  const snapshot = createEmptyDesignSnapshot("run-design-sync", {
    selectedDiagrams: ["class", "navigation", "component", "deployment"],
    requestedDiagrams: ["navigation", "deployment"],
    requirementBaseline: baseline,
    requirementModels: [useCaseModel],
    requirementModelTraceability: [],
  });
  snapshot.models = [
    designClassModel,
    interfaceModel,
    componentModel,
    deploymentModel,
  ];
  snapshot.status = "completed";
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      projectId: project.id,
      userId: user.id,
      createdAt: "2026-06-20T00:00:00.000Z",
    },
  };

  attachAndComplete(record, syncProjectWorkspace);

  const state = await waitForWorkspace(
    async () => (await authStore.getProjectWorkspace(project.id)).state,
    (candidate) =>
      Boolean(
        (candidate.designModels as Record<string, unknown> | undefined)?.[
          "class:design"
        ],
      ),
  );
  const designModels = state.designModels as Record<string, unknown>;
  assert.ok(designModels["class:design"]);
  assert.ok(designModels["navigation:design-interface-relations"]);
  assert.ok(designModels["component:design"]);
  assert.ok(designModels["deployment:design"]);
  assert.deepEqual(state.selectedDiagramTypes, []);
  assert.deepEqual(state.selectedDesignDiagramTypes, []);
});

test("terminal design snapshots do not pollute requirement fingerprints during auto-sync", async () => {
  const { authStore, project, user, syncProjectWorkspace } =
    await createWorkspaceSyncFixture();
  const currentFingerprint = snapshotInputFingerprint({
    requirementText: rule.text,
    rules: [rule],
  });
  await authStore.saveProjectWorkspace({
    projectId: project.id,
    baseVersion: 0,
    state: {
      requirementText: rule.text,
      rules: [rule],
      requirementInputFingerprint: currentFingerprint,
      rulesVersion: 2,
      rulesBasedOnTextVersion: 1,
      models: { usecase: useCaseModel },
      generatedDiagramTypes: ["usecase"],
      diagramInputFingerprints: { usecase: currentFingerprint },
      diagramVersions: { usecase: 2 },
    },
    updatedByUserId: user.id,
    sourceRunId: null,
  });
  const baseline = buildRequirementBaseline({
    runId: "design-baseline",
    requirementText: rule.text,
    rules: [rule],
  });
  const snapshot = createEmptyDesignSnapshot("run-design-empty-requirements", {
    selectedDiagrams: ["class"],
    requestedDiagrams: ["class"],
    requirementBaseline: baseline,
    requirementModels: [{ ...useCaseModel, title: "设计快照旧用例模型" }],
    requirementModelTraceability: [],
    existingDesignModels: [designClassModel],
  });
  snapshot.status = "completed";

  attachAndComplete(
    {
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: false,
      metadata: {
        projectId: project.id,
        userId: user.id,
        createdAt: "2026-06-20T00:00:00.000Z",
      },
    },
    syncProjectWorkspace,
  );

  const state = await waitForWorkspace(
    async () => (await authStore.getProjectWorkspace(project.id)).state,
    (candidate) =>
      Boolean(
        (candidate.designModels as Record<string, unknown> | undefined)?.[
          "class:design"
        ],
      ),
  );
  assert.equal(state.requirementInputFingerprint, currentFingerprint);
  assert.equal(state.rulesVersion, 2);
  assert.equal(state.rulesBasedOnTextVersion, 1);
  assert.equal(
    (state.diagramInputFingerprints as Record<string, string>).usecase,
    currentFingerprint,
  );
  assert.equal((state.diagramVersions as Record<string, number>).usecase, 2);
  assert.equal(
    (state.models as Record<string, { title: string }>).usecase.title,
    "用例模型",
  );
});



