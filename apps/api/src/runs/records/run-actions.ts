// Owns reusable run lifecycle actions shared by project and admin routes.
import { randomUUID } from "node:crypto";
import {
  cancelledRunEventSchema,
  queuedRunEventSchema,
  runActionResultSchema,
  runActionRunEventSchema,
  retryInputProblem,
  type RunAction,
  type RunActionResult,
} from "@uml-platform/contracts";
import {

  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptyFeasibilitySnapshot,
  createEmptySnapshot,
} from "./snapshots.js";
import {
  emitEvent,
  type RunRecord,
  type RunRecordMetadata,
  type RunRecordStore,
} from "./run-record-store.js";
import { createRunError } from "../pipelines/shared/errors.js";
import { emptyRequirementTokenUsage } from "./requirement-token-usage.js";

function createQueuedSnapshotFromSource(
  source: RunRecord["snapshot"],
  newRunId: string,
  action: Extract<RunAction, "retry" | "rerun">,
): RunRecord["snapshot"] {
  const problem = retryInputProblem({ snapshot: source });
  if (problem) throw new Error(problem);
  // Instance errors identify the exact use-case targets for a partial retry.
  const failedUseCases = (kind: "analysis" | "sequence") => action === "retry" && "selectedDiagrams" in source && "diagramErrors" in source
    ? Object.entries(source.diagramErrors).filter(([key, failure]) => key.startsWith(`${kind}:`) && failure.error.retryable)
      .map(([key]) => key.slice(kind.length + 1))
    : [];
  if ("selectedArtifacts" in source) {
    return createEmptyFeasibilitySnapshot(newRunId, {
      reasoning: source.reasoning,
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
    if (!source.replayInput) throw new Error("原任务未保存完整文档输入，请从文档页面重新生成。");
    return createEmptyDocumentSnapshot(newRunId, structuredClone(source.replayInput));
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
      sequenceTargetUseCaseIds: failedUseCases("sequence").length ? failedUseCases("sequence") : source.sequenceTargetUseCaseIds,
      reasoning: source.reasoning,
      selectedDiagrams,
      requestedDiagrams:
        retryDiagrams.length > 0 ? retryDiagrams : source.requestedDiagrams,
      requirementBaseline: source.requirementBaseline!,
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
      requirementBaseline: source.requirementBaseline,
      analysisTargetUseCaseIds: failedUseCases("analysis").length ? failedUseCases("analysis") : source.analysisTargetUseCaseIds,
      attachments: source.attachments,
      reasoning: source.reasoning,
      submittedRequirementText: source.submittedRequirementText,
      tokenUsage: source.tokenUsage ? emptyRequirementTokenUsage(source.tokenUsage.model, source.tokenUsage.capacity) : undefined,
      requestedDiagrams:
        retryDiagrams.length > 0 ? retryDiagrams : source.requestedDiagrams,
      dependencyDiagrams: source.dependencyDiagrams,
      models: source.models,
      requirementModelTraceability: source.requirementModelTraceability,
    },
  );
}

export function isRetryableRun(record: RunRecord) {
  // Partial batches may close as completed while individual diagrams still need retrying.
  const partialFailure = record.terminal && record.snapshot.status === "completed" &&
    "diagramErrors" in record.snapshot && Object.values(record.snapshot.diagramErrors).some((failure) => failure.error.retryable);
  return (
    partialFailure ||
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
