// Owns the fixed offline demo lifecycle for the student onboarding recording branch.
import {
  artifactReadyRunEventSchema,
  reuseRequirementBaseline,
  snapshotInputFingerprint,
  
  completedRunEventSchema,
  designTraceabilityTouchesDiagramKinds,
  designRunSnapshotSchema,
  runSnapshotSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  startDocumentRunRequestSchema,
  
  type DesignDiagramKind,
  type DesignRunSnapshot,
  type DiagramKind,
  type RunSnapshot,
  type RunStage,
  
  type StartDesignRunRequest,
  type StartDocumentRunRequest,
  type StartRunRequest,
} from "@uml-platform/contracts";
import {
  generateDesignPlantUmlArtifacts,
  generatePlantUmlArtifacts,
} from "../../plantuml.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import { emitOfflineDemoActivity } from "./offline-demo-activity.js";
import { emitOfflineDemoDiagramReviews } from "./offline-demo-diagram-review.js";
import { createStageLifecycle } from "../pipelines/shared/stage-lifecycle.js";
import { stageProgressValue } from "../pipelines/shared/pipeline-events.js";
import { librarySeatDemoFixture } from "./fixtures/library-seat-demo-fixture.js";
import {
  librarySeatRequirementPlantUmlArtifacts,
  librarySeatRequirementRenderedSvgArtifacts,
} from "./fixtures/library-seat-requirement-rendered-artifacts.js";

const fixture = {
  ...librarySeatDemoFixture,
  requirementSnapshot: runSnapshotSchema.parse(
    librarySeatDemoFixture.requirementSnapshot,
  ),
  designSnapshot: designRunSnapshotSchema.parse(
    librarySeatDemoFixture.designSnapshot,
  ),
  
};

export { isOfflineDemoProject, offlineDemoLlmTransport, offlineDemoProviderSettings } from "./offline-demo-config.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function retargetSnapshotIds(
  snapshot: RunSnapshot | DesignRunSnapshot,
  runId: string,
) {
  snapshot.runId = runId;
  if (snapshot.coverageMatrix) {
    snapshot.coverageMatrix = { ...snapshot.coverageMatrix, runId };
  }
  if (snapshot.traceabilityMatrix) {
    snapshot.traceabilityMatrix = { ...snapshot.traceabilityMatrix, runId };
  }
}

function selectedOrAvailable<T extends string>(requested: T[], available: T[]) {
  if (requested.length === 0) return [] as T[];
  const availableSet = new Set(available);
  const selected = requested.filter((kind) => availableSet.has(kind));
  return selected.length > 0 ? selected : available;
}

function requirementKinds(snapshot: RunSnapshot) {
  return Array.from(
    new Set([
      ...snapshot.models.map((model) => model.diagramKind),
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ]),
  ) as DiagramKind[];
}

function designKinds(snapshot: DesignRunSnapshot) {
  return Array.from(
    new Set([
      ...snapshot.models.map((model) => model.diagramKind),
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ]),
  ) as DesignDiagramKind[];
}

function artifactKey(artifact: { diagramKind: string; modelId?: string }) {
  return artifact.modelId ?? artifact.diagramKind;
}

function requirementArtifactBelongsToSnapshot(
  snapshot: RunSnapshot,
  artifact: { diagramKind: string; modelId?: string },
) {
  const artifactModelId = artifact.modelId;
  if (artifactModelId) {
    return snapshot.models.some((model) => artifactKey(model) === artifactModelId);
  }
  return snapshot.models.some((model) => model.diagramKind === artifact.diagramKind);
}

function ensureRequirementArtifacts(snapshot: RunSnapshot) {
  const plantByKey = new Map(
    snapshot.plantUml.map((artifact) => [artifactKey(artifact), artifact] as const),
  );
  for (const artifact of librarySeatRequirementPlantUmlArtifacts) {
    if (
      requirementArtifactBelongsToSnapshot(snapshot, artifact) &&
      !plantByKey.has(artifactKey(artifact))
    ) {
      plantByKey.set(artifactKey(artifact), artifact);
    }
  }
  for (const artifact of generatePlantUmlArtifacts(snapshot.models)) {
    if (!plantByKey.has(artifactKey(artifact))) {
      plantByKey.set(artifactKey(artifact), artifact);
    }
  }
  snapshot.plantUml = Array.from(plantByKey.values());

  const svgByKey = new Map(
    librarySeatRequirementRenderedSvgArtifacts.map(
      (artifact) => [artifactKey(artifact), artifact] as const,
    ),
  );
  const existingSvgKeys = new Set(snapshot.svgArtifacts.map(artifactKey));
  const missingSvg = snapshot.plantUml.flatMap((artifact) => {
    const key = artifactKey(artifact);
    if (existingSvgKeys.has(key)) return [];
    const renderedSvg = svgByKey.get(key);
    return renderedSvg ? [renderedSvg] : [];
  });
  snapshot.svgArtifacts = [...snapshot.svgArtifacts, ...missingSvg];
}

