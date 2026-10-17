// Verifies stable operation identity, accepted-only outputs, historical provenance, and completion prerequisites.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptySnapshot,
  createEmptyFeasibilitySnapshot,
  createEmptyDocumentSnapshot,
} from "./snapshots.js";
import { emitEvent, type RunRecord } from "./run-record-store.js";
import {
  acceptRunOutput,
  missingRequestedModelOutputs,
  operationForSnapshot,
  runOutputView,
} from "./run-output-provenance.js";
import { runStagePipeline } from "../pipelines/requirements-pipeline.js";
import { getRunError } from "../pipelines/shared/errors.js";
import type { DiagramModelSpec, RequirementRule, ProviderSettings } from "@uml-platform/contracts";

const rule: RequirementRule = {
  id: "R1",
  category: "功能需求",
  text: "学生预约座位",
  sourceFragment: "学生预约座位",
  relatedDiagrams: ["usecase"],
};
const usecase: DiagramModelSpec = {
  diagramKind: "usecase",
  modelId: "uc-new",
  title: "预约用例",
  summary: "预约",
  notes: [],
  actors: [],
  useCases: [],
  systemBoundaries: [],
  relationships: [],
};
const oldClass: DiagramModelSpec = {
  diagramKind: "class",
  modelId: "old-class",
  title: "旧类模型",
  summary: "已有输入",
  notes: [],
  classes: [],
  interfaces: [],
  enums: [],
  relationships: [],
};
function record(
  snapshot = createEmptySnapshot("run", "学生预约座位", ["usecase"], [rule], {
    models: [oldClass],
  }),
): RunRecord {
  return { snapshot, events: [], listeners: new Set(), terminal: false };
}

test("operation names remain stable across lifecycle stages and terminal states", () => {
  for (const status of ["queued", "running", "completed", "failed", "cancelled"] as const) {
    const snapshot = createEmptySnapshot("extract", "学生预约座位", []);
    snapshot.status = status;
    snapshot.currentStage = "verify_diagram_visual";
    assert.equal(operationForSnapshot(snapshot), "requirement_extraction");
    snapshot.models.push(usecase);
    assert.equal(operationForSnapshot(snapshot), "requirement_extraction");
  }
});
test("an explicit empty new manifest differs from absent historical provenance", () => {
  const snapshot = createEmptySnapshot("run", "需求", ["usecase"]);
  assert.equal(runOutputView(snapshot).outputAttribution, "confirmed");
  delete snapshot.outputManifest;
  assert.equal(runOutputView(snapshot).outputAttribution, "unverified");
});
test("extraction receipts publish rules without inherited models or model-stage matrices", () => {
  const run = record(
    createEmptySnapshot("extract", "学生预约座位", [], [rule], { models: [oldClass] }),
  );
  emitEvent(run, { type: "artifact_ready", stage: "extract_rules", artifactKind: "rules" });
  emitEvent(run, {
    type: "artifact_ready",
    stage: "generate_models",
    artifactKind: "coverageMatrix",
  });
  assert.deepEqual(
    runOutputView(run.snapshot).references.map((item) => item.kind),
    ["rule"],
  );
});
test("modeling excludes input rules and old models, including a same-ID model until accepted", () => {
  const run = record();
  run.snapshot.models.push(usecase);
  assert.deepEqual(runOutputView(run.snapshot).snapshot.models, []);
  assert.deepEqual(missingRequestedModelOutputs(run.snapshot), ["usecase"]);
  emitEvent(run, {
    type: "artifact_ready",
    stage: "render_svg",
    artifactKind: "svg",
    modelId: "uc-new",
    diagramKind: "usecase",
  });
  assert.deepEqual(
    runOutputView(run.snapshot).snapshot.models.map((item) => item.modelId),
    ["uc-new"],
  );
  assert.deepEqual(missingRequestedModelOutputs(run.snapshot), []);
});
test("historical receipts identify outputs without changing a stored snapshot", () => {
  const run = record();
  delete run.snapshot.operationType;
  delete run.snapshot.outputManifest;
  run.snapshot.models.push(usecase);
  const before = JSON.stringify(run.snapshot);
  const events: RunRecord["events"] = [
    {
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "svg",
      diagramKind: "usecase",
      modelId: "uc-new",
      subtaskStatus: "completed",
    },
  ];
  assert.deepEqual(
    runOutputView(run.snapshot, events).snapshot.models.map((item) => item.modelId),
    ["uc-new"],
  );
  assert.equal(JSON.stringify(run.snapshot), before);
});
test("historical success with only an old class cannot satisfy a requested use case", () => {
  const run = record();
  delete run.snapshot.operationType;
  delete run.snapshot.outputManifest;
  run.snapshot.status = "completed";
  const view = runOutputView(run.snapshot);
  assert.equal(view.operationType, "requirement_modeling");
  assert.equal(view.resultConsistency, "missing_requested_output");
  assert.equal(run.snapshot.status, "completed");
  assert.deepEqual(runOutputView(run.snapshot).snapshot.models, []);
});
test("partial outputs remain visible while missing targets prevent completion", () => {
  const run = record(createEmptySnapshot("partial", "需求", ["usecase", "class"], [rule]));
  run.snapshot.models.push(usecase);
  acceptRunOutput(run.snapshot, { kind: "model", id: "uc-new", diagramKind: "usecase" });
  assert.deepEqual(missingRequestedModelOutputs(run.snapshot), ["class"]);
  assert.equal(runOutputView(run.snapshot).snapshot.models.length, 1);
});
test("analysis outputs must cover the requested use-case target set", () => {
  const run = record(
    createEmptySnapshot("analysis", "需求", ["analysis"], [rule], {
      analysisTargetUseCaseIds: ["UC1", "UC2"],
    }),
  );
  acceptRunOutput(run.snapshot, {
    kind: "model",
    id: "analysis:UC1",
    diagramKind: "analysis",
    sourceUseCaseId: "UC1",
  });
  assert.deepEqual(missingRequestedModelOutputs(run.snapshot), ["analysis:UC2"]);
});
test("reused prerequisite models are inputs rather than new outputs", () => {
  const run = record(
    createEmptySnapshot("dependency", "需求", ["usecase", "analysis"], [rule], {
      requestedDiagrams: ["usecase"],
      dependencyDiagrams: ["analysis"],
      models: [oldClass],
    }),
  );
  acceptRunOutput(run.snapshot, { kind: "model", id: "uc-new", diagramKind: "usecase" });
  assert.deepEqual(missingRequestedModelOutputs(run.snapshot), []);
});
for (const [selected, artifactKind, referenceKind] of [
  ["context", "feasibilityContext", "context"],
  ["business-flow", "feasibilityBusinessFlow", "businessFlow"],
  ["implementation", "feasibilityImplementation", "implementationPlan"],
] as const) {
  test(`feasibility ${selected} only attributes the selected accepted result`, () => {
    const snapshot = createEmptyFeasibilitySnapshot("feasibility", {
      projectId: "project",
      selectedArtifacts: [selected],
      providerSettings: { model: "test", providerConfigId: "test-provider" },
      rules: [rule],
      requirementBaseline: null,
      inputs: {} as never,
    });
    Object.assign(snapshot, {
      contextModel: { title: "上下文", modelId: "context", diagramKind: "context" },
      businessFlow: {
        model: { title: "业务流程", modelId: "flow", diagramKind: "activity" },
        svg: { svg: "<svg />" },
      },
      implementationPlan: { overview: "实施评估" },
    });
    const run: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
    emitEvent(run, { type: "artifact_ready", stage: "generate_context", artifactKind });
    assert.equal(operationForSnapshot(snapshot), "feasibility_analysis");
    assert.deepEqual(
      runOutputView(snapshot).references.map((item) => item.kind),
      [referenceKind],
    );
  });
}
test("the real requirement pipeline rejects an invalid requested model despite an inherited valid model", async () => {
  const run = record();
  const provider = {
    apiBaseUrl: "https://llm.example.test",
    apiKey: "test-only",
    model: "test",
  } as ProviderSettings;
  await assert.rejects(
    () =>
      runStagePipeline(
        run,
        provider,
        {
          async *streamChatCompletion() {
            yield JSON.stringify({ models: [], requirementModelTraceability: [] });
          },
        },
        async () => {
          throw new Error("No valid model should render");
        },
      ),
    (error) => {
      assert.ok(getRunError(error));
      return true;
    },
  );
  assert.notEqual(run.snapshot.status, "completed");
  assert.equal(
    run.events.some((event) => event.type === "completed"),
    false,
  );
  assert.deepEqual(runOutputView(run.snapshot).snapshot.models, []);
});

