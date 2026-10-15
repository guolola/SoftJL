// Owns reusable run lifecycle actions shared by project and admin routes.
import { randomUUID } from "node:crypto";
import {
  cancelledRunEventSchema,
  queuedRunEventSchema,
  runActionResultSchema,
  runActionRunEventSchema,
  type RunAction,
  type RunActionResult,
} from "@uml-platform/contracts";
import {
  
  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptyFeasibilitySnapshot,
  createEmptySnapshot,
} from "./snapshots.js";
import { buildEmptyRequirementBaseline } from "../baselines/requirement-baseline.js";
import {
  emitEvent,
  type RunRecord,
  type RunRecordMetadata,
  type RunRecordStore,
} from "./run-record-store.js";
import { createRunError } from "../pipelines/shared/errors.js";

function createQueuedSnapshotFromSource(
  source: RunRecord["snapshot"],
  newRunId: string,
  action: Extract<RunAction, "retry" | "rerun">,
): RunRecord["snapshot"] {
  if ("selectedArtifacts" in source) {
    return createEmptyFeasibilitySnapshot(newRunId, {
      projectId: source.projectId,
      selectedArtifacts: source.selectedArtifacts,
      providerSettings: source.providerSettings,
      rules: source.rules,
      requirementBaseline: source.requirementBaseline,
      inputs: source.inputs,
      contextModel: source.contextModel,
      contextTraceability: source.contextTraceability,
      contextPlantUml: source.contextPlantUml,
      contextSvg: source.contextSvg,
      businessFlow: source.businessFlow,
      requirementSource: source.requirementSource,
      implementationPlan: source.implementationPlan,
      contextFingerprint: source.contextFingerprint,
      implementationFingerprint: source.implementationFingerprint,
    });
  }
  if ("documentKind" in source) {
    return createEmptyDocumentSnapshot(newRunId, {
      documentKind: source.documentKind,
      requirementText: source.requirementText,
      requirementBaseline: source.requirementBaseline,
    });
  }

  

  if ("designModelTraceability" in source) {
    const retryDiagrams = action === "retry"
      ? Array.from(
          new Set(
            Object.entries(source.diagramErrors)
              .filter(([, value]) => value.error.retryable)
              .map(([key]) => key.split(":")[0])
              .filter((key) =>
                source.selectedDiagrams.includes(
                  key as (typeof source.selectedDiagrams)[number],
                ),
              ),
          ),
        ) as typeof source.selectedDiagrams
      : [];
    const selectedDiagrams =
      retryDiagrams.length > 0 ? retryDiagrams : source.selectedDiagrams;
    return createEmptyDesignSnapshot(newRunId, {
      selectedDiagrams,
      requestedDiagrams:
        retryDiagrams.length > 0 ? retryDiagrams : source.requestedDiagrams,
      requirementBaseline:
        source.requirementBaseline ?? buildEmptyRequirementBaseline({ runId: newRunId }),
      requirementModels: source.requirementModels,
      requirementModelTraceability: source.requirementModelTraceability,
      existingDesignModels: source.models,
      existingDesignModelTraceability: source.designModelTraceability,
      existingDesignPlantUml: source.plantUml,
      existingDesignSvgArtifacts: source.svgArtifacts,
    });
  }

  const retryDiagrams = action === "retry"
    ? Array.from(
        new Set(
          Object.entries(source.diagramErrors)
            .filter(([, value]) => value.error.retryable)
            .map(([key]) => key.split(":")[0])
            .filter((key) =>
              source.selectedDiagrams.includes(
                key as (typeof source.selectedDiagrams)[number],
              ),
            ),
        ),
      ) as typeof source.selectedDiagrams
    : [];
  const selectedDiagrams =
    retryDiagrams.length > 0 ? retryDiagrams : source.selectedDiagrams;
  return createEmptySnapshot(
    newRunId,
    source.requirementText,
    selectedDiagrams,
    source.rules,
    {
      analysisTargetUseCaseIds: source.analysisTargetUseCaseIds,
      requestedDiagrams:
        retryDiagrams.length > 0 ? retryDiagrams : source.requestedDiagrams,
      dependencyDiagrams: source.dependencyDiagrams,
      models: source.models,
      requirementModelTraceability: source.requirementModelTraceability,
    },
  );
}

export function isRetryableRun(record: RunRecord) {
  return (
    record.snapshot.status === "failed" ||
    record.snapshot.status === "cancelled" ||
    (record.terminal &&
      (record.snapshot.status === "running" || record.snapshot.status === "queued"))
  );
}

function displaySourceRunStatus(record: RunRecord) {
  if (
    record.terminal &&
    (record.snapshot.status === "running" || record.snapshot.status === "queued")
  ) {
    return "interrupted";
  }
  return record.snapshot.status;
}

export function cancelRunRecord(record: RunRecord, runId: string): RunActionResult {
  // Cancellation is a terminal lifecycle transition; SSE readers close on this event.
  record.snapshot.status = "cancelled";
  record.snapshot.error = createRunError("RUN_CANCELLED", "Run cancelled by user");
  emitEvent(
    record,
    cancelledRunEventSchema.parse({
      type: "cancelled",
      stage: record.snapshot.currentStage ?? undefined,
      message: record.snapshot.error.message,
    }),
  );

  return runActionResultSchema.parse({
    action: "cancel",
    sourceRunId: runId,
    runId,
    status: record.snapshot.status,
  });
}

export function createQueuedRunFromSource({
  runs,
  source,
  metadata,
  action,
  sourceRunId,
  actorUserId,
  runId = randomUUID(),
}: {
  runs: RunRecordStore;
  source: RunRecord;
  metadata?: RunRecordMetadata;
  action: Extract<RunAction, "retry" | "rerun">;
  sourceRunId: string;
  actorUserId?: string;
  runId?: string;
}): RunActionResult {
  const record: RunRecord = {
    snapshot: createQueuedSnapshotFromSource(source.snapshot, runId, action),
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      ...(metadata ?? { createdAt: new Date().toISOString() }),
      offlineDemoFixture: source.metadata?.offlineDemoFixture,
      sourceRunId,
      sourceAction: action,
      sourceRunStatus: displaySourceRunStatus(source),
    },
  };
  runs.set(runId, record);
  emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
  emitEvent(
    source,
    runActionRunEventSchema.parse({
      type: "run_action",
      action,
      sourceRunId,
      newRunId: runId,
      actorUserId,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
    }),
  );

  return runActionResultSchema.parse({
    action,
    sourceRunId,
    runId,
    status: record.snapshot.status,
  });
}
