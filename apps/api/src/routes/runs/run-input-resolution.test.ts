// Verifies project run commands derive trusted inputs and accept only explicit rule-extraction drafts.
import assert from "node:assert/strict";
import test from "node:test";
import { snapshotInputFingerprint, designInputFingerprint, buildFeasibilityContextFingerprint, buildFeasibilityImplementationFingerprint, getModelGraphElements } from "@uml-platform/contracts";
import { createBusinessFlowArtifact } from "../../test-fixtures/feasibility/business-flow.js";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { resolveDesignRunInput, resolveDocumentRunInput, resolveRequirementRunInput } from "./run-input-resolution.js";

import { buildRequirementBaseline } from "../../runs/baselines/requirement-baseline.js";

const rules = [{
  id: "R1",
  type: "functional" as const,
  text: "用户可以提交维修预约。",

}];

test("project commands preserve saved rule classification without claiming actual model usage", async () => {
  const original = structuredClone(rules);
  const requirementBaseline = buildRequirementBaseline({ runId: "classification", requirementText: "用户查看信息", rules });
  const result = await resolveRequirementRunInput({ projectId: "p", selectedDiagrams: ["function"] }, undefined,
    async () => ({ state: { requirementText: "用户查看信息", rules, requirementBaseline } }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.input.rules?.[0]!.type, rules[0]!.type);
    assert.deepEqual(result.input.requirementBaseline?.rules?.[0]!.type, rules[0]!.type);
    assert.equal("relatedDiagrams" in result.input.rules![0]!, false);
  }
  assert.deepEqual(rules, original);
});

for (const kind of ["class", "navigation", "table"] as const) test(`${kind} commands do not add or validate unrelated sequence dependencies`, async () => {
  const requirementModels = (kind === "navigation" ? ["prototype"] : ["usecase", "class"]).map(source => modelFixture("requirements", source));
  const traceability = requirementModels.flatMap(model => getModelGraphElements(model).map(element => ({ ruleId: "R1", target: {
    modelId: model.modelId, diagramKind: model.diagramKind, elementId: element.id, elementKind: element.kind, label: element.name,
  } })));
  const requirementText = "顾客可以下单。";
  const designClass = modelFixture("design", "class");
  const sequence = modelFixture("design", "sequence");
  const state = { requirementText, rules, requirementBaseline: buildRequirementBaseline({ runId: "source", requirementText, rules: rules as never }),
    models: Object.fromEntries(requirementModels.map(model => [model.modelId!, model])), requirementModelTraceability: traceability,
    diagramInputFingerprints: Object.fromEntries(requirementModels.map(model => [model.diagramKind, snapshotInputFingerprint({ requirementText, rules })])),
    designModels: kind === "table" ? { class: designClass, sequence } : { sequence },
    designInputFingerprints: { class: designInputFingerprint(requirementModels, traceability), sequence: "stale:unrelated-sequence" },
  };
  const result = await resolveDesignRunInput({ projectId: "p", selectedDiagrams: [kind] }, { projectId: "p" }, async () => ({ state }));
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.deepEqual(result.input.selectedDiagrams, [kind]);
  }
});

