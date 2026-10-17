// Verifies project run commands derive trusted inputs and accept only explicit rule-extraction drafts.
import assert from "node:assert/strict";
import test from "node:test";
import { snapshotInputFingerprint, designInputFingerprint, buildFeasibilityImplementationFingerprint } from "@uml-platform/contracts";
import { createBusinessFlowArtifact } from "../../test-fixtures/feasibility/business-flow.js";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { resolveDesignRunInput, resolveDocumentRunInput, resolveRequirementRunInput } from "./run-input-resolution.js";

import { buildRequirementBaseline } from "../../runs/baselines/requirement-baseline.js";

const rules = [{
  id: "R1",
  category: "功能需求",
  text: "用户可以提交维修预约。",
  relatedDiagrams: ["usecase"],
}];

test("document inputs reconcile an outdated baseline from the complete explicit rule list", async () => {
  const requirementText = "用户可以提交维修预约。";
  const baseline = buildRequirementBaseline({ runId: "old", requirementText, rules: rules as never });
  const changed = [{ ...rules[0]!, text: "用户只能取消本人的预约。" }];
  const result = await resolveDocumentRunInput({ documentKind: "requirementsSpec", requirementText, rules: changed, requirementBaseline: baseline }, undefined);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.input.requirementBaseline?.rules?.[0]?.text, changed[0]!.text);
});

test("design commands rebuild obsolete baseline facts without changing the captured workspace", async () => {
  const requirementText = "订单系统";
  const old = buildRequirementBaseline({ runId: "old", requirementText, rules: rules as never });
  const currentRules = [{ ...rules[0]!, text: "用户只能取消本人的预约。" }];
  const model = modelFixture("requirements", "function");
  const state = { requirementText, rules: currentRules, requirementBaseline: old,
    models: { function: model }, modelInputFingerprints: { function: snapshotInputFingerprint({ requirementText, rules: currentRules }) },
    requirementModelTraceability: [{ ruleId: "R1", target: { diagramKind: "function", elementId: "a", elementKind: "node", label: "功能" } }],
  };
  const result = await resolveDesignRunInput({ projectId: "p", selectedDiagrams: ["architecture"] }, { projectId: "p" }, async () => ({ state }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.requirementBaseline.rules?.[0]?.text, currentRules[0]!.text);
    assert.deepEqual(result.workspaceState, state);
  }
  assert.equal(old.rules?.[0]?.text, rules[0]!.text);
});

test("server rejects stale design dependencies before invoking a generator", async () => {
  const usecase = modelFixture("requirements", "usecase");
  const designClass = modelFixture("design", "class");
  const sequence = modelFixture("design", "sequence");
  const baseline = buildRequirementBaseline({ runId: "baseline", requirementText: "用户下单", rules: rules as never });
  const state = { requirementText: "用户下单", rules, requirementBaseline: baseline,
    models: { usecase }, requirementModelTraceability: [],
    modelInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "用户下单", rules }) },
    designModels: { class: designClass, sequence },
    designInputFingerprints: { class: "stale:old", sequence: designInputFingerprint([usecase], []) },
  };
  const result = await resolveDesignRunInput({ projectId: "p", selectedDiagrams: ["table"] }, { projectId: "p" }, async () => ({ state }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.error.code, "DESIGN_MODELS_STALE");
});

const contextModel = {
  diagramKind: "context",
  modelId: "context",
  title: "维修预约系统上下文",
  summary: "系统边界",
  notes: [],
  system: { id: "system", name: "维修预约系统", sourceRequirementIds: [] },
  people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
  externalSystems: [],
  relationships: [{
    id: "booking",
    sourceId: "customer",
    targetId: "system",
    direction: "directed",
    label: "提交预约",
    sourceRequirementIds: ["R1"],
  }],
};

const implementationPlan = {
  overview: "采用模块化 Web 实现。",
  candidates: [{
    id: "option-a",
    name: "模块化方案",
    summary: "按模块交付。",
    advantages: ["易于实施"],
    disadvantages: ["需要维护模块边界"],
    estimatedCost: "待确认",
    estimatedSchedule: "8 周",
    sourceRequirementIds: ["R1"],
    implementation: {
      architecture: {
        summary: "分层架构。",
        modules: [{
          id: "booking-module",
          name: "预约模块",
          responsibility: "管理预约。",
          sourceRequirementIds: ["R1"],
        }],
      },
      dataStrategy: { summary: "关系数据存储。", sourceRequirementIds: ["R1"] },
      integrations: [],
      deploymentAndOperations: { summary: "容器化部署。", sourceRequirementIds: ["R1"] },
      securityAndCompliance: { summary: "最小权限。", sourceRequirementIds: ["R1"] },
      milestones: [{
        id: "milestone-1",
        name: "核心交付",
        timeframe: "8 周",
        deliverables: ["可运行系统"],
        roles: ["开发者"],
        dependencies: [],
        acceptanceCriteria: ["预约流程通过验收"],
        sourceRequirementIds: ["R1"],
      }],
      risks: [],
      verdicts: [
        { category: "technical", verdict: "feasible", rationale: "技术成熟。" },
        { category: "operational", verdict: "feasible", rationale: "流程可执行。" },
        { category: "schedule", verdict: "feasible", rationale: "周期可控。" },
        { category: "economic", verdict: "conditional", rationale: "需确认预算。" },
        { category: "legal", verdict: "feasible", rationale: "无额外限制。" },
      ],
      decision: "conditional-go",
      preconditions: ["确认预算"],
    },
  }],
  recommendedCandidateId: "option-a",
  recommendationRationale: "适合当前规模。",
};

