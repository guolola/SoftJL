// Verifies feasibility contracts reject broken context boundaries and preserve unknown user facts.
import assert from "node:assert/strict";
import test from "node:test";
import {
  contextDiagramSpecSchema,
  completeFeasibilityImplementationPlanSchema,
  feasibilityImplementationPlanSchema,
  documentKindSchema,
  feasibilityInputsSchema,
  feasibilityRunSnapshotSchema,
  feasibilityBusinessFlowArtifactSchema,
  readFeasibilityBusinessFlowArtifact,
  buildFeasibilityImplementationFingerprint,
  buildFeasibilityContextFingerprint,
  buildAcceptedRequirementSnapshot,
  createRequirementBaselineSnapshot,
  startFeasibilityRunRequestSchema,
  captureWorkspaceGuard,
  workspaceGuardConflicts,
} from "./index.js";

test("publication guards treat absent and default empty feasibility facts as the same input", () => {
  const snapshot = feasibilityRunSnapshotSchema.parse({
    runId: "current", projectId: "project", operationType: "feasibility_analysis", outputManifest: [],
    selectedArtifacts: ["context", "business-flow", "implementation"],
    providerSettings: { providerConfigId: "provider", model: "model" }, rules: [], requirementBaseline: null,
    inputs: {}, contextModel: null, contextPlantUml: null, contextSvg: null, implementationPlan: null,
    contextFingerprint: null, implementationFingerprint: null, currentStage: null, status: "running", error: null,
  });
  for (const facts of [undefined, null, {}, feasibilityInputsSchema.parse({})]) {
    const record = { snapshot: { ...snapshot, workspaceGuard: captureWorkspaceGuard({ snapshot }, { feasibilityInputs: facts }) } };
    for (const saved of [undefined, null, {}, feasibilityInputsSchema.parse({})]) {
      assert.deepEqual(workspaceGuardConflicts(record, { feasibilityInputs: saved }), []);
    }
    for (const changed of [{ projectName: "新项目名称" }, { budgetLimit: 0 }, { teamSize: 1 }]) {
      assert.deepEqual(workspaceGuardConflicts(record, { feasibilityInputs: feasibilityInputsSchema.parse(changed) }), ["feasibilityInputs"]);
    }
  }
});

test("publication guards preserve edits and clearing of supplied feasibility facts", () => {
  const snapshot = feasibilityRunSnapshotSchema.parse({
    runId: "current", projectId: "project", operationType: "feasibility_analysis", outputManifest: [],
    selectedArtifacts: ["context"], providerSettings: { providerConfigId: "provider", model: "model" },
    rules: [], requirementBaseline: null, inputs: { projectName: "原项目" },
    contextModel: null, contextPlantUml: null, contextSvg: null, implementationPlan: null,
    contextFingerprint: null, implementationFingerprint: null, currentStage: null, status: "running", error: null,
  });
  const record = { snapshot: { ...snapshot, workspaceGuard: captureWorkspaceGuard({ snapshot }, { feasibilityInputs: snapshot.inputs }) } };
  assert.deepEqual(workspaceGuardConflicts(record, { feasibilityInputs: { projectName: "原项目" } }), []);
  assert.deepEqual(workspaceGuardConflicts(record, { feasibilityInputs: { projectName: "修改名称" } }), ["feasibilityInputs"]);
  assert.deepEqual(workspaceGuardConflicts(record, { feasibilityInputs: null }), ["feasibilityInputs"]);
});

test("context fingerprints include supplementary facts and canonicalize omitted optional fields", () => {
  const source = { rules: [], requirementBaseline: null, inputs: {} };
  const original = buildFeasibilityContextFingerprint(source);
  assert.equal(original, buildFeasibilityContextFingerprint({ ...source, inputs: feasibilityInputsSchema.parse({}) }));
  for (const inputs of [{ projectName: "新名称" }, { expectedUsers: "新增外部顾客" }, { targetEnvironment: "内网部署" }, { budgetLimit: 0 }]) {
    assert.notEqual(original, buildFeasibilityContextFingerprint({ ...source, inputs }));
  }
});

