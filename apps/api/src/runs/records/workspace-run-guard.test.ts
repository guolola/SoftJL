// Verifies relevant input/target conflicts, partial success and legacy replay behavior.
import assert from "node:assert/strict";
import test from "node:test";
import { captureWorkspaceGuard, retryInputProblem, workspaceGuardConflicts } from "./workspace-run-guard.js";
import { createEmptySnapshot, createEmptyDocumentSnapshot } from "./snapshots.js";
import type { RunRecord } from "./run-record-store.js";
import { documentInputFromSnapshot } from "../pipelines/run-record-pipeline-starter.js";
import { createQueuedRunFromSource } from "./run-actions.js";
import { startDocumentRunRequestSchema } from "@uml-platform/contracts";
import { createProjectRunAction } from "../actions/project-run-actions.js";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
function record(snapshot: RunRecord["snapshot"]): RunRecord { return { snapshot, metadata: { projectId: "p" }, events: [], listeners: new Set(), terminal: true }; }
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
  const input = startDocumentRunRequestSchema.parse({ documentKind: "requirementsSpec", requirementText: "需求", rules: [{ id: "r1", category: "功能需求", text: "登录", relatedDiagrams: ["usecase"] }], useAiText: false, reasoning: true, providerSettings: { providerConfigId: "test-provider", model: "test" } });
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
