// Verifies run action snapshot cloning preserves retry/rerun target scope.
import assert from "node:assert/strict";
import test from "node:test";
import type {

  DesignRunSnapshot,
  FeasibilityRunSnapshot,
  RunSnapshot,
} from "@uml-platform/contracts";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import { createQueuedRunFromSource, isRetryableRun } from "./run-actions.js";
import type { RunRecord, RunRecordStore } from "./run-record-store.js";
import {

  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptyFeasibilitySnapshot,
  createEmptySnapshot,
} from "./snapshots.js";
import { createRunError } from "../pipelines/shared/errors.js";
import { feasibilityInputsSchema } from "@uml-platform/contracts";
import { createBusinessFlowArtifact } from "../../test-fixtures/feasibility/business-flow.js";

const rule = {
  id: "REQ-001",
  type: "functional" as const,
  text: "用户可以查看图书。",

};

for (const reasoning of [true, false]) test(`engineering retries retain reasoning=${reasoning}`, () => {
  const baseline = buildRequirementBaseline({ runId: "baseline", requirementText: rule.text, rules: [rule] });
  const snapshots = [
    createEmptyDesignSnapshot("source-design", { selectedDiagrams: ["sequence"], requirementBaseline: baseline, requirementModels: [], requirementModelTraceability: [], reasoning }),
    createEmptyDocumentSnapshot("source-document", { documentKind: "requirementsSpec", requirementText: rule.text, requirementBaseline: baseline, reasoning, rules: [rule], requirementModels: [], designModels: [] }),
    createEmptyFeasibilitySnapshot("source-feasibility", { projectId: "project-a", selectedArtifacts: ["context"], providerSettings: { providerConfigId: "provider", model: "model" }, rules: [rule], requirementBaseline: baseline, inputs: feasibilityInputsSchema.parse({}), reasoning }),
  ];
  for (const snapshot of snapshots) for (const action of ["retry", "rerun"] as const) {
    snapshot.status = "failed";
    const runs: RunRecordStore = new Map();
    createQueuedRunFromSource({ runs, source: createSourceRecord(snapshot), action, sourceRunId: snapshot.runId, runId: "new-run" });
    assert.equal((runs.get("new-run")!.snapshot as typeof snapshot).reasoning, reasoning);
  }
});

function createSourceRecord(snapshot: RunRecord["snapshot"]): RunRecord {
  return {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: { createdAt: "2026-06-21T00:00:00.000Z" },
  };
}

for (const field of ["operationType", "outputManifest"]) test(`retries reject source snapshots without ${field} before queuing a new run`, () => {
  const snapshot = createEmptySnapshot("obsolete", rule.text, ["usecase"], [rule]);
  Reflect.deleteProperty(snapshot, field);
  const source = createSourceRecord(snapshot);
  const runs: RunRecordStore = new Map();
  assert.throws(() => createQueuedRunFromSource({
    runs, source, action: "retry", sourceRunId: snapshot.runId, runId: "blocked",
  }), /不符合当前生成契约/);
  assert.equal(runs.size, 0);
  assert.deepEqual(source.events, []);
});

test("design retries reject missing baselines instead of inventing an empty one", () => {
  const baseline = buildRequirementBaseline({ runId: "baseline", requirementText: rule.text, rules: [rule] });
  const snapshot = createEmptyDesignSnapshot("obsolete-design", {
    selectedDiagrams: ["class"], requirementBaseline: baseline, requirementModels: [], requirementModelTraceability: [],
  });
  snapshot.requirementBaseline = null;
  const runs: RunRecordStore = new Map();
  assert.throws(() => createQueuedRunFromSource({
    runs, source: createSourceRecord(snapshot), action: "rerun", sourceRunId: snapshot.runId, runId: "blocked",
  }), /不符合当前生成契约/);
  assert.equal(runs.size, 0);
});

