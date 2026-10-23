// Checks fixed demo feasibility data against the production pipeline, dependency guards and retry path.
import assert from "node:assert/strict";
import test from "node:test";
import { buildAcceptedRequirementSnapshot, buildFeasibilityImplementationFingerprint, feasibilityInputsSchema, type FeasibilityRunSnapshot } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "@uml-platform/demo-fixtures";
import { librarySeatFeasibilityFlow } from "./fixtures/library-seat-feasibility-fixture.js";
import { offlineFeasibilityAdapters } from "./offline-feasibility.js";
import { offlineDemoProviderSettings } from "./offline-demo-config.js";
import { createOfflineDemoDocumentInput } from "./offline-demo-runs.js";
import { createEmptyFeasibilitySnapshot } from "../records/snapshots.js";
import { createRunRecordStore, type RunRecord } from "../records/run-record-store.js";
import { runFeasibilityStagePipeline } from "../pipelines/feasibility-pipeline.js";
import { normalizeFeasibilityBusinessFlow } from "../../normalizers/feasibility/business-flow-normalizer.js";
import { createProjectRunAction } from "../actions/project-run-actions.js";
import { captureWorkspaceGuard } from "../records/workspace-run-guard.js";
import { resolveDocumentRunInput } from "../../routes/runs/run-input-resolution.js";

function demoRecord(): RunRecord {
  const source = buildAcceptedRequirementSnapshot(librarySeatDemoFixture.requirementSnapshot.rules, librarySeatDemoFixture.requirementSnapshot.requirementBaseline);
  return {
    snapshot: createEmptyFeasibilitySnapshot("demo-feasibility", {
      projectId: "demo-project", selectedArtifacts: ["context", "business-flow", "implementation"],
      rules: source.rules, requirementBaseline: source.baseline, inputs: feasibilityInputsSchema.parse({}),
      providerSettings: { providerConfigId: "unused-provider", model: "unused-model" },
    }), events: [], listeners: new Set(), terminal: false,
    metadata: { projectId: "demo-project", userId: "demo-user", createdAt: new Date().toISOString(), offlineDemoFixture: "library-seat" },
  };
}

async function runDemo(record: RunRecord) {
  const adapters = offlineFeasibilityAdapters(record)!;
  await runFeasibilityStagePipeline(record, offlineDemoProviderSettings, adapters.llmTransport, adapters.renderClient);
  return record.snapshot as FeasibilityRunSnapshot;
}

test("fixed demo yields current environment, business flow and two complete implementation candidates", async () => {
  const record = demoRecord();
  const snapshot = await runDemo(record);
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.implementationPlan!.candidates.length, 2);
  assert.equal(snapshot.visualReviews.context.checkOutcome, "verified");
  assert.equal(snapshot.visualReviews.context.attempts, 0);
  assert.equal(snapshot.visualReviews.context.repairAttempts, 0);
  assert.equal(snapshot.visualReviews.context.stopReason, undefined);
  // Successful rendering is sufficient even when the fixture SVG has no stable mapping identities.
  assert.equal(snapshot.visualReviews["feasibility-business-flow"].status, "passed");
  assert.equal(snapshot.visualReviews["feasibility-business-flow"].renderStatus, "passed");
  assert.equal(snapshot.visualReviews["feasibility-business-flow"].imageStatus, "skipped");
  const imageCalls = record.events.filter((event) => event.type === "run_activity" && event.operation === "visual_check" && event.phase === "started");
  assert.equal(imageCalls.length, 0);
  assert.ok(record.events.every((event) => event.type !== "run_activity" || !event.inputImages?.length));
  assert.ok(snapshot.contextSvg!.svg.includes("图书馆管理员"));
  assert.ok(snapshot.businessFlow!.svg.svg.includes("未通过"));
  assert.deepEqual(normalizeFeasibilityBusinessFlow(librarySeatFeasibilityFlow), librarySeatFeasibilityFlow);
  assert.equal(snapshot.implementationFingerprint, buildFeasibilityImplementationFingerprint({
    rules: snapshot.rules, requirementBaseline: snapshot.requirementBaseline, contextModel: snapshot.contextModel, businessFlow: snapshot.businessFlow, inputs: snapshot.inputs,
  }));
  const report = await resolveDocumentRunInput({ projectId: "demo-project", documentKind: "feasibilityStudy", useAiText: false },
    { projectId: "demo-project" }, async () => ({ state: {
      rules: snapshot.rules, requirementBaseline: snapshot.requirementBaseline, feasibilityInputs: snapshot.inputs,
      feasibilityContextModel: snapshot.contextModel, feasibilityContextPlantUml: snapshot.contextPlantUml!.source,
      feasibilityContextSvg: snapshot.contextSvg!.svg, feasibilityContextFingerprint: snapshot.contextFingerprint,
      feasibilityBusinessFlow: snapshot.businessFlow, feasibilityImplementationPlan: snapshot.implementationPlan,
      feasibilityImplementationFingerprint: snapshot.implementationFingerprint,
    } }));
  assert.ok(report.ok);
  if (report.ok) {
    const input = createOfflineDemoDocumentInput(report.input);
    assert.equal(input.requirementModels[0]!.diagramKind, "context");
    assert.deepEqual(input.feasibilityImplementationPlan, snapshot.implementationPlan);
    assert.equal(input.useAiText, false);
  }
});

test("demo retries retain offline data and skip provider resolution and usage", async () => {
  const source = demoRecord();
  const state = { requirementText: "demo", rules: [], feasibilityInputs: {} };
  source.snapshot.workspaceGuard = captureWorkspaceGuard(source, state);
  await runDemo(source);
  source.snapshot.status = "failed";
  const runs = createRunRecordStore();
  runs.set(source.snapshot.runId, source);
  let status = 0;
  const result = await createProjectRunAction({
    request: {} as never, reply: { code(value: number) { status = value; return this; } } as never,
    action: "retry", projectId: "demo-project", runId: source.snapshot.runId, actorUserId: "demo-user", runs,
    runAccessGuard: { async resolveRunAccess() { throw new Error("Demo must not record usage"); } },
    providerConfigs: { async get() { throw new Error("Demo must not resolve a paid provider"); } } as never,
    providerRateLimitPolicy: {} as never,
    loadProjectWorkspace: async () => ({ state }),
    startRecordPipeline: async ({ record }) => { assert.equal(record.metadata?.offlineDemoFixture, "library-seat"); await runDemo(record); },
  });
  assert.equal(status, 202);
  assert.ok("runId" in result);
  if ("runId" in result) assert.equal(runs.get(result.runId)!.snapshot.status, "completed");
});

test("ordinary projects do not receive the fixed demo adapters", () => {
  const record = demoRecord();
  delete record.metadata!.offlineDemoFixture;
  assert.equal(offlineFeasibilityAdapters(record), null);
});
