// Checks fixed demo feasibility data against the production pipeline, dependency guards and retry path.
import assert from "node:assert/strict";
import test from "node:test";
import { buildAcceptedRequirementSnapshot, buildFeasibilityImplementationFingerprint, feasibilityInputsSchema, type FeasibilityRunSnapshot } from "@uml-platform/contracts";
import { librarySeatDemoFixture } from "./fixtures/library-seat-demo-fixture.js";
import { librarySeatFeasibilityFlow } from "./fixtures/library-seat-feasibility-fixture.js";
import { offlineFeasibilityAdapters } from "./offline-feasibility.js";
import { offlineDemoProviderSettings, createOfflineDemoDocumentInput } from "./offline-demo-runs.js";
import { createEmptyFeasibilitySnapshot } from "../records/snapshots.js";
import { createRunRecordStore, type RunRecord } from "../records/run-record-store.js";
import { runFeasibilityStagePipeline } from "../pipelines/feasibility-pipeline.js";
import { normalizeFeasibilityBusinessFlow } from "../../normalizers/feasibility/business-flow-normalizer.js";
import { createProjectRunAction } from "../actions/project-run-actions.js";
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
  await runFeasibilityStagePipeline(record, offlineDemoProviderSettings, adapters.llmTransport, adapters.renderClient, adapters.pngRenderClient);
  return record.snapshot as FeasibilityRunSnapshot;
}

test("fixed demo yields current environment, business flow and two complete implementation candidates", async () => {
  const record = demoRecord();
  const snapshot = await runDemo(record);
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.implementationPlan!.candidates.length, 2);
  assert.equal(snapshot.visualReviews.context.checkOutcome, "inconclusive");
  assert.equal(snapshot.visualReviews.context.attempts, 1);
  assert.equal(snapshot.visualReviews.context.repairAttempts, 0);
  assert.match(snapshot.visualReviews.context.stopReason!, /没有可核实依据/);
  // The fixture SVG lacks stable identities; its successful image observation cannot complete program mapping.
  assert.equal(snapshot.visualReviews["feasibility-business-flow"].status, "not_completed");
  assert.equal(snapshot.visualReviews["feasibility-business-flow"].renderStatus, "not_completed");
  assert.equal(snapshot.visualReviews["feasibility-business-flow"].imageStatus, "passed");
  const imageCalls = record.events.filter((event) => event.type === "run_activity" && event.operation === "visual_check" && event.phase === "started");
  assert.equal(imageCalls.length, 2);
  assert.ok(imageCalls.every((event) => event.type === "run_activity" && event.inputImages?.[0].url.startsWith("data:image/png;base64,")));
  assert.ok(snapshot.contextSvg!.svg.includes("图书馆管理员"));
  assert.ok(snapshot.businessFlow!.svg.svg.includes("未通过"));
  assert.deepEqual(normalizeFeasibilityBusinessFlow(librarySeatFeasibilityFlow, new Set(snapshot.rules.map((rule) => rule.id))), librarySeatFeasibilityFlow);
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

test("demo reruns retain offline data and skip provider resolution and usage", async () => {
  const source = demoRecord();
  await runDemo(source);
  const runs = createRunRecordStore();
  runs.set(source.snapshot.runId, source);
  let status = 0;
  const result = await createProjectRunAction({
    request: {} as never, reply: { code(value: number) { status = value; return this; } } as never,
    action: "rerun", projectId: "demo-project", runId: source.snapshot.runId, actorUserId: "demo-user", runs,
    runAccessGuard: { async resolveRunAccess() { throw new Error("Demo must not record usage"); } },
    providerConfigs: { async get() { throw new Error("Demo must not resolve a paid provider"); } } as never,
    providerRateLimitPolicy: {} as never,
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