test("feasibility retries preserve the completed business flow used as implementation input", () => {
  const runs: RunRecordStore = new Map();
  const businessFlow = createBusinessFlowArtifact([rule]);
  const sourceSnapshot = createEmptyFeasibilitySnapshot("source-feasibility", {
    projectId: "project-a", selectedArtifacts: ["implementation"],
    providerSettings: { providerConfigId: "provider-a", model: "model-a" },
    rules: [rule], requirementBaseline: null, inputs: feasibilityInputsSchema.parse({}), businessFlow,
  });
  sourceSnapshot.status = "failed";
  createQueuedRunFromSource({ runs, source: createSourceRecord(sourceSnapshot), action: "retry", sourceRunId: sourceSnapshot.runId, runId: "retry-feasibility" });
  const retry = runs.get("retry-feasibility")!.snapshot as FeasibilityRunSnapshot;
  assert.deepEqual(retry.businessFlow, businessFlow);
  assert.deepEqual(retry.selectedArtifacts, ["implementation"]);
  assert.equal(retry.status, "queued");
});

test("createQueuedRunFromSource preserves requirement analysis target ids", () => {
  const runs: RunRecordStore = new Map();
  const sourceSnapshot = createEmptySnapshot(
    "source-requirements-run",
    "用户可以查看图书。",
    ["analysis"],
    [rule],
    { analysisTargetUseCaseIds: ["uc_view_books"] },
  );
  sourceSnapshot.status = "failed";
  const source = createSourceRecord(sourceSnapshot);

  createQueuedRunFromSource({
    runs,
    source,
    action: "retry",
    sourceRunId: sourceSnapshot.runId,
    runId: "retry-requirements-run",
  });

  const retrySnapshot = runs.get("retry-requirements-run")
    ?.snapshot as RunSnapshot;
  assert.deepEqual(retrySnapshot.selectedDiagrams, ["analysis"]);
  assert.deepEqual(retrySnapshot.analysisTargetUseCaseIds, ["uc_view_books"]);
  assert.notEqual(retrySnapshot.runId, sourceSnapshot.runId);
  assert.deepEqual(retrySnapshot.requirementBaseline, sourceSnapshot.requirementBaseline);
});

test("createQueuedRunFromSource preserves design requested diagram scope", () => {
  const runs: RunRecordStore = new Map();
  const requirementBaseline = buildRequirementBaseline({
    runId: "baseline-run",
    requirementText: "用户可以查看图书。",
    rules: [rule],
  });
  const sourceSnapshot = createEmptyDesignSnapshot("source-design-run", {
    selectedDiagrams: ["sequence"],
    requestedDiagrams: ["sequence"],
    requirementBaseline,
    requirementModels: [],
    requirementModelTraceability: [],
  });
  sourceSnapshot.status = "failed";
  const source = createSourceRecord(sourceSnapshot);

  createQueuedRunFromSource({
    runs,
    source,
    action: "rerun",
    sourceRunId: sourceSnapshot.runId,
    runId: "rerun-design-run",
  });

  const rerunSnapshot = runs.get("rerun-design-run")
    ?.snapshot as DesignRunSnapshot;
  assert.deepEqual(rerunSnapshot.selectedDiagrams, ["sequence"]);
  assert.deepEqual(rerunSnapshot.requestedDiagrams, ["sequence"]);
});


test("retry narrows a failed requirement batch to retryable diagram errors", () => {
  const runs: RunRecordStore = new Map();
  const sourceSnapshot = createEmptySnapshot(
    "source-partial-requirements",
    "用户查看图书并接收通知。",
    ["usecase", "activity"],
    [rule],
    { requestedDiagrams: ["usecase", "activity"] },
  );
  sourceSnapshot.status = "failed";
  sourceSnapshot.diagramErrors.activity = {
    stage: "generate_models",
    error: createRunError("RUN_STRUCTURED_OUTPUT_INVALID", "活动图解析失败"),
  };

  createQueuedRunFromSource({
    runs,
    source: createSourceRecord(sourceSnapshot),
    action: "retry",
    sourceRunId: sourceSnapshot.runId,
    runId: "retry-partial-requirements",
  });

  const retrySnapshot = runs.get("retry-partial-requirements")
    ?.snapshot as RunSnapshot;
  assert.deepEqual(retrySnapshot.selectedDiagrams, ["activity"]);
  assert.deepEqual(retrySnapshot.requestedDiagrams, ["activity"]);
});