function currentFeasibilityState() {
  const feasibilityInputs = {};
  const businessFlow = createBusinessFlowArtifact(rules);
  return {
    requirementText: "",
    rules,
    requirementBaseline: null,
    models: {},
    designModels: {},
    feasibilityInputs,
    feasibilityBusinessFlow: businessFlow,
    feasibilityContextModel: contextModel,
    feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg><text>维修预约系统</text></svg>",
    feasibilityContextFingerprint: snapshotInputFingerprint({
      rules,
      requirementBaseline: null,
    }),
    feasibilityImplementationPlan: implementationPlan,
    feasibilityImplementationFingerprint: buildFeasibilityImplementationFingerprint({
      rules,
      requirementBaseline: null,
      businessFlow,
      contextModel,
      inputs: feasibilityInputs,
    }),
  };
}

const command = {
  projectId: "project-a",
  documentKind: "feasibilityStudy",
  providerSettings: {
    providerConfigId: "provider-a",
    model: "model-a",
  },
  useAiText: false,
};

test("analysis refuses a saved disconnected use case while regeneration may replace it", async () => {
  const usecase = modelFixture("requirements", "usecase");
  if (usecase.diagramKind !== "usecase") throw new Error("fixture");
  usecase.useCases[0]!.primaryActorId = "actor"; usecase.relationships = [];
  const input = { requirementText: "用户可以下单", rules, contextModels: [usecase], selectedDiagrams: ["analysis"] };
  const result = await resolveRequirementRunInput(input, undefined);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.error.code, "MODEL_STRUCTURE_INVALID");
  const replacement = await resolveRequirementRunInput({ ...input, selectedDiagrams: ["usecase", "analysis"] }, undefined);
  assert.equal(replacement.ok, true);
});