function ensureDesignArtifacts(snapshot: DesignRunSnapshot) {
  const plantByKey = new Map(
    snapshot.plantUml.map((artifact) => [artifactKey(artifact), artifact] as const),
  );
  for (const artifact of generateDesignPlantUmlArtifacts(snapshot.models)) {
    if (!plantByKey.has(artifactKey(artifact))) {
      plantByKey.set(artifactKey(artifact), artifact);
    }
  }
  snapshot.plantUml = Array.from(plantByKey.values());
}

async function emitDemoStage(record: RunRecord, stages: ReturnType<typeof createStageLifecycle>, stage: RunStage, message: string) {
  throwIfRunCancelled(record);
  stages.advance(stage);
  record.snapshot.currentStage = stage;
  record.snapshot.status = "running";
  emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage, tracksCompletion: true }));
  emitEvent(
    record,
    stageProgressRunEventSchema.parse({
      type: "stage_progress",
      stage,
      progress: stageProgressValue(stage),
      message,
    }),
  );
  await emitOfflineDemoActivity(record, stage);
}

function completeRecord(
  record: RunRecord,
  snapshot: RunSnapshot | DesignRunSnapshot,
) {
  throwIfRunCancelled(record);
  snapshot.status = "completed";
  snapshot.error = null;
  record.snapshot = snapshot;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}

export async function completeOfflineDemoRequirementRun(
  record: RunRecord,
  input: StartRunRequest,
) {
  const stages = createStageLifecycle(record);
  const snapshot = clone(fixture.requirementSnapshot);
  retargetSnapshotIds(snapshot, record.snapshot.runId);
  // Fixed demo artifacts still belong to the text submitted for this run.
  snapshot.requirementText = input.requirementText;
  if (snapshot.requirementBaseline) {
    // Demo tasks follow the same baseline identity rules as provider tasks.
    snapshot.requirementBaseline = clone(reuseRequirementBaseline(input.requirementBaseline, {
      ...snapshot.requirementBaseline,
      runId: snapshot.runId,
      sourceInputFingerprint: snapshotInputFingerprint({ requirementText: input.requirementText, rules: snapshot.rules }),
      qualityReport: { ...snapshot.requirementBaseline.qualityReport, runId: snapshot.runId },
    }));
  }
  const availableKinds = requirementKinds(snapshot);
  const selectedKinds = selectedOrAvailable(input.selectedDiagrams, availableKinds);
  snapshot.selectedDiagrams = selectedKinds;
  if (selectedKinds.length === 0) {
    snapshot.models = [];
    snapshot.plantUml = [];
    snapshot.svgArtifacts = [];
    snapshot.requirementModelTraceability = [];
    snapshot.diagramErrors = {};
    snapshot.currentStage = "extract_rules";
  } else {
    const selected = new Set(selectedKinds);
    snapshot.models = snapshot.models.filter((model) =>
      selected.has(model.diagramKind),
    );
    snapshot.plantUml = snapshot.plantUml.filter((artifact) =>
      selected.has(artifact.diagramKind),
    );
    snapshot.svgArtifacts = snapshot.svgArtifacts.filter((artifact) =>
      selected.has(artifact.diagramKind),
    );
    snapshot.requirementModelTraceability =
      snapshot.requirementModelTraceability.filter((entry) =>
        selected.has(entry.target.diagramKind as DiagramKind),
      );
    snapshot.diagramErrors = Object.fromEntries(
      Object.entries(snapshot.diagramErrors).filter(([kind]) =>
        selected.has(kind as DiagramKind),
      ),
    ) as RunSnapshot["diagramErrors"];
    ensureRequirementArtifacts(snapshot);
    snapshot.currentStage = "render_svg";
  }
  snapshot.status = "queued";
  record.snapshot = snapshot;
  await emitDemoStage(record, stages, "extract_rules", "离线演示：正在整理固定需求规则");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "extract_rules",
      artifactKind: "rules",
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "extract_rules",
      artifactKind: "requirementBaseline",
    }),
  );
  if (selectedKinds.length > 0) {
    await emitDemoStage(record, stages, "generate_models", "离线演示：正在并行整理需求模型");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_models",
        artifactKind: "model",
      }),
    );
    await emitDemoStage(record, stages, "render_svg", "离线演示：正在准备已保存的图形预览");
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "plantuml",
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "render_svg",
        artifactKind: "svg",
      }),
    );
  }
  if (selectedKinds.length > 0) {
    await emitDemoStage(record, stages, "verify_diagram_visual", "离线演示：核对结构、修复有依据的问题并复查图片");
    await emitOfflineDemoDiagramReviews(record);
  }
  completeRecord(record, runSnapshotSchema.parse(snapshot));
}

