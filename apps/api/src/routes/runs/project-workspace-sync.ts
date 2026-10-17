// Persists terminal results and accepted feasibility branches even when clients disconnect.
import type {
  
  DesignRunSnapshot,
  DocumentRunSnapshot,
  FeasibilityRunSnapshot,
  RunEvent,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { captureWorkspaceGuard, workspaceGuardConflicts } from "../../runs/records/workspace-run-guard.js";
import { designGenerationBaseFingerprints, protectedDesignGenerationKinds, designRecordBelongsToDiagramKinds } from "@uml-platform/contracts";
import { refreshRunRecordIfAvailable, type RunRecord, type RunRecordStore } from "../../runs/records/run-record-store.js";
import {
  isRestorableRunSnapshot,
  restoreRunSnapshotToWorkspaceState,
} from "../projects/workspace-snapshot-restore.js";

type RestorableSnapshot = RunSnapshot | DesignRunSnapshot;
type AnySnapshot = RestorableSnapshot | DocumentRunSnapshot | FeasibilityRunSnapshot;

type ProjectWorkspaceSync = ((record: RunRecord) => Promise<void>) & { prepare?: (record: RunRecord) => Promise<void> };
type RestorableRunKind = "requirements" | "design";

function isTerminalEvent(event: RunEvent | undefined) {
  return Boolean(
    event &&
      (event.type === "completed" ||
        event.type === "failed" ||
        event.type === "cancelled"),
  );
}

function snapshotIsRestorable(snapshot: AnySnapshot): snapshot is RestorableSnapshot {
  return isRestorableRunSnapshot(snapshot);
}

function snapshotIsFeasibility(snapshot: AnySnapshot): snapshot is FeasibilityRunSnapshot {
  return "selectedArtifacts" in snapshot;
}

function isRulesOnlyRequirementSnapshot(snapshot: AnySnapshot): snapshot is RunSnapshot {
  return snapshotIsRestorable(snapshot) &&
    !("files" in snapshot) &&
    !("designModelTraceability" in snapshot) &&
    snapshot.selectedDiagrams.length === 0;
}

function mergeFeasibilitySnapshot(
  state: Record<string, unknown>,
  snapshot: FeasibilityRunSnapshot,
) {
  const next = { ...state, feasibilityInputs: snapshot.inputs };
  // Publish the activity model, mappings and rendered artifacts together only after success.
  if (snapshot.businessFlow) {
    Object.assign(next, { feasibilityBusinessFlow: snapshot.businessFlow });
  }
  // Partial context is durable even if implementation generation fails; an old
  // implementation remains untouched until a new plan has passed validation.
  if (snapshot.contextModel && snapshot.contextPlantUml && snapshot.contextSvg) {
    Object.assign(next, {
      feasibilityContextModel: snapshot.contextModel,
      feasibilityContextTraceability: snapshot.contextTraceability,
      feasibilityContextPlantUml: snapshot.contextPlantUml.source,
      feasibilityContextSvg: snapshot.contextSvg.svg,
      feasibilityContextFingerprint: snapshot.contextFingerprint,
    });
  }
  if (snapshot.implementationPlan && snapshot.implementationFingerprint) {
    Object.assign(next, {
      feasibilityImplementationPlan: snapshot.implementationPlan,
      feasibilityImplementationFingerprint: snapshot.implementationFingerprint,
    });
  }
  return next;
}

function mergeVisualReviews(state: Record<string, unknown>, snapshot: RunSnapshot | DesignRunSnapshot | FeasibilityRunSnapshot) {
  const kind = snapshotIsFeasibility(snapshot)
    ? "feasibility"
    : "designModelTraceability" in snapshot ? "design" : "requirements";
  const existing = state.visualReviews && typeof state.visualReviews === "object" && !Array.isArray(state.visualReviews)
    ? state.visualReviews as Record<string, unknown>
    : {};
  return {
    ...state,
    visualReviews: {
      ...existing,
      ...Object.fromEntries(Object.entries(snapshot.visualReviews ?? {}).map(([id, review]) => [`${kind}:${id}`, review])),
    },
  };
}

function inferRestorableRunKind(snapshot: RestorableSnapshot): RestorableRunKind {
  
  if ("designModelTraceability" in snapshot) return "design";
  return "requirements";
}

function timestampIsAfter(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime > rightTime;
  }
  return left.localeCompare(right) > 0;
}

