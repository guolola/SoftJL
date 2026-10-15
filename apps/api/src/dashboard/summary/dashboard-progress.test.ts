// Verifies output-type coverage, including scoped models, replaced outputs and document versions.
import assert from "node:assert/strict";
import test from "node:test";
import { dashboardProgressArtifactTypes } from "@uml-platform/contracts";
import { buildDashboardProgress } from "./dashboard-progress.js";

test("empty projects retain all twenty output types", () => {
  assert.deepEqual(buildDashboardProgress({}, []), {
    completed: 0, total: 20, percentage: 0, stages: [
      { kind: "feasibility", completed: 0, total: 3 }, { kind: "requirements", completed: 0, total: 7 },
      { kind: "design", completed: 0, total: 7 }, { kind: "document", completed: 0, total: 3 },
    ],
  });
});
test("multiple analysis and sequence models count once per type, not per use case", () => {
  const state = {
    models: { "analysis:a": { diagramKind: "analysis" }, "analysis:b": { diagramKind: "analysis" }, context: { diagramKind: "context" } },
    designModels: { "sequence:a": { diagramKind: "sequence" }, "sequence:b": { diagramKind: "sequence" } },
    feasibilityContextModel: { diagramKind: "context" },
  };
  const progress = buildDashboardProgress(state, [
    { documentKind: "requirementsSpec", status: "active" }, { documentKind: "requirementsSpec", status: "active" },
    { documentKind: "softwareDesignSpec", status: "deleted" },
  ]);
  assert.equal(progress.completed, 4);
  assert.equal(progress.percentage, 20);
  assert.deepEqual(progress.stages?.map(stage => stage.completed), [1, 1, 1, 1]);
  assert.equal(buildDashboardProgress({ ...state, models: {} }, []).completed, 2);
});
test("all output types reach full coverage without counting unknown or legacy aliases", () => {
  const models = Object.fromEntries(dashboardProgressArtifactTypes.filter(type => type.startsWith("requirements:")).map(type => [type, { diagramKind: type.split(":")[1] }]));
  const designModels = Object.fromEntries(dashboardProgressArtifactTypes.filter(type => type.startsWith("design:")).map(type => [type, { diagramKind: type.split(":")[1] }]));
  const progress = buildDashboardProgress({ models: { ...models, unknown: { diagramKind: "unknown" } }, designModels,
    feasibilityContextModel: { diagramKind: "context" }, feasibilityBusinessFlow: { model: { diagramKind: "activity" } },
    feasibilityImplementationPlan: { candidates: [] },
  }, ["requirementsSpec", "softwareDesignSpec", "feasibilityStudy"].map(documentKind => ({ documentKind: documentKind as "requirementsSpec" | "softwareDesignSpec" | "feasibilityStudy", status: "active" })));
  assert.equal(progress.completed, 20);
  assert.equal(progress.percentage, 100);
});