test("feasibility rejects mismatched baselines without fabricating provenance", () => {
  const rule = { id: "r1", type: "functional" as const, text: "用户下单",  };
  const baseline = createRequirementBaselineSnapshot({ runId: "old", requirementText: "订单系统", rules: [rule] });
  const rules = [{ ...rule, text: "用户只能取消自己的订单" }];
  const before = structuredClone(baseline);
  assert.throws(() => buildAcceptedRequirementSnapshot(rules, baseline), /baseline does not match/);
  assert.throws(() => buildAcceptedRequirementSnapshot([], baseline), /baseline does not match/);
  assert.deepEqual(baseline, before);
  assert.deepEqual(buildAcceptedRequirementSnapshot([rule], baseline).baseline, baseline);
});

test("feasibility snapshots explicitly represent an unavailable business flow", () => {
  const snapshot = feasibilityRunSnapshotSchema.parse({
    runId: "current", projectId: "project", operationType: "feasibility_analysis", outputManifest: [], businessFlow: null, selectedArtifacts: ["context", "implementation"],
    providerSettings: { providerConfigId: "provider", model: "model" }, rules: [], requirementBaseline: null,
    inputs: {}, contextModel: null, contextPlantUml: null, contextSvg: null, implementationPlan: null,
    contextFingerprint: null, implementationFingerprint: "current-fingerprint", currentStage: null, status: "completed", error: null,
  });
  assert.equal(snapshot.businessFlow, null);
  assert.equal(snapshot.implementationFingerprint, "current-fingerprint");
});

test("business flow availability requires matching complete artifacts and fingerprints ignore renders", () => {
  const artifact = feasibilityBusinessFlowArtifactSchema.parse({
    model: { diagramKind: "activity", modelId: "flow", title: "Flow", summary: "Process request", notes: [],
      swimlanes: [{ id: "system", name: "System" }],
      nodes: [{ id: "start", type: "start" }, { id: "process", type: "activity", name: "Process", actorOrLane: "system", input: [], output: [] }, { id: "end", type: "end" }],
      relationships: [{ id: "a", type: "control_flow", sourceId: "start", targetId: "process" }, { id: "b", type: "control_flow", sourceId: "process", targetId: "end" }] },
    traceability: [{ requirementId: "R1", targetId: "process", targetKind: "node" }],
    plantUml: { diagramKind: "activity", modelId: "flow", source: "@startuml\nstart\n:Process;\nstop\n@enduml" },
    svg: { diagramKind: "activity", modelId: "flow", svg: "<svg />", renderMeta: { engine: "test", generatedAt: "2026-01-01T00:00:00.000Z", sourceLength: 30, durationMs: 1 } },
    fingerprint: "source",
  });
  assert.ok(readFeasibilityBusinessFlowArtifact(artifact));
  assert.equal(readFeasibilityBusinessFlowArtifact({ ...artifact, svg: { ...artifact.svg, modelId: "wrong" } }), null);
  assert.equal(readFeasibilityBusinessFlowArtifact({ ...artifact, plantUml: { ...artifact.plantUml, source: " " } }), null);
  assert.equal(readFeasibilityBusinessFlowArtifact({ ...artifact, model: { ...artifact.model, nodes: [] } }), null);
  const input = { rules: [], requirementBaseline: null, contextModel: null, businessFlow: artifact, inputs: {} };
  const fingerprint = buildFeasibilityImplementationFingerprint(input);
  artifact.svg.renderMeta.generatedAt = "2030-01-01T00:00:00.000Z";
  artifact.plantUml.source += "\n' regenerated";
  assert.equal(buildFeasibilityImplementationFingerprint(input), fingerprint);
  artifact.traceability[0]!.targetId = "end";
  assert.notEqual(buildFeasibilityImplementationFingerprint(input), fingerprint);
});

test("feasibility inputs default missing facts without inventing values", () => {
  const inputs = feasibilityInputsSchema.parse({ projectName: "维修预约系统" });
  assert.equal(inputs.projectName, "维修预约系统");
  assert.equal(inputs.proposedBy, "");
  assert.equal(inputs.budgetLimit, null);
  assert.deepEqual(inputs.costItems, []);
  assert.deepEqual(inputs.benefitItems, []);
});

