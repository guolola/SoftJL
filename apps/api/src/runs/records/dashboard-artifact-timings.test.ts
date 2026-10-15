// Checks real artifact boundaries, parallel models, retries and legacy missing timestamps.
import assert from "node:assert/strict";
import test from "node:test";
import { dashboardArtifactTimings, type DashboardTimingEvent } from "./dashboard-artifact-timings.js";
const at = (second: number) => new Date(Date.UTC(2026, 9, 10, 0, 0, second)).toISOString();
test("parallel concrete models use their own start; aggregate notifications do not double count", () => {
  const events: DashboardTimingEvent[] = [
    { type: "stage_started", stage: "generate_design_sequence" },
    ...["a", "b"].map(subtaskId => ({ type: "stage_progress", stage: "generate_design_sequence", subtaskId, subtaskStatus: "running" })),
    ...["a", "b", "sequence"].map(subtaskId => ({ type: "artifact_ready", artifactKind: "model", stage: "generate_design_sequence", diagramKind: "sequence", subtaskId, subtaskStatus: "completed" })),
  ];
  const timings = dashboardArtifactTimings({ runKind: "design", models: ["a", "b"].map(modelId => ({ modelId, diagramKind: "sequence", title: modelId })) }, events, [0, 2, 5, 12, 25, 26].map(at));
  assert.equal(timings.length, 2);
  assert.equal(Date.parse(timings[0].completedAt!) - Date.parse(timings[0].startedAt!), 10000);
  assert.equal(Date.parse(timings[1].completedAt!) - Date.parse(timings[1].startedAt!), 20000);
  assert.equal(timings[1].name, "b");
});
test("repairs stay in the sample, failed attempts are excluded, missing starts stay null", () => {
  const event = (type: string, subtaskStatus: string): DashboardTimingEvent => ({ type, stage: "generate_models", diagramKind: "class", subtaskId: "class", artifactKind: "model", subtaskStatus });
  const timings = dashboardArtifactTimings({ runKind: "requirements" }, [event("stage_progress", "running"), event("stage_progress", "repairing"), event("stage_progress", "failed"), event("stage_progress", "running"), event("artifact_ready", "completed")], [0, 2, 5, 10, 20].map(at));
  assert.equal(timings[0].startedAt, at(10));
  const legacy = dashboardArtifactTimings({ runKind: "requirements" }, [event("artifact_ready", "completed")], [at(20)]);
  assert.equal(legacy[0].startedAt, null);
  assert.deepEqual(dashboardArtifactTimings({ runKind: "requirements" }, [event("stage_progress", "failed")], [at(20)]), []);
  const olderReady = { ...event("artifact_ready", "completed"), subtaskStatus: undefined };
  assert.equal(dashboardArtifactTimings({ runKind: "requirements" }, [event("stage_progress", "running"), olderReady], [at(0), at(20)])[0].startedAt, at(0));
});
test("document and implementation timings include only their own generation boundary", () => {
  const document = dashboardArtifactTimings({ runKind: "document", documentId: "doc-a", documentKind: "requirementsSpec", fileName: "需求.docx" }, [
    { type: "stage_started", stage: "generate_document_text" }, { type: "stage_started", stage: "render_document_file" },
    { type: "artifact_ready", artifactKind: "document", stage: "render_document_file" },
  ], [0, 10, 20].map(at));
  assert.equal(document[0].artifactId, "doc-a"); assert.equal(document[0].startedAt, at(0)); assert.equal(document[0].completedAt, at(20));
  const implementation = dashboardArtifactTimings({ runKind: "feasibility" }, [
    { type: "stage_started", stage: "generate_context" }, { type: "stage_started", stage: "generate_implementation" },
    { type: "artifact_ready", artifactKind: "feasibilityImplementation" },
  ], [0, 10, 30].map(at));
  assert.equal(implementation[0].startedAt, at(10)); assert.equal(implementation[0].artifactType, "feasibility:implementation");
});
test("historical batch-ready events retain independent model activity durations and exclude review calls", () => {
  const model = { modelId: "login", diagramKind: "sequence", title: "登录用例实现模型" };
  const events: DashboardTimingEvent[] = [
    { type: "run_activity", stage: "generate_design_sequence", callId: "one", subtaskId: "login", phase: "started" },
    { type: "run_activity", stage: "generate_design_sequence", callId: "one", subtaskId: "login", phase: "completed" },
    { type: "run_activity", stage: "verify_diagram_visual", callId: "review", subtaskId: "login", operation: "visual_check", phase: "started" },
    { type: "run_activity", stage: "verify_diagram_visual", callId: "review", subtaskId: "login", operation: "visual_check", phase: "completed" },
    { type: "artifact_ready", stage: "generate_design_models", artifactKind: "model" },
  ];
  const snapshot = { runKind: "design", status: "completed", models: [model] };
  const result = dashboardArtifactTimings(snapshot, events, [0, 10, 11, 25, 30].map(at));
  assert.equal(result.length, 1); assert.equal(result[0].artifactId, "login");
  assert.equal(result[0].completedAt, at(10));
  assert.deepEqual(dashboardArtifactTimings({ ...snapshot, status: "failed" }, events, [0, 10, 11, 25, 30].map(at)), []);
});
