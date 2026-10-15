// Verifies formal feasibility run persistence, provider generation, dependency gates, and partial sync.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { buildAcceptedRequirementSnapshot } from "@uml-platform/contracts";
import { createBusinessFlowArtifact } from "../../test-fixtures/feasibility/business-flow.js";
import { createRunRecordStore } from "../../runs/records/run-record-store.js";
import { registerFeasibilityRoutes } from "./register-feasibility-routes.js";
import { librarySeatDemoFixture } from "../../runs/demo/fixtures/library-seat-demo-fixture.js";

function acceptedBaseline(condition: string | null = null) {
  return {
    runId: "requirements-run",
    sourceDocumentId: "inline",
    createdAt: "2026-07-19T00:00:00.000Z",
    requirements: [{ id: "REQ-009", sourceRuleId: "R9", sourceFragment: "计算总成本", sourceLocation: { section: "input", startOffset: 0, endOffset: 5 }, type: "functional", actor: "技工", subject: "系统", action: "计算", object: "总成本", condition, outcome: "得到总成本", confidence: 1, status: "accepted", criticality: "high", acceptanceCriteria: ["得到总成本"], priority: "must", fieldProvenance: {} }],
    assumptions: [], conflicts: [],
    qualityReport: { runId: "requirements-run", status: "accepted", summary: "已确认", issues: [], blockingIssueIds: [], reviewRequiredRequirementIds: [] },
  };
}

const contextOutput = JSON.stringify({
  diagramKind: "context",
  modelId: "context",
  title: "维修预约系统上下文",
  summary: "系统边界",
  notes: [],
  system: { id: "system", name: "维修预约系统", sourceRequirementIds: [] },
  people: [{ id: "technician", name: "技工", sourceRequirementIds: ["R9"] }],
  externalSystems: [],
  relationships: [{ id: "rel-1", sourceId: "technician", targetId: "system", direction: "directed", label: "计算总成本", sourceRequirementIds: ["R9"] }],
});

const businessFlowOutput = JSON.stringify({
  model: {
    diagramKind: "activity", modelId: "feasibility-business-flow", title: "业务与系统流程图", summary: "计算总成本", notes: [],
    swimlanes: [{ id: "system", name: "维修预约系统" }],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "calculate", type: "activity", name: "计算总成本", actorOrLane: "system", input: [], output: ["总成本"] },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "flow-1", type: "control_flow", sourceId: "start", targetId: "calculate" },
      { id: "flow-2", type: "control_flow", sourceId: "calculate", targetId: "end" },
    ],
  },
  traceability: [{ requirementId: "R9", targetId: "calculate", targetKind: "node" }],
});