test("context contracts keep the center system untraced and interactions traced", () => {
  const result = contextDiagramSpecSchema.safeParse({
    diagramKind: "context",
    title: "系统上下文",
    summary: "边界",
    notes: [],
    system: { id: "system", name: "维修系统", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const },
    people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const }],
    externalSystems: [],
    relationships: [{ id: "rel-1", sourceId: "customer", targetId: "system", direction: "directed", label: "预约", sourceRequirementIds: [] }],
  });
  assert.equal(result.success, false);
});

test("context people and external systems require requirement sources", () => {
  const result = contextDiagramSpecSchema.safeParse({
    diagramKind: "context",
    title: "系统上下文",
    summary: "边界",
    notes: [],
    system: { id: "system", name: "维修系统", sourceRequirementIds: [] },
    people: [{ id: "customer", name: "客户", sourceRequirementIds: [] }],
    externalSystems: [],
    relationships: [],
  });
  assert.equal(result.success, false);
});

function completeCandidate(id: string) {
  const costRange = { minimum: 10_000, maximum: 20_000, currency: "CNY", basis: "同规模项目的人力投入区间", confidence: "medium" } as const;
  return {
    id,
    name: `方案${id}`,
    summary: "完整候选方案",
    advantages: ["可分阶段交付"],
    disadvantages: ["需要持续维护"],
    estimatedCost: "人民币 1–2 万元（AI 估算）",
    estimatedSchedule: "8–12 周",
    sourceRequirementIds: ["R1"],
    provenance: "ai-estimate" as const,
    implementation: {
      provenance: "ai-estimate" as const,
      architecture: { summary: "分层架构。", modules: [{ id: `${id}-m1`, name: "工单", responsibility: "管理工单", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const }] },
      dataStrategy: { summary: "持久化业务数据。", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const },
      integrations: [],
      integrationRationale: "当前需求没有外部系统集成。",
      deploymentAndOperations: { summary: "容器化部署。", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const },
      securityAndCompliance: { summary: "最小权限。", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const },
      milestones: [{ id: `${id}-ms1`, name: "交付", timeframe: "8–12 周", deliverables: ["可运行系统"], roles: ["开发者"], dependencies: [], dependencyRationale: "仅依赖项目内部资源。", acceptanceCriteria: ["规则通过"], sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const }],
      analysisPeriodAssumption: { years: 3, basis: "按典型教学系统生命周期估算", provenance: "ai-estimate" as const },
      costEstimates: [
        { id: `${id}-capital`, name: "开发设备", category: "capital" as const, frequency: "one-time" as const, range: costRange, sourceRequirementIds: [], assumption: "按两名开发者估算", provenance: "ai-estimate" as const },
        { id: `${id}-other`, name: "上线准备", category: "other-one-time" as const, frequency: "one-time" as const, range: costRange, sourceRequirementIds: [], assumption: "包含部署准备", provenance: "ai-estimate" as const },
        { id: `${id}-recurring`, name: "年度运维", category: "recurring" as const, frequency: "annual" as const, range: costRange, sourceRequirementIds: [], assumption: "按年度服务估算", provenance: "ai-estimate" as const },
      ],
      benefitEstimates: [
        { id: `${id}-once`, name: "迁移收益", category: "one-time" as const, frequency: "one-time" as const, range: costRange, outcome: "减少初始整理工作", sourceRequirementIds: [], assumption: "按人工时估算", provenance: "ai-estimate" as const },
        { id: `${id}-ongoing`, name: "效率收益", category: "recurring" as const, frequency: "annual" as const, range: costRange, outcome: "降低重复操作", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const },
        { id: `${id}-intangible`, name: "体验提升", category: "intangible" as const, frequency: "annual" as const, range: null, outcome: "流程更清晰", sourceRequirementIds: ["R1"], provenance: "ai-estimate" as const },
      ],
      absenceDeclarations: [],
      risks: ["进度", "质量", "运维"].map((risk, index) => ({ id: `${id}-risk-${index}`, risk, probability: "medium" as const, impact: "medium" as const, mitigation: "设置检查点", owner: "项目经理", sourceRequirementIds: [], assumption: "方案风险分析", provenance: "ai-estimate" as const })),
      verdicts: ["technical", "operational", "schedule", "economic", "legal"].map((category) => ({ category, verdict: "conditional", rationale: "条件满足后可行。", provenance: "ai-estimate" })) ,
      decision: "conditional-go" as const, preconditions: ["确认预算"],
    },
  };
}