test("project design commands reject invalid source structure before traceability or content confirmation", async () => {
  const usecase = modelFixture("requirements", "usecase");
  if (usecase.diagramKind !== "usecase") throw new Error("fixture");
  usecase.relationships = [];
  const result = await resolveDesignRunInput({ projectId: "project-a", selectedDiagrams: ["class"] }, { projectId: "project-a" },
    async () => ({ state: { requirementText: "用户可以下单", rules, models: { usecase }, manualModelEditStatus: { usecase: "confirmed" } } }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.error.code, "MODEL_STRUCTURE_INVALID");
});

test("project model commands use the saved baseline rather than caller task metadata", async () => {
  const requirementText = "用户可以提交维修预约。";
  const baseline = buildRequirementBaseline({ runId: "baseline-run", requirementText, rules: rules as never });
  const result = await resolveRequirementRunInput(
    { projectId: "project-a", selectedDiagrams: ["usecase"] },
    { projectId: "project-a" },
    async () => ({ state: { requirementText, rules, requirementBaseline: baseline } }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.input.requirementBaseline, baseline);
});

test("requirement commands rebuild legacy baselines from current rules without changing workspace state", async () => {
  const requirementText = "用户可以提交维修预约。";
  const baseline = buildRequirementBaseline({ runId: "old", requirementText, rules: rules as never });
  delete baseline.schemaVersion;
  delete baseline.sourceInputFingerprint;
  delete baseline.rules;
  const currentRules = [{ ...rules[0]!, text: "用户只能取消本人的预约。" }];
  const state = { requirementText, rules: currentRules, requirementBaseline: baseline };
  const result = await resolveRequirementRunInput({ projectId: "p", selectedDiagrams: ["usecase"] }, { projectId: "p" }, async () => ({ state }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.requirementBaseline?.schemaVersion, 2);
    assert.equal(result.input.requirementBaseline?.rules?.[0]?.text, currentRules[0]!.text);
    assert.deepEqual(result.workspaceState, state);
  }
  assert.equal(baseline.schemaVersion, undefined);
});

test("rules-only extraction uses the draft text but excludes persisted old rules", async () => {
  let loaded = false;
  const result = await resolveRequirementRunInput(
    { projectId: "project-a", selectedDiagrams: [], requirementText: "新需求", analysisTargetUseCaseIds: [] },
    { projectId: "project-a" },
    async () => {
      loaded = true;
      return { state: { requirementText: "旧需求", rules } };
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(loaded, true);
  assert.equal(result.input.requirementText, "新需求");
  assert.deepEqual(result.input.rules, []);
});

test("rules-only extraction accepts a draft when the saved project text is empty", async () => {
  const result = await resolveRequirementRunInput(
    { projectId: "project-a", selectedDiagrams: [], requirementText: "读者可以预约座位。" },
    { projectId: "project-a" },
    async () => ({ state: { requirementText: "", rules } }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.requirementText, "读者可以预约座位。");
  assert.deepEqual(result.input.rules, []);
});

test("rules-only extraction still rejects a blank draft", async () => {
  const result = await resolveRequirementRunInput(
    { projectId: "project-a", selectedDiagrams: [], requirementText: "   " },
    { projectId: "project-a" },
    async () => ({ state: { requirementText: "", rules } }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error.code, "REQUIREMENT_SOURCE_MISSING");
});

test("current feasibility analysis enables a report without requirement or design models", async () => {
  const result = await resolveDocumentRunInput(
    command,
    { projectId: "project-a" },
    async () => ({ state: currentFeasibilityState() }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.documentKind, "feasibilityStudy");
  assert.equal(result.input.requirementModels.length, 1);
  assert.equal(result.input.designModels.length, 0);
  assert.equal(result.input.feasibilityImplementationPlan?.recommendedCandidateId, "option-a");
});

test("missing feasibility solution still blocks report generation", async () => {
  const state = currentFeasibilityState();
  state.feasibilityImplementationPlan = null as never;

  const result = await resolveDocumentRunInput(
    command,
    { projectId: "project-a" },
    async () => ({ state }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error.code, "FEASIBILITY_CONTEXT_MISSING");
});

test("stale feasibility analysis still blocks report generation", async () => {
  const state = currentFeasibilityState();
  state.feasibilityImplementationFingerprint = "stale";

  const result = await resolveDocumentRunInput(
    command,
    { projectId: "project-a" },
    async () => ({ state }),
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.error.code, "FEASIBILITY_IMPLEMENTATION_STALE");
});

test("report preflight rejects missing, stale, or changed business flow", async () => {
  const cases = [
    { code: "FEASIBILITY_BUSINESS_FLOW_MISSING", edit: (state: ReturnType<typeof currentFeasibilityState>) => { state.feasibilityBusinessFlow = null as never; } },
    { code: "FEASIBILITY_BUSINESS_FLOW_STALE", edit: (state: ReturnType<typeof currentFeasibilityState>) => { state.feasibilityBusinessFlow.fingerprint = "stale"; } },
    { code: "FEASIBILITY_IMPLEMENTATION_STALE", edit: (state: ReturnType<typeof currentFeasibilityState>) => { state.feasibilityBusinessFlow.model.nodes[1]!.name += " changed"; } },
    { code: "FEASIBILITY_IMPLEMENTATION_STALE", edit: (state: ReturnType<typeof currentFeasibilityState>) => { state.feasibilityBusinessFlow.traceability[0]!.targetId = "end"; } },
  ];
  for (const entry of cases) {
    const state = currentFeasibilityState();
    entry.edit(state);
    const result = await resolveDocumentRunInput(command, { projectId: "project-a" }, async () => ({ state }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.body.error.code, entry.code);
  }
});

test("rerendering business flow leaves implementation report inputs current", async () => {
  const state = currentFeasibilityState();
  state.feasibilityBusinessFlow.svg.renderMeta.generatedAt = "2030-01-01T00:00:00.000Z";
  state.feasibilityBusinessFlow.svg.svg = "<svg><text>rerendered</text></svg>";
  const result = await resolveDocumentRunInput(command, { projectId: "project-a" }, async () => ({ state }));
  assert.equal(result.ok, true);
});

test("report checks share the generation fallback for obsolete baseline formats", async () => {
  const state = currentFeasibilityState();
  state.requirementBaseline = { qualityStatus: "legacy" } as never;
  const result = await resolveDocumentRunInput(command, { projectId: "project-a" }, async () => ({ state }));
  assert.equal(result.ok, true);
});

test("full legacy report requests cannot bypass dependency checks or inject different artifacts", async () => {
  const body = { ...command, requirementText: "client-supplied", rules: [], requirementModels: [], feasibilityImplementationPlan: implementationPlan };
  const state = currentFeasibilityState();
  const missingFlow = await resolveDocumentRunInput(body, { projectId: "project-a" }, async () => ({ state: { ...state, feasibilityBusinessFlow: null } }));
  assert.equal(missingFlow.ok, false);
  if (!missingFlow.ok) assert.equal(missingFlow.body.error.code, "FEASIBILITY_BUSINESS_FLOW_MISSING");
  const current = await resolveDocumentRunInput(body, { projectId: "project-a" }, async () => ({ state }));
  assert.equal(current.ok, true);
  if (current.ok) {
    assert.equal(current.input.requirementModels.length, 1);
    assert.notEqual(current.input.requirementText, "client-supplied");
  }
});