test("completed requirement and design batches retry only failed diagram types", () => {
  const baseline = buildRequirementBaseline({ runId: "baseline", requirementText: rule.text, rules: [rule] });
  const snapshots = [
    createEmptySnapshot("partial-requirements", rule.text, ["usecase", "class"], [rule]),
    createEmptyDesignSnapshot("partial-design", { selectedDiagrams: ["sequence", "class"], requirementBaseline: baseline, requirementModels: [], requirementModelTraceability: [] }),
  ];
  for (const snapshot of snapshots) {
    snapshot.status = "completed";
    const source = createSourceRecord(snapshot);
    assert.equal(isRetryableRun(source), false);
    snapshot.diagramErrors.class = { stage: "render_svg", error: createRunError("RUN_RENDER_FAILED") };
    assert.equal(isRetryableRun(source), true);
    source.terminal = false;
    assert.equal(isRetryableRun(source), false);
    source.terminal = true;
    const runs: RunRecordStore = new Map();
    createQueuedRunFromSource({ runs, source, action: "retry", sourceRunId: snapshot.runId, runId: "retry-partial" });
    const retry = runs.get("retry-partial")!.snapshot as RunSnapshot | DesignRunSnapshot;
    assert.deepEqual(retry.selectedDiagrams, ["class"]);
    assert.deepEqual(retry.requestedDiagrams, ["class"]);
    snapshot.diagramErrors.class.error.retryable = false;
    assert.equal(isRetryableRun(source), false);
  }
});

test("retries target individual failed analysis/sequence instances and retain successful models", () => {
  const baseline = buildRequirementBaseline({ runId: "baseline", requirementText: rule.text, rules: [rule] });
  for (const design of [false, true]) {
    const kind = design ? "sequence" : "analysis";
    const snapshot = design ? createEmptyDesignSnapshot("source", { selectedDiagrams: ["sequence"], requirementBaseline: baseline,
      requirementModels: [], requirementModelTraceability: [] }) : createEmptySnapshot("source", rule.text, ["analysis"], [rule]);
    snapshot.status = "failed";
    // A whole-kind failure can coexist with exact instance diagnostics.
    snapshot.diagramErrors[kind] = { stage: "verify_diagram_visual", error: createRunError("RUN_RENDER_FAILED") };
    for (const id of ["one", "two"]) snapshot.diagramErrors[`${kind}:${id}`] = { stage: design ? "generate_design_sequence" : "generate_models", error: createRunError("RUN_MODEL_OUTPUT_EMPTY") };
    snapshot.diagramErrors[`${kind}:blocked`] = { stage: design ? "generate_design_sequence" : "generate_models", error: createRunError("RUN_DEPENDENCY_MISSING") };
    const runs: RunRecordStore = new Map();
    createQueuedRunFromSource({ runs, source: createSourceRecord(snapshot), action: "retry", sourceRunId: "source", runId: "retry" });
    const retry = runs.get("retry")!.snapshot;
    assert.deepEqual("sequenceTargetUseCaseIds" in retry ? retry.sequenceTargetUseCaseIds : (retry as RunSnapshot).analysisTargetUseCaseIds, ["one", "two"]);
    assert.deepEqual("models" in retry ? retry.models : [], snapshot.models);
    assert.deepEqual((retry as RunSnapshot).selectedDiagrams, [kind]);
  }
});