test("modern completed records cannot use inherited same-kind models to hide missing outputs", () => {
  const snapshot = createEmptySnapshot("missing-output", "需求", ["class"], [rule], {
    models: [oldClass],
  });
  snapshot.status = "completed";
  assert.equal(runOutputView(snapshot).resultConsistency, "missing_requested_output");
  assert.deepEqual(runOutputView(snapshot).snapshot.models, []);
});
test("legacy receipts without model identity do not attribute ambiguous same-kind inputs", () => {
  const snapshot = createEmptySnapshot("ambiguous", "需求", ["usecase"], [rule], {
    models: [usecase, { ...usecase, modelId: "uc-old" }],
  });
  delete snapshot.outputManifest;
  const events: RunRecord["events"] = [
    { type: "artifact_ready", stage: "render_svg", artifactKind: "svg", diagramKind: "usecase" },
  ];
  assert.equal(runOutputView(snapshot, events).outputAttribution, "unverified");
  assert.deepEqual(runOutputView(snapshot, events).snapshot.models, []);
});
test("a legacy image remains available alongside its accepted model", () => {
  const snapshot = createEmptySnapshot("merged", "需求", ["usecase"], [rule], { models: [usecase] });
  snapshot.svgArtifacts.push({ diagramKind: "usecase", svg: "<svg />" });
  acceptRunOutput(snapshot, { kind: "model", id: "uc-new", diagramKind: "usecase" });
  assert.equal(runOutputView(snapshot).snapshot.models.length, 1);
  assert.equal(snapshot.svgArtifacts[0]?.svg, "<svg />");
});

test("documents require an accepted output reference", () => {
  const snapshot = createEmptyDocumentSnapshot("doc", { documentKind: "requirementsSpec", requirementText: "需求" });
  snapshot.documentId = "file-1";
  assert.equal(runOutputView(snapshot).references.length, 0);
  acceptRunOutput(snapshot, { kind: "document", id: "file-1" });
  assert.deepEqual(runOutputView(snapshot).references, [{ kind: "document", id: "file-1" }]);
});