function generatedCandidate(id: string, name: string) {
  const range = { minimum: 10_000, maximum: 20_000, currency: "CNY", basis: "同规模项目人力与服务成本", confidence: "medium" };
  return {
    id, name, summary: "按模块分阶段交付", advantages: ["职责清晰"], disadvantages: ["需要持续维护"],
    estimatedCost: "人民币 1–2 万元（AI 估算）", estimatedSchedule: "8–12 周", sourceRequirementIds: ["R9"], provenance: "ai-estimate",
    implementation: {
      provenance: "ai-estimate",
      architecture: { summary: "模块化架构", modules: [{ name: "成本模块", responsibility: "计算总成本", sourceRequirementIds: ["R9"], provenance: "ai-estimate" }] },
      dataStrategy: { summary: "保存业务数据", sourceRequirementIds: ["R9"], provenance: "ai-estimate" }, integrations: [], integrationRationale: "当前规则未要求外部系统集成。",
      deploymentAndOperations: { summary: "容器化部署", sourceRequirementIds: [], assumption: "目标环境尚未确认，按单节点容器估算", provenance: "ai-estimate" },
      securityAndCompliance: { summary: "最小权限与审计", sourceRequirementIds: ["R9"], provenance: "ai-estimate" },
      milestones: [{ name: "核心交付", timeframe: "8–12 周", deliverables: ["可运行系统"], roles: ["开发者"], dependencies: [], dependencyRationale: "不依赖项目外部团队。", acceptanceCriteria: ["规则通过"], sourceRequirementIds: ["R9"], provenance: "ai-estimate" }],
      analysisPeriodAssumption: { years: 3, basis: "按教学项目常见生命周期", provenance: "ai-estimate" },
      costEstimates: [
        { id: `${id}-capital`, name: "开发设备", category: "capital", frequency: "one-time", range, sourceRequirementIds: [], assumption: "按现有团队补充设备估算", provenance: "ai-estimate" },
        { id: `${id}-once`, name: "上线准备", category: "other-one-time", frequency: "one-time", range, sourceRequirementIds: [], assumption: "按部署准备工时估算", provenance: "ai-estimate" },
        { id: `${id}-recurring`, name: "运维服务", category: "recurring", frequency: "annual", range, sourceRequirementIds: [], assumption: "按年度服务估算", provenance: "ai-estimate" },
      ],
      benefitEstimates: [
        { id: `${id}-benefit-once`, name: "初始化节省", category: "one-time", frequency: "one-time", range, outcome: "减少初始化人工", sourceRequirementIds: [], assumption: "按人工时折算", provenance: "ai-estimate" },
        { id: `${id}-benefit-recurring`, name: "效率收益", category: "recurring", frequency: "annual", range, outcome: "持续减少计算时间", sourceRequirementIds: ["R9"], provenance: "ai-estimate" },
        { id: `${id}-benefit-intangible`, name: "可追踪性", category: "intangible", frequency: "annual", range: null, outcome: "提高结果可追踪性", sourceRequirementIds: ["R9"], provenance: "ai-estimate" },
      ],
      absenceDeclarations: [], oneTimeCosts: ["开发与上线"], recurringCosts: ["年度运维"], quantitativeBenefits: ["节省处理时间"], qualitativeBenefits: ["提高可追踪性"],
      risks: ["进度偏差", "估算偏差", "运维能力"].map((risk) => ({ risk, probability: "medium", impact: "medium", mitigation: "设置阶段检查点", owner: "项目经理", sourceRequirementIds: [], assumption: "基于方案实施特征", provenance: "ai-estimate" })),
      verdicts: ["technical", "operational", "schedule", "economic", "legal"].map((category) => ({ category, verdict: "conditional", rationale: "满足前置条件后可行", provenance: "ai-estimate" })),
      decision: "conditional-go", preconditions: ["确认真实预算与法律约束"],
    },
  };
}

const implementationOutput = JSON.stringify({
  overview: "分阶段实现",
  candidates: [generatedCandidate("candidate-1", "模块化方案"), generatedCandidate("candidate-2", "托管服务方案")],
  recommendedCandidateId: "candidate-1",
  recommendationRationale: "综合成本、周期和风险后复杂度可控",
});

function providerConfigs() {
  return {
    async get() {
      return { scopeType: "system", scopeId: null, allowlisted: true, status: "active", breakerState: "closed", allowedModels: ["test-model"], baseUrl: "https://provider.example/v1", modelCapabilities: {} };
    },
    async getSecret() { return "test-key"; },
  };
}