test("implementation plan requires five feasibility verdicts", () => {
  const first = completeCandidate("一");
  const result = completeFeasibilityImplementationPlanSchema.safeParse({
    overview: "采用模块化 Web 系统。",
    candidates: [{ ...first, implementation: { ...first.implementation, verdicts: [{ category: "technical", verdict: "conditional", rationale: "需验证。" }] } }, completeCandidate("二")],
    recommendedCandidateId: "一",
    recommendationRationale: "满足需求。",
  });
  assert.equal(result.success, false);
});

test("complete implementation generation requires exactly two full candidates and valid estimate ranges", () => {
  const valid = { overview: "两套方案", candidates: [completeCandidate("一"), completeCandidate("二")], recommendedCandidateId: "一", recommendationRationale: "综合成本、周期和风险推荐方案一。" };
  assert.equal(completeFeasibilityImplementationPlanSchema.safeParse(valid).success, true);
  assert.equal(completeFeasibilityImplementationPlanSchema.safeParse({ ...valid, candidates: [valid.candidates[0]] }).success, false);
  const broken = structuredClone(valid);
  broken.candidates[0]!.implementation!.costEstimates[0]!.range = { ...broken.candidates[0]!.implementation!.costEstimates[0]!.range, minimum: 30_000, maximum: 10_000 };
  assert.equal(completeFeasibilityImplementationPlanSchema.safeParse(broken).success, false);
  const contradictory = structuredClone(valid);
  contradictory.candidates[0]!.implementation!.absenceDeclarations.push({ scope: "capital-costs", reason: "无此类成本", provenance: "ai-estimate" });
  assert.equal(completeFeasibilityImplementationPlanSchema.safeParse(contradictory).success, false);
});

test("implementation plans reject global details, missing provenance and legacy provenance", () => {
  const current = { overview: "当前方案", candidates: [completeCandidate("一"), completeCandidate("二")], recommendedCandidateId: "一", recommendationRationale: "范围适用" };
  assert.equal(feasibilityImplementationPlanSchema.safeParse(current).success, true);
  const missing = structuredClone(current) as any;
  delete missing.candidates[0].implementation;
  missing.architecture = current.candidates[0]!.implementation.architecture;
  assert.equal(feasibilityImplementationPlanSchema.safeParse(missing).success, false);
  const oldProvenance = structuredClone(current) as any;
  oldProvenance.candidates[0].provenance = "legacy";
  assert.equal(feasibilityImplementationPlanSchema.safeParse(oldProvenance).success, false);
  const noProvenance = structuredClone(current) as any;
  delete noProvenance.candidates[0].implementation.dataStrategy.provenance;
  assert.equal(feasibilityImplementationPlanSchema.safeParse(noProvenance).success, false);
});

test("new feasibility enum members and run request are public", () => {
  assert.equal(documentKindSchema.parse("feasibilityStudy"), "feasibilityStudy");
  const request = startFeasibilityRunRequestSchema.parse({
    projectId: "p1",
    selectedArtifacts: ["context", "implementation"],
    providerSettings: { providerConfigId: "provider-1", model: "model-1" },
  });
  assert.deepEqual(request.selectedArtifacts, ["context", "implementation"]);
  assert.equal(request.providerSettings.model, "model-1");
  assert.equal(startFeasibilityRunRequestSchema.safeParse({
    projectId: "p1",
    selectedArtifacts: ["context"],
  }).success, false);
  assert.equal(startFeasibilityRunRequestSchema.safeParse({
    projectId: "p1",
    selectedArtifacts: ["context", "context"],
    providerSettings: { providerConfigId: "provider-1", model: "model-1" },
  }).success, false);
});