test("design commands reject mismatched saved baseline facts without changing the workspace", async () => {
  const requirementText = "订单系统";
  const old = buildRequirementBaseline({ runId: "old", requirementText, rules: rules as never });
  const currentRules = [{ ...rules[0]!, text: "用户只能取消本人的预约。" }];
  const model = modelFixture("requirements", "function");
  const state = { requirementText, rules: currentRules, requirementBaseline: old,
    models: { function: model }, diagramInputFingerprints: { function: snapshotInputFingerprint({ requirementText, rules: currentRules }) },
    requirementModelTraceability: [{ ruleId: "R1", target: { diagramKind: "function", elementId: "a", elementKind: "node", label: "功能" } }],
  };
  const result = await resolveDesignRunInput({ projectId: "p", selectedDiagrams: ["architecture"] }, { projectId: "p" }, async () => ({ state }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.error.code, "REQUIREMENT_BASELINE_BLOCKED");
  assert.equal(old.rules?.[0]?.text, rules[0]!.text);
});

test("server rejects stale design dependencies before invoking a generator", async () => {
  const usecase = modelFixture("requirements", "usecase");
  const designClass = modelFixture("design", "class");
  const sequence = modelFixture("design", "sequence");
  const baseline = buildRequirementBaseline({ runId: "baseline", requirementText: "用户下单", rules: rules as never });
  const state = { requirementText: "用户下单", rules, requirementBaseline: baseline,
    models: { usecase }, requirementModelTraceability: [],
    diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "用户下单", rules }) },
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
    provenance: "user-edited",
    sourceRequirementIds: ["R1"],
    implementation: {
      provenance: "user-edited",
      architecture: {
        summary: "分层架构。",
        modules: [{
          id: "booking-module",
          name: "预约模块",
          responsibility: "管理预约。",
          provenance: "user-edited",
          sourceRequirementIds: ["R1"],
        }],
      },
      dataStrategy: { summary: "关系数据存储。", sourceRequirementIds: ["R1"], provenance: "user-edited" },
      integrations: [],
      deploymentAndOperations: { summary: "容器化部署。", sourceRequirementIds: ["R1"], provenance: "user-edited" },
      securityAndCompliance: { summary: "最小权限。", sourceRequirementIds: ["R1"], provenance: "user-edited" },
      milestones: [{
        id: "milestone-1",
        name: "核心交付",
        timeframe: "8 周",
        deliverables: ["可运行系统"],
        roles: ["开发者"],
        dependencies: [],
        acceptanceCriteria: ["预约流程通过验收"],
        sourceRequirementIds: ["R1"],
        provenance: "user-edited",
      }],
      risks: [],
      verdicts: [
        { category: "technical", verdict: "feasible", rationale: "技术成熟。", provenance: "user-edited" },
        { category: "operational", verdict: "feasible", rationale: "流程可执行。", provenance: "user-edited" },
        { category: "schedule", verdict: "feasible", rationale: "周期可控。", provenance: "user-edited" },
        { category: "economic", verdict: "conditional", rationale: "需确认预算。", provenance: "user-edited" },
        { category: "legal", verdict: "feasible", rationale: "无额外限制。", provenance: "user-edited" },
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
    feasibilityContextFingerprint: buildFeasibilityContextFingerprint({
      rules,
      requirementBaseline: null,
      inputs: feasibilityInputs,
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

test("feasibility reports use their dedicated context ID instead of an unrelated requirement context", async () => {
  const current = currentFeasibilityState();
  const context = { ...contextModel, modelId: "feasibility-context-custom" };
  const state = { ...current, feasibilityContextModel: context,
    models: { unrelated: { ...contextModel, modelId: "requirement-context-other" } },
    plantUml: { unrelated: "@startuml\n' unrelated\n@enduml" },
    svgArtifacts: { unrelated: { diagramKind: "context", modelId: "requirement-context-other", svg: "<svg />" } },
    feasibilityImplementationFingerprint: buildFeasibilityImplementationFingerprint({
      rules, requirementBaseline: null, contextModel: context, businessFlow: current.feasibilityBusinessFlow, inputs: current.feasibilityInputs,
    }),
  };
  const result = await resolveDocumentRunInput(command, undefined, async () => ({ state }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.input.requirementModels.filter(model => model.diagramKind === "context").map(model => model.modelId), [context.modelId]);
  assert.deepEqual(result.input.requirementPlantUml.filter(artifact => artifact.diagramKind === "context").map(artifact => artifact.modelId), [context.modelId]);
  assert.deepEqual(result.input.requirementSvgArtifacts.filter(artifact => artifact.diagramKind === "context").map(artifact => artifact.modelId), [context.modelId]);
});

test("analysis requires a saved usecase even when the same batch requests one", async () => {
  for (const selectedDiagrams of [["analysis"], ["usecase", "analysis"]]) {
    const result = await resolveRequirementRunInput({ projectId: "p", selectedDiagrams }, undefined,
      async () => ({ state: { requirementText: "用户可以下单", rules, models: {}, generatedDiagramTypes: ["usecase"] } }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.statusCode, 409);
      assert.equal(result.body.error.code, "REQUIREMENT_MODELS_MISSING");
      assert.deepEqual(result.body.error.details, { missingDiagrams: ["usecase"] });
    }
  }
});

test("analysis refuses a saved disconnected use case while regeneration may replace it", async () => {
  const usecase = modelFixture("requirements", "usecase");
  if (usecase.diagramKind !== "usecase") throw new Error("fixture");
  usecase.useCases[0]!.primaryActorId = "actor"; usecase.relationships = [];
  const input = { projectId: "p", selectedDiagrams: ["analysis"] };
  const loadWorkspace = async () => ({ state: { requirementText: "用户可以下单", rules, models: { usecase } } });
  const result = await resolveRequirementRunInput(input, undefined, loadWorkspace);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.error.code, "MODEL_STRUCTURE_INVALID");
  const replacement = await resolveRequirementRunInput({ ...input, selectedDiagrams: ["usecase", "analysis"] }, undefined, loadWorkspace);
  assert.equal(replacement.ok, true);
});

test("analysis uses the saved usecase without scheduling an implicit replacement", async () => {
  const usecase = modelFixture("requirements", "usecase");
  const result = await resolveRequirementRunInput({ projectId: "p", selectedDiagrams: ["analysis"] }, undefined,
    async () => ({ state: { requirementText: "用户可以下单", rules, models: { "saved-usecase": usecase } } }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.input.selectedDiagrams, ["analysis"]);
    assert.deepEqual(result.input.dependencyDiagrams, []);
    assert.deepEqual(result.input.contextModels, [usecase]);
  }
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

test("requirement commands reject obsolete baselines without changing workspace state", async () => {
  const requirementText = "用户可以提交维修预约。";
  const baseline = buildRequirementBaseline({ runId: "old", requirementText, rules: rules as never });
  delete baseline.schemaVersion;
  delete baseline.sourceInputFingerprint;
  delete baseline.rules;
  const currentRules = [{ ...rules[0]!, text: "用户只能取消本人的预约。" }];
  const state = { requirementText, rules: currentRules, requirementBaseline: baseline };
  const result = await resolveRequirementRunInput({ projectId: "p", selectedDiagrams: ["usecase"] }, { projectId: "p" }, async () => ({ state }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.error.code, "REQUIREMENT_BASELINE_BLOCKED");
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

test("report preflight rejects changed supplements and missing, stale, or changed business flow", async () => {
  const cases = [
    { code: "FEASIBILITY_CONTEXT_STALE", edit: (state: ReturnType<typeof currentFeasibilityState>) => { state.feasibilityInputs = { projectName: "更新后的项目名称" }; } },
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

test("report checks reject obsolete baseline formats without rebuilding them", async () => {
  const state = currentFeasibilityState();
  state.requirementBaseline = { qualityStatus: "legacy" } as never;
  const result = await resolveDocumentRunInput(command, { projectId: "project-a" }, async () => ({ state }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.statusCode, 409);
    assert.equal(result.body.error.code, "REQUIREMENT_BASELINE_BLOCKED");
  }
});

test("full report requests are rejected before reading the workspace", async () => {
  const body = { ...command, requirementText: "client-supplied", rules: [], requirementModels: [], feasibilityImplementationPlan: implementationPlan };
  await assert.rejects(resolveDocumentRunInput(body, { projectId: "project-a" }, async () => {
    assert.fail("invalid full payloads must not load the workspace");
  }), /unrecognized_keys|Unrecognized key/);
});

for (const [resolve, payload] of [
  [resolveRequirementRunInput, { projectId: "p", selectedDiagrams: ["usecase"], rules }],
  [resolveDesignRunInput, { projectId: "p", selectedDiagrams: ["class"], requirementModels: [] }],
  [resolveDocumentRunInput, { projectId: "p", documentKind: "requirementsSpec", rules }],
] as const) test(`${resolve.name} rejects client-supplied pipeline inputs`, async () => {
  await assert.rejects(resolve(payload, undefined, async () => {
    assert.fail("only project commands may load saved inputs");
  }), /unrecognized_keys|Unrecognized key/);
});

test("requirement generation requires a project workspace even when the body includes draft text", async () => {
  const result = await resolveRequirementRunInput({ requirementText: "用户查看信息", selectedDiagrams: [] }, undefined);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.body.error.code, "PROJECT_ID_REQUIRED");
});

test("downstream commands require current model receipts despite matching retired version metadata", async () => {
  const requirementText = "用户可以提交维修预约。";
  const state = { requirementText, rules,
    requirementBaseline: buildRequirementBaseline({ runId: "current", requirementText, rules }),
    models: { usecase: modelFixture("requirements", "usecase") },
    generatedDiagramTypes: ["usecase"], diagramVersions: { usecase: 1 }, rulesVersion: 1,
    requirementInputFingerprint: snapshotInputFingerprint({ requirementText, rules }),
  };
  for (const [resolve, body] of [
    [resolveDesignRunInput, { projectId: "p", selectedDiagrams: ["sequence"] }],
    [resolveDocumentRunInput, { projectId: "p", documentKind: "requirementsSpec" }],
  ] as const) {
    const result = await resolve(body, undefined, async () => ({ state }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.body.error.code, "REQUIREMENT_MODELS_STALE");
  }
});