async function waitForTerminal(app: ReturnType<typeof Fastify>, runId: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/feasibility-runs/${runId}`, headers: { authorization: "Bearer test" } });
    const snapshot = response.json();
    if (snapshot.status === "completed" || snapshot.status === "failed") return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("run did not finish");
}

function registerTestRoutes(input: {
  app: ReturnType<typeof Fastify>;
  outputs?: string[];
  state?: Record<string, unknown>;
  projectName?: string;
  renderClient?: Parameters<typeof registerFeasibilityRoutes>[0]["renderClient"];
  onSync?: (record: Parameters<NonNullable<Parameters<typeof registerFeasibilityRoutes>[0]["syncProjectWorkspace"]>>[0]) => Promise<void>;
}) {
  const runs = createRunRecordStore();
  const outputs = [...(input.outputs ?? [contextOutput, businessFlowOutput, implementationOutput])];
  const prompts: string[] = [];
  const state = input.state ?? {
    name: "维修预约系统",
    rules: [{ id: "R9", category: "功能需求", text: "完成维护后计算总成本。", relatedDiagrams: ["context"] }],
    requirementBaseline: acceptedBaseline(),
    feasibilityInputs: { projectName: "维修预约系统" },
  };
  registerFeasibilityRoutes({
    app: input.app,
    runs,
    renderClient: input.renderClient ?? (async (artifact) => ({ svg: `<svg>${artifact.diagramKind}</svg>`, renderMeta: { engine: "plantuml", generatedAt: "2026-07-19T00:00:00.000Z", sourceLength: artifact.source.length, durationMs: 1 } })),
    llmTransport: { async *streamChatCompletion(input) {
      const current = input.messages.at(-1)?.content;
      if (typeof current === "string" && /^核对 feasibility\.[a-z]+ 的结构与业务内容。/.test(current)) { yield '{"passed":true,"issues":[],"findings":[]}'; return; }
      prompts.push(input.messages.map((message) => message.content).join("\n")); yield outputs.shift() ?? "{}";
    } },
    providerConfigs: providerConfigs() as never,
    defaultSseAllowOrigin: "http://localhost:5173",
    resolveUserId: async (request) => request.headers.authorization === "Bearer test" ? "user-1" : null,
    canUpdateProject: async () => true,
    loadWorkspace: async () => ({ version: 1, state }),
    resolveProjectName: async () => input.projectName ?? null,
    syncProjectWorkspace: input.onSync,
  });
  return { runs, state, prompts };
}

test("real feasibility rejects absent models and demo placeholders before creating runs", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  const { runs, prompts } = registerTestRoutes({ app });
  for (const providerSettings of [
    undefined,
    { providerConfigId: "provider-1", model: "" },
    { providerConfigId: "offline-demo", model: "test-model" },
    { providerConfigId: "provider-1", model: "offline-demo-fixed-artifacts" },
    { providerConfigId: "provider-1", model: "unlisted-model" },
  ]) {
    const response = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: {
      projectId: "real-model-guard-project", selectedArtifacts: ["context"], providerSettings,
    } });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(Array.from(runs.values()).length, 0);
    assert.equal(prompts.length, 0);
  }
});

test("configured demo projects generate feasibility without provider or renderer access", async (t) => {
  const previous = process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS;
  process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = "图书馆座位预约系统";
  t.after(() => { if (previous === undefined) delete process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS; else process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = previous; });
  const app = Fastify();
  t.after(() => app.close());
  let synced = false;
  const fixture = registerTestRoutes({ app, projectName: "图书馆座位预约系统演示",
    state: { rules: librarySeatDemoFixture.requirementSnapshot.rules, requirementBaseline: librarySeatDemoFixture.requirementSnapshot.requirementBaseline },
    outputs: [], renderClient: async () => { throw new Error("Offline data must not use the render service"); },
    onSync: async () => { synced = true; },
  });
  const request = { method: "POST" as const, url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: {
    projectId: "project-1", selectedArtifacts: ["implementation"], providerSettings: { providerConfigId: "nonexistent-provider", model: "mock" },
  } };
  assert.equal((await app.inject(request)).statusCode, 409);
  request.payload.selectedArtifacts = ["context", "business-flow", "implementation"];
  const start = await app.inject(request);
  assert.equal(start.statusCode, 202, start.body);
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.ok(snapshot.businessFlow?.svg.svg.includes("校验通过"));
  assert.equal(snapshot.implementationPlan.candidates.length, 2);
  assert.equal(fixture.prompts.length, 0);
  assert.equal(snapshot.providerSettings.model, "offline-demo-fixed-artifacts");
  assert.equal(snapshot.providerSettings.providerConfigId, "offline-demo");
  assert.equal(synced, true);
});

test("persists the run before syncing context and implementation from the selected model", async () => {
  const app = Fastify();
  let runs = createRunRecordStore();
  let synced = false;
  const registered = registerTestRoutes({
    app,
    onSync: async (record) => {
      assert.equal(runs.has(record.snapshot.runId), true);
      synced = true;
    },
  });
  runs = registered.runs;
  const start = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: { projectId: "project-1", selectedArtifacts: ["context", "business-flow", "implementation"], providerSettings: { providerConfigId: "provider-1", model: "test-model" } } });
  assert.equal(start.statusCode, 202, start.body);
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "completed");
  const generationStages = runs.get(snapshot.runId)!.events
    .filter((event) => event.type === "stage_started")
    .map((event) => "stage" in event ? event.stage : null);
  assert.deepEqual(generationStages.slice(0, 2), ["generate_context", "generate_business_flow"]);
  assert.equal(generationStages.at(-1), "generate_implementation");
  const lifecycleEvents = runs.get(snapshot.runId)!.events.filter((event) =>
    event.type === "stage_started" || event.type === "stage_finished",
  );
  for (const stage of new Set(generationStages)) {
    const boundaries = lifecycleEvents.filter((event) => event.stage === stage);
    assert.equal(boundaries[0]?.type, "stage_started");
    assert.equal(boundaries.at(-1)?.type, "stage_finished");
  }
  const implementationStart = lifecycleEvents.findIndex((event) => event.type === "stage_started" && event.stage === "generate_implementation");
  for (const stage of ["render_context", "render_business_flow"]) assert.ok(lifecycleEvents.findIndex((event) => event.type === "stage_finished" && event.stage === stage) < implementationStart);
  assert.ok(snapshot.businessFlow?.model.swimlanes.length);
  assert.equal(snapshot.contextModel.relationships.length, 1);
  assert.equal(snapshot.implementationPlan.candidates.length, 2);
  assert.equal(snapshot.implementationPlan.candidates[0].implementation.architecture.modules[0].id, "candidate-1-module-1");
  assert.equal(snapshot.implementationPlan.candidates[0].implementation.milestones[0].id, "candidate-1-milestone-1");
  assert.equal(snapshot.implementationPlan.candidates[0].implementation.risks[0].id, "candidate-1-risk-1");
  assert.equal(snapshot.providerSettings.model, "test-model");
  assert.equal(synced, true);
  const events = await app.inject({ method: "GET", url: `/api/feasibility-runs/${snapshot.runId}/events`, headers: { authorization: "Bearer test" } });
  assert.match(events.body, /"type":"completed"/u);
  await app.close();
});

test("generates a standalone business flow, repairs invalid references and emits persisted activity artifacts", async () => {
  const app = Fastify();
  const invalid = JSON.parse(businessFlowOutput);
  invalid.traceability[0].requirementId = "R-invalid";
  const { runs } = registerTestRoutes({ app, outputs: [JSON.stringify(invalid), businessFlowOutput] });
  const start = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: {
    projectId: "project-1", selectedArtifacts: ["business-flow"], providerSettings: { providerConfigId: "provider-1", model: "test-model" },
  } });
  assert.equal(start.statusCode, 202, start.body);
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.equal(snapshot.contextModel, null);
  assert.equal(snapshot.implementationPlan, null);
  assert.equal(snapshot.businessFlow.model.diagramKind, "activity");
  assert.match(snapshot.businessFlow.plantUml.source, /计算总成本/);
  assert.match(snapshot.businessFlow.svg.svg, /activity/);
  assert.equal(snapshot.businessFlow.fingerprint, snapshot.requirementSource.fingerprint);
  assert.equal(snapshot.generationDiagnostics.repairs[0].section, "business-flow");
  assert.equal(snapshot.generationDiagnostics.repairs[0].succeeded, true);
  assert.ok(runs.get(snapshot.runId)?.events.some((event) => event.type === "artifact_ready" && event.artifactKind === "feasibilityBusinessFlow"));
  await app.close();
});

test("does not publish a partial business flow after structured output remains invalid", async () => {
  const app = Fastify();
  registerTestRoutes({ app, outputs: ["{}", "{}", "{}"] });
  const start = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: {
    projectId: "project-1", selectedArtifacts: ["business-flow"], providerSettings: { providerConfigId: "provider-1", model: "test-model" },
  } });
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.businessFlow, null);
  assert.equal(snapshot.error.code, "RUN_STRUCTURED_OUTPUT_INVALID");
  assert.match(snapshot.error.message, /业务与系统流程图/);
  await app.close();
});

test("requires provider settings and rejects implementation without a current context", async () => {
  const app = Fastify();
  registerTestRoutes({ app });
  const missingProvider = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: { projectId: "project-1", selectedArtifacts: ["context"] } });
  assert.equal(missingProvider.statusCode, 400);
  const dependency = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: { projectId: "project-1", selectedArtifacts: ["implementation"], providerSettings: { providerConfigId: "provider-1", model: "test-model" } } });
  assert.equal(dependency.statusCode, 409);
  assert.match(dependency.json().message, /系统环境图/u);
  await app.close();
});

test("rejects missing or stale business flow and reuses both current diagrams as implementation input", async () => {
  const app = Fastify();
  const fixture = registerTestRoutes({ app, outputs: [implementationOutput], renderClient: async () => { throw new Error("Existing diagrams must be reused"); } });
  const source = buildAcceptedRequirementSnapshot(fixture.state.rules, fixture.state.requirementBaseline);
  Object.assign(fixture.state, { feasibilityContextModel: JSON.parse(contextOutput), feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg />", feasibilityContextFingerprint: source.snapshot.fingerprint });
  const request = { method: "POST" as const, url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: {
    projectId: "project-1", selectedArtifacts: ["implementation"], providerSettings: { providerConfigId: "provider-1", model: "test-model" },
  } };
  assert.equal((await app.inject(request)).statusCode, 409);
  const flow = createBusinessFlowArtifact(fixture.state.rules, fixture.state.requirementBaseline);
  fixture.state.feasibilityBusinessFlow = { ...flow, fingerprint: "stale" };
  assert.equal((await app.inject(request)).statusCode, 409);
  assert.equal(fixture.prompts.length, 0);
  fixture.state.feasibilityBusinessFlow = flow;
  const start = await app.inject(request);
  assert.equal(start.statusCode, 202, start.body);
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.equal(fixture.prompts.length, 1);
  assert.match(fixture.prompts[0]!, /"businessFlow"/);
  assert.match(fixture.prompts[0]!, /"actorOrLane": "system"/);
  assert.match(fixture.prompts[0]!, /"targetId": "process"/);
  assert.deepEqual(snapshot.businessFlow, flow);
  await app.close();
});

test("stops before implementation when a requested business flow fails", async () => {
  const app = Fastify();
  const fixture = registerTestRoutes({ app, outputs: [contextOutput, "{}", "{}", "{}", implementationOutput] });
  const start = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: {
    projectId: "project-1", selectedArtifacts: ["context", "business-flow", "implementation"], providerSettings: { providerConfigId: "provider-1", model: "test-model" },
  } });
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.businessFlow, null);
  assert.equal(snapshot.implementationPlan, null);
  assert.equal(fixture.prompts.length, 4);
  assert.ok(!fixture.runs.get(snapshot.runId)?.events.some((event) => event.type === "stage_started" && event.stage === "generate_implementation"));
  await app.close();
});

test("repairs invalid context once and keeps new context when implementation still fails", async () => {
  const app = Fastify();
  let syncedSnapshot: Record<string, unknown> | null = null;
  registerTestRoutes({
    app,
    outputs: ["{bad", businessFlowOutput, contextOutput, "{}", "{}"],
    onSync: async (record) => { syncedSnapshot = structuredClone(record.snapshot) as unknown as Record<string, unknown>; },
  });
  const start = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: { projectId: "project-1", selectedArtifacts: ["context", "business-flow", "implementation"], providerSettings: { providerConfigId: "provider-1", model: "test-model" } } });
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "failed");
  assert.ok(snapshot.contextModel);
  assert.equal(snapshot.implementationPlan, null);
  assert.ok(syncedSnapshot?.contextModel);
  assert.equal(syncedSnapshot?.implementationPlan, null);
  assert.equal(typeof snapshot.error.message, "string");
  await app.close();
});

test("section repair fixes integrations without overwriting valid economics", async () => {
  const app = Fastify();
  const externalContext = JSON.stringify({
    ...JSON.parse(contextOutput),
    externalSystems: [{
      id: "external-payment",
      name: "支付平台",
      sourceRequirementIds: ["R9"],
    }],
    relationships: [
      ...JSON.parse(contextOutput).relationships,
      {
        id: "rel-payment",
        sourceId: "system",
        targetId: "external-payment",
        direction: "directed",
        label: "提交支付",
        sourceRequirementIds: ["R9"],
      },
    ],
  });
  const invalidPlan = JSON.parse(implementationOutput);
  for (const candidate of invalidPlan.candidates) {
    candidate.implementation.integrations = [{
      name: "支付平台",
      contextExternalSystemId: "external-payment",
      sourceRequirementIds: ["R9"],
      provenance: "ai-estimate",
    }];
  }
  const repairedPlan = structuredClone(invalidPlan);
  for (const candidate of repairedPlan.candidates) {
    candidate.implementation.integrations[0].responsibility = "提交支付请求";
    candidate.implementation.costEstimates[0].range.minimum = 999_999;
  }
  registerTestRoutes({
    app,
    outputs: [
      externalContext,
      businessFlowOutput,
      JSON.stringify(invalidPlan),
      JSON.stringify(repairedPlan),
      JSON.stringify(repairedPlan),
    ],
  });

  const start = await app.inject({
    method: "POST",
    url: "/api/feasibility-runs",
    headers: { authorization: "Bearer test" },
    payload: {
      projectId: "project-1",
      selectedArtifacts: ["context", "business-flow", "implementation"],
      providerSettings: { providerConfigId: "provider-1", model: "test-model" },
    },
  });
  const snapshot = await waitForTerminal(app, start.json().runId);

  assert.equal(snapshot.status, "completed");
  assert.equal(
    snapshot.implementationPlan.candidates[0].implementation.integrations[0].responsibility,
    "提交支付请求",
  );
  assert.equal(
    snapshot.implementationPlan.candidates[0].implementation.costEstimates[0].range.minimum,
    10_000,
  );
  assert.ok(snapshot.generationDiagnostics.repairs.some(
    (repair: { section: string; succeeded: boolean }) =>
      repair.section === "technical" && repair.succeeded,
  ));
  await app.close();
});

test("rejects feasibility render failures without requesting a source rewrite", async () => {
  const app = Fastify();
  let renderCalls = 0;
  registerTestRoutes({
    app,
    outputs: [
      contextOutput,
      JSON.stringify({ source: "@startuml\nrectangle 修复后的上下文\n@enduml" }),
    ],
    renderClient: async (artifact) => {
      renderCalls += 1;
      if (renderCalls === 1) throw new Error("PlantUML syntax error at line 3");
      return {
        svg: "<svg>repaired</svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: "2026-07-29T00:00:00.000Z",
          sourceLength: artifact.source.length,
          durationMs: 1,
        },
      };
    },
  });

  const start = await app.inject({
    method: "POST",
    url: "/api/feasibility-runs",
    headers: { authorization: "Bearer test" },
    payload: {
      projectId: "project-1",
      selectedArtifacts: ["context"],
      providerSettings: { providerConfigId: "provider-1", model: "test-model" },
    },
  });
  const snapshot = await waitForTerminal(app, start.json().runId);

  assert.equal(snapshot.status, "completed");
  assert.ok(snapshot.contextModel);
  assert.ok(snapshot.contextPlantUml);
  assert.ok(snapshot.contextSvg);
  assert.equal(renderCalls, 2);
  await app.close();
});
test("feasibility preserves business boundary questions and implementation receives the unchanged flow", async () => {
  const app = Fastify();
  const baseline = acceptedBaseline("数量>=10");
  baseline.qualityReport.status = "passed";
  baseline.requirements[0]!.fieldProvenance = { condition: { source: "manual", status: "accepted" } };
  const flow = JSON.parse(businessFlowOutput);
  flow.model.nodes.splice(1, 0, { id: "decision", type: "decision", question: "数量边界" });
  flow.model.relationships = [
    { id: "initial", type: "control_flow", sourceId: "start", targetId: "decision" },
    { id: "yes", type: "control_flow", sourceId: "decision", targetId: "calculate", guard: "数量>10" },
    { id: "no", type: "control_flow", sourceId: "decision", targetId: "end", guard: "数量<=10" },
    { id: "done", type: "control_flow", sourceId: "calculate", targetId: "end" },
  ];
  flow.traceability.push({ requirementId: "R9", targetId: "yes", targetKind: "relationship" });
  flow.traceability.push({ requirementId: "R9", targetId: "decision", targetKind: "node" });
  const fixture = registerTestRoutes({ app, outputs: [contextOutput, JSON.stringify(flow), implementationOutput], state: {
    name: "维修预约系统", rules: [{ id: "R9", category: "功能需求", text: "数量>=10时计算总成本", relatedDiagrams: ["context", "activity"] }], requirementBaseline: baseline,
  } });
  const start = await app.inject({ method: "POST", url: "/api/feasibility-runs", headers: { authorization: "Bearer test" }, payload: { projectId: "project-1", selectedArtifacts: ["context", "business-flow", "implementation"], providerSettings: { providerConfigId: "provider-1", model: "test-model" } } });
  const snapshot = await waitForTerminal(app, start.json().runId);
  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.equal(snapshot.businessFlow.model.relationships[1].guard, "数量>10");
  assert.equal(snapshot.businessFlow.model.relationships[2].guard, "数量<=10");
  assert.equal(snapshot.visualReviews[flow.model.modelId].repairAttempts, 0);
  assert.ok(snapshot.visualReviews[flow.model.modelId].findings.some((item: { category: string }) => item.category === "business_content"));
  assert.ok(fixture.prompts.at(-1)?.includes("数量>10"));
  assert.ok(fixture.prompts.at(-1)?.includes("数量<=10"));
  await app.close();
});
