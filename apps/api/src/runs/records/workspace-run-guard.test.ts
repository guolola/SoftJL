// Verifies relevant input/target conflicts, partial success and legacy replay behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { captureWorkspaceGuard, retryInputProblem, workspaceGuardConflicts } from "./workspace-run-guard.js";
import { createEmptySnapshot, createEmptyDocumentSnapshot, createEmptyDesignSnapshot } from "./snapshots.js";
import type { RunRecord } from "./run-record-store.js";
import { documentInputFromSnapshot } from "../pipelines/run-record-pipeline-starter.js";
import { createQueuedRunFromSource } from "./run-actions.js";
import { startDocumentRunRequestSchema } from "@uml-platform/contracts";
import { createProjectRunAction } from "../actions/project-run-actions.js";
import { modelFixture } from "@uml-platform/contracts/testing";
function record(snapshot: RunRecord["snapshot"]): RunRecord { return { snapshot, metadata: { projectId: "p" }, events: [], listeners: new Set(), terminal: true }; }

test("empty persisted rule fields match the browser's initial array without accepting real edits", () => {
  const run = record(createEmptySnapshot("first-rules", "用户可以下单", [], []));
  run.snapshot.workspaceGuard = captureWorkspaceGuard(run, {});
  const browser = { requirementText: null, rules: [], requirementBaseline: null };
  assert.deepEqual(workspaceGuardConflicts(run, browser), []);
  assert.deepEqual(captureWorkspaceGuard(run, browser), run.snapshot.workspaceGuard);
  assert.deepEqual(workspaceGuardConflicts(run, { ...browser, rules: [{ id: "manual", type: "functional", text: "用户手工新增的规则" }] }), ["rules"]);
});

test("design retry accepts its exact resolved source models despite an earlier workspace catalog fingerprint", () => {
  const model = modelFixture("requirements", "usecase") as import("@uml-platform/contracts").DiagramModelSpec;
  const run = record(createEmptyDesignSnapshot("design", { selectedDiagrams: ["sequence"], requirementModels: [model],
    requirementModelTraceability: [], requirementBaseline: createEmptySnapshot("baseline", "需求", [], []).requirementBaseline! }));
  const state = { requirementText: "需求", rules: [], models: { [model.modelId ?? model.diagramKind]: model } };
  run.snapshot.workspaceGuard = captureWorkspaceGuard(run, { ...state, models: {} });
  if (!("diagramErrors" in run.snapshot)) throw new Error("expected design snapshot");
  run.snapshot.diagramErrors["sequence:failed"] = { stage: "generate_design_sequence", error: {
    code: "RUN_STRUCTURED_OUTPUT_INVALID", category: "generation", retryable: true, message: "invalid output",
  } };
  const originalGuard = structuredClone(run.snapshot.workspaceGuard);
  assert.deepEqual(workspaceGuardConflicts(run, state), ["models"]);
  assert.equal(retryInputProblem(run, state), null);
  assert.deepEqual(run.snapshot.workspaceGuard, originalGuard, "checking retry never rewrites the historical guard");
  assert.match(retryInputProblem(run, { ...state, requirementText: "人工修改需求" }) ?? "", /已变更/);
  assert.match(retryInputProblem(run, { ...state, models: { [model.modelId ?? model.diagramKind]: { ...model, title: "人工修改" } } }) ?? "", /已变更/);
  assert.match(retryInputProblem(run, { ...state, designModels: { sequence: { diagramKind: "sequence", title: "人工设计" } } }) ?? "", /已变更/);
});
test("retry rejects changed sources/targets but permits unrelated edits and its own accepted outputs", () => {
  const model = { diagramKind: "usecase" as const, title: "用例", summary: "", notes: [], actors: [], useCases: [], relationships: [], systemBoundaries: [] };
  const run = record(createEmptySnapshot("source", "需求", ["usecase"], []));
  const state = { requirementText: "需求", rules: [], models: {} };
  run.snapshot.workspaceGuard = captureWorkspaceGuard(run, state);
  assert.equal(retryInputProblem(run, { ...state, theme: "dark", designModels: { class: "unrelated" } }), null);
  assert.match(retryInputProblem(run, { ...state, requirementText: "新需求" }) ?? "", /已变更/);
  assert.match(retryInputProblem(run, { ...state, models: { usecase: model } }) ?? "", /已变更/);
  if (!("models" in run.snapshot)) throw new Error("expected model snapshot");
  run.snapshot.models = [model]; run.snapshot.outputManifest = [{ kind: "model", id: "usecase", diagramKind: "usecase" }];
  assert.deepEqual(workspaceGuardConflicts(run, { ...state, models: { usecase: model } }), []);
  assert.ok(workspaceGuardConflicts(run, { ...state, models: { usecase: { ...model, title: "人工编辑" } } }).length);
});
test("document retry restores original input and strips credentials; legacy input fails explicitly", () => {
  const input = startDocumentRunRequestSchema.parse({ documentKind: "requirementsSpec", requirementText: "需求", rules: [{ id: "r1", type: "functional" as const, text: "登录",  }], useAiText: false, reasoning: true, providerSettings: { providerConfigId: "test-provider", model: "test" } });
  input.requirementModels = [modelFixture("requirements", "usecase") as typeof input.requirementModels[number]];
  input.designModels = [modelFixture("design", "class") as typeof input.designModels[number]];
  input.documentStyle = { presetName: "courseDesign", autoNumberHeadings: false, includeTableOfContents: false };
  const source = record(createEmptyDocumentSnapshot("doc", input));
  assert.doesNotMatch(JSON.stringify(source.snapshot), /secret|apiKey/);
  const runs = new Map<string, RunRecord>();
  createQueuedRunFromSource({ runs, source, action: "retry", sourceRunId: "doc", runId: "retry" });
  const { providerSettings: _credentials, ...expected } = input;
  assert.deepEqual(documentInputFromSnapshot(runs.get("retry")!), expected);
  const legacy = record(createEmptyDocumentSnapshot("legacy", { documentKind: "requirementsSpec", requirementText: "需求" }));
  assert.match(retryInputProblem(legacy, {}) ?? "", /完整文档输入/);
  assert.throws(() => documentInputFromSnapshot(legacy), /完整文档输入/);
});

test("stale replay is rejected before provider lookup, charging or scheduling", async () => {
  const source = record(createEmptySnapshot("stale", "需求", ["usecase"], []));
  source.snapshot.status = "failed";
  source.snapshot.workspaceGuard = captureWorkspaceGuard(source, { requirementText: "需求", rules: [] });
  let status = 0;
  let sent: unknown;
  await createProjectRunAction({ action: "retry", projectId: "p", runId: "stale", runs: new Map([["stale", source]]),
    request: {} as never, reply: { code(code: number) { status = code; return this; }, send(value: unknown) { sent = value; return value; } } as never,
    loadProjectWorkspace: async () => ({ state: { requirementText: "新需求", rules: [] } }),
    runAccessGuard: { async resolveRunAccess() { throw new Error("must not reach usage accounting"); } },
    providerConfigs: { async get() { throw new Error("must not resolve provider"); } } as never,
    billingEntitlements: { async reserveRunUsage() { throw new Error("must not charge"); } } as never,
    providerRateLimitPolicy: {} as never, startRecordPipeline() { throw new Error("must not enqueue"); },
  });
  assert.equal(status, 409);
  assert.match(JSON.stringify(sent), /RUN_RETRY_INPUT_STALE/);
});