async function shouldSkipOlderSameKindSnapshot(input: {
  currentSourceRunId: string | null;
  incomingRecord: RunRecord;
  runs?: RunRecordStore;
}) {
  if (!input.runs || !input.currentSourceRunId) return false;
  if (input.currentSourceRunId === input.incomingRecord.snapshot.runId) return false;
  if (snapshotIsFeasibility(input.incomingRecord.snapshot)) {
    const currentSource = await refreshRunRecordIfAvailable(input.runs, input.currentSourceRunId, { events: "none" });
    return Boolean(
      currentSource &&
      snapshotIsFeasibility(currentSource.snapshot) &&
      timestampIsAfter(currentSource.metadata?.createdAt, input.incomingRecord.metadata?.createdAt),
    );
  }
  if (!snapshotIsRestorable(input.incomingRecord.snapshot)) return false;
  const currentSource = await refreshRunRecordIfAvailable(input.runs, input.currentSourceRunId, { events: "none" });
  if (!currentSource || !snapshotIsRestorable(currentSource.snapshot)) return false;
  if (
    inferRestorableRunKind(currentSource.snapshot) !==
    inferRestorableRunKind(input.incomingRecord.snapshot)
  ) {
    return false;
  }
  return timestampIsAfter(
    currentSource.metadata?.createdAt,
    input.incomingRecord.metadata?.createdAt,
  );
}

export function createProjectWorkspaceSync(
  authStore: AuthStore,
  options: { runs?: RunRecordStore } = {},
): ProjectWorkspaceSync {
  const sync: ProjectWorkspaceSync = async (record) => {
    const projectId = record.metadata?.projectId;
    const userId = record.metadata?.userId;
    if (
      !projectId ||
      !userId ||
      (!snapshotIsRestorable(record.snapshot) && !snapshotIsFeasibility(record.snapshot))
    ) return;
    // Rejected or cancelled draft extraction never changes the committed input.
    if (isRulesOnlyRequirementSnapshot(record.snapshot) &&
      (record.snapshot.status !== "completed" || record.snapshot.rules.length === 0)) return;

    let current = await authStore.getProjectWorkspace(projectId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (record.snapshot.workspaceGuard && workspaceGuardConflicts(record, current.state, false).length) {
        record.snapshot.publicationSkipped = "相关输入或目标产物已变更；结果保留在运行历史，未覆盖当前工作区。";
        return;
      }
      if (
        await shouldSkipOlderSameKindSnapshot({
          currentSourceRunId: current.sourceRunId,
          incomingRecord: record,
          runs: options.runs,
        })
      ) {
        await authStore.recordAuditLog({
          actorUserId: userId,
          action: "project.workspace.auto-sync",
          targetType: "project",
          targetId: projectId,
          outcome: "success",
          message: `sourceRunId=${record.snapshot.runId}; skipped older terminal snapshot; currentSourceRunId=${current.sourceRunId}`,
        });
        return;
      }
      const snapshot = record.snapshot;
      if (!("designTrace" in snapshot) && snapshot.workspaceGuard && workspaceGuardConflicts(record, current.state).length) {
        record.snapshot.publicationSkipped = "目标产物已变更；结果保留在运行历史，未覆盖当前工作区。";
        return;
      }
      // A later manual edit or another run's accepted branch wins. Apply other
      // branches normally and retain the complete result in run history.
      const protectedKinds = "designTrace" in snapshot && snapshot.generationBaseDesignFingerprints
        ? protectedDesignGenerationKinds((current.state?.designModels ?? {}) as Record<string, unknown>, Object.fromEntries(snapshot.models.map((model) => [model.modelId ?? model.diagramKind, model])), snapshot.generationBaseDesignFingerprints, {}, {
          currentSources: (current.state?.designPlantUml ?? {}) as Record<string, unknown>, currentSvgs: (current.state?.designSvgArtifacts ?? {}) as Record<string, unknown>,
          generatedSources: Object.fromEntries(snapshot.plantUml.map((artifact) => [artifact.modelId ?? artifact.diagramKind, artifact.source])), generatedSvgs: Object.fromEntries(snapshot.svgArtifacts.map((artifact) => [artifact.modelId ?? artifact.diagramKind, artifact])),
        }) : [];
      if ("designTrace" in snapshot && snapshot.workspaceGuard) {
        for (const key of workspaceGuardConflicts(record, current.state)) {
          const kind = key.split(":")[1] as (typeof snapshot.selectedDiagrams)[number];
          if (kind && snapshot.selectedDiagrams.includes(kind) && !protectedKinds.includes(kind)) protectedKinds.push(kind);
        }
      }
      const safeSnapshot = "designTrace" in snapshot && protectedKinds.length ? {
        ...snapshot,
        models: snapshot.models.filter((model) => !protectedKinds.includes(model.diagramKind)),
        plantUml: snapshot.plantUml.filter((artifact) => !protectedKinds.includes(artifact.diagramKind)),
        svgArtifacts: snapshot.svgArtifacts.filter((artifact) => !protectedKinds.includes(artifact.diagramKind)),
        selectedDiagrams: snapshot.selectedDiagrams.filter((kind) => !protectedKinds.includes(kind)),
        designModelTraceability: snapshot.designModelTraceability.filter((entry) => !protectedKinds.some((kind) => kind === entry.source.diagramKind)),
        diagramErrors: Object.fromEntries(Object.entries(snapshot.diagramErrors).filter(([id, value]) => !designRecordBelongsToDiagramKinds(id, value, protectedKinds))),
        visualReviews: Object.fromEntries(Object.entries(snapshot.visualReviews).filter(([id]) => !designRecordBelongsToDiagramKinds(id, snapshot.models.find((model) => model.modelId === id), protectedKinds))),
      } : snapshot;
      const restoredState = snapshotIsFeasibility(safeSnapshot)
        ? mergeFeasibilitySnapshot(current.state, safeSnapshot)
        : snapshotIsRestorable(safeSnapshot) ? restoreRunSnapshotToWorkspaceState({
            currentState: current.state,
            snapshot: safeSnapshot,
            replaceRequirementInput:
              isRulesOnlyRequirementSnapshot(safeSnapshot) &&
              safeSnapshot.status === "completed" &&
              safeSnapshot.rules.length > 0,
          }) : current.state;
      const state = mergeVisualReviews(restoredState, safeSnapshot);
      const result = await authStore.saveProjectWorkspace({
        projectId,
        baseVersion: current.version,
        state,
        updatedByUserId: userId,
        sourceRunId: record.snapshot.runId,
      });
      if (result.ok) {
        await authStore.recordAuditLog({
          actorUserId: userId,
          action: "project.workspace.auto-sync",
          targetType: "project",
          targetId: projectId,
          outcome: "success",
          message: `sourceRunId=${record.snapshot.runId}`,
        });
        return;
      }
      current = result.workspace;
    }

    await authStore.recordAuditLog({
      actorUserId: userId,
      action: "project.workspace.auto-sync",
      targetType: "project",
      targetId: projectId,
      outcome: "failure",
      message: `sourceRunId=${record.snapshot.runId}; version conflict`,
    });
  };
  sync.prepare = async (record) => {
    if (!record.metadata?.projectId) return;
    const workspace = await authStore.getProjectWorkspace(record.metadata.projectId);
    record.snapshot.workspaceGuard ??= captureWorkspaceGuard(record, workspace.state);
    if (!("designTrace" in record.snapshot) || record.snapshot.generationBaseDesignFingerprints) return;
    record.snapshot.generationBaseDesignFingerprints = designGenerationBaseFingerprints((workspace.state?.designModels ?? {}) as Record<string, unknown>, (workspace.state?.designPlantUml ?? {}) as Record<string, unknown>, (workspace.state?.designSvgArtifacts ?? {}) as Record<string, unknown>);
  };
  return sync;
}