export async function completeOfflineDemoDesignRun(
  record: RunRecord,
  input: StartDesignRunRequest,
) {
  const stages = createStageLifecycle(record);
  const snapshot = clone(fixture.designSnapshot);
  retargetSnapshotIds(snapshot, record.snapshot.runId);
  snapshot.requirementBaseline = clone(input.requirementBaseline ?? snapshot.requirementBaseline);
  const availableKinds = designKinds(snapshot);
  const requestedKinds = input.requestedDiagrams ?? input.selectedDiagrams;
  const selectedKinds = selectedOrAvailable(requestedKinds, availableKinds);
  const selected = new Set(selectedKinds);
  snapshot.selectedDiagrams = selectedKinds;
  snapshot.requestedDiagrams = requestedKinds;
  snapshot.models = snapshot.models.filter((model) => selected.has(model.diagramKind));
  snapshot.plantUml = snapshot.plantUml.filter((artifact) =>
    selected.has(artifact.diagramKind),
  );
  snapshot.svgArtifacts = snapshot.svgArtifacts.filter((artifact) =>
    selected.has(artifact.diagramKind),
  );
  snapshot.designModelTraceability = snapshot.designModelTraceability.filter((entry) =>
    designTraceabilityTouchesDiagramKinds(entry, selectedKinds),
  );
  snapshot.diagramErrors = Object.fromEntries(
    Object.entries(snapshot.diagramErrors).filter(([kind]) =>
      selected.has(kind as DesignDiagramKind),
    ),
  ) as DesignRunSnapshot["diagramErrors"];
  ensureDesignArtifacts(snapshot);
  snapshot.currentStage = "render_svg";
  snapshot.status = "queued";
  record.snapshot = snapshot;
  await emitDemoStage(record, stages, "generate_design_sequence", "离线演示：正在整理用例实现设计");
  await emitDemoStage(record, stages, "generate_design_models", "离线演示：正在并行整理设计模型");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_models",
      artifactKind: "model",
    }),
  );
  await emitDemoStage(record, stages, "render_svg", "离线演示：正在准备已保存的设计图预览");
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "plantuml",
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_svg",
      artifactKind: "svg",
    }),
  );
  if (snapshot.models.length > 0) {
    await emitDemoStage(record, stages, "verify_diagram_visual", "离线演示：核对设计约束、记录结构纠错及图片复查");
    await emitOfflineDemoDiagramReviews(record);
  }
  completeRecord(record, designRunSnapshotSchema.parse(snapshot));
}



export function createOfflineDemoDocumentInput(input: StartDocumentRunRequest) {
  // Feasibility has already passed server-side freshness checks; retain its two-diagram solution basis.
  if (input.documentKind === "feasibilityStudy") return startDocumentRunRequestSchema.parse({ ...input, useAiText: false });
  const requirementSnapshot = clone(fixture.requirementSnapshot);
  ensureRequirementArtifacts(requirementSnapshot);
  const designSnapshot = clone(fixture.designSnapshot);
  ensureDesignArtifacts(designSnapshot);
  return startDocumentRunRequestSchema.parse({
    ...input,
    requirementText: requirementSnapshot.requirementText,
    requirementBaseline: requirementSnapshot.requirementBaseline,
    coverageMatrix: designSnapshot.coverageMatrix,
    traceabilityMatrix: designSnapshot.traceabilityMatrix,
    rules: requirementSnapshot.rules,
    requirementModels: requirementSnapshot.models,
    requirementModelTraceability:
      requirementSnapshot.requirementModelTraceability,
    requirementPlantUml: requirementSnapshot.plantUml,
    requirementSvgArtifacts: requirementSnapshot.svgArtifacts,
    designModels: designSnapshot.models,
    designModelTraceability: designSnapshot.designModelTraceability,
    designPlantUml: designSnapshot.plantUml,
    designSvgArtifacts: designSnapshot.svgArtifacts,
    useAiText: false,
  });
}