export function attachProjectWorkspaceSync(
  record: RunRecord,
  syncProjectWorkspace?: ProjectWorkspaceSync,
) {
  if (!syncProjectWorkspace) return;
  const persist = record.persist;
  let synced = false;
  let pendingSync = Promise.resolve();
  record.persist = async (nextRecord, event) => {
    const terminal = isTerminalEvent(event);
    const acceptedFeasibility = snapshotIsFeasibility(nextRecord.snapshot) && event?.type === "artifact_ready" &&
      ["feasibilityContext", "feasibilityBusinessFlow", "feasibilityImplementation"].includes(event.artifactKind);
    const persistence = persist?.(nextRecord, event);
    if ((!terminal && !acceptedFeasibility) || synced) { await persistence; return; }
    if (terminal) synced = true;
    // Capture each publication and serialize writes so parallel branches cannot
    // overwrite a newer accepted result with an older snapshot.
    const captured = { ...nextRecord, snapshot: structuredClone(nextRecord.snapshot) };
    if (!terminal && snapshotIsFeasibility(captured.snapshot)) {
      const outputs = captured.snapshot.outputManifest ?? [];
      if (!outputs.some((item) => item.kind === "context") && event?.type === "artifact_ready" && event.artifactKind !== "feasibilityContext") {
        captured.snapshot.contextModel = null;
      }
      if (!outputs.some((item) => item.kind === "businessFlow") && event?.type === "artifact_ready" && event.artifactKind !== "feasibilityBusinessFlow") captured.snapshot.businessFlow = null;
      if (!outputs.some((item) => item.kind === "implementationPlan") && event?.type === "artifact_ready" && event.artifactKind !== "feasibilityImplementation") captured.snapshot.implementationPlan = null;
    }
    pendingSync = pendingSync.then(async () => {
      await persistence;
      await syncProjectWorkspace(captured);
      if (captured.snapshot.publicationSkipped) {
        nextRecord.snapshot.publicationSkipped = captured.snapshot.publicationSkipped;
        await persist?.(nextRecord);
      }
    }).catch((error) => {
      console.error("Failed to auto-sync project workspace from run snapshot", error);
    });
    await pendingSync;
  };
}

export type { ProjectWorkspaceSync };
