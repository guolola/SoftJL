// Builds deterministic workspace state slices when restoring saved run history snapshots.
import { designTraceabilityTouchesDiagramKinds } from "@uml-platform/contracts";
import type {  } from "@uml-platform/contracts";
import {
  
  isDesignRunSnapshot,
  isDocumentRunSnapshot,
  runHistorySnapshotRequirementText,
  runHistorySnapshotRules,
  type RunHistorySnapshot,
} from "../../../entities/run-history";
import {
  getDesignArtifactId,
  getDesignModelId,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type {
  WorkspaceRecord,
  WorkspaceRunSnapshot,
} from "../../../entities/workspace/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { RunDiagnostics } from "../model/session-state";
import { createEmptyDiagnostics } from "./diagnostics";
import { runErrorMessage } from "./run-events";
import { designSnapshotToMaps, snapshotToMaps } from "./snapshot-maps";
import {
  designInputFingerprintFor,
  keepDesignScopedRecord,
  requirementInputFingerprintFor,
  successfulDesignDiagramsFromSnapshot,
} from "./workspace-context";

type RestoredRunUiState = {
  runStatus: WorkspaceRecord["runStatus"];
  runProgress: number;
  runMessage: string | null;
  errorMessage: string | null;
};

export type RestoredWorkspaceArtifacts = {
  kind: "requirements" | "design";
  models: WorkspaceRecord["models"];
  requirementModelTraceability: WorkspaceRecord["requirementModelTraceability"];
  plantUml: WorkspaceRecord["plantUml"];
  svgArtifacts: WorkspaceRecord["svgArtifacts"];
  diagramErrors: WorkspaceRecord["diagramErrors"];
  generatedDiagrams: DiagramType[];
  diagramVersions: WorkspaceRecord["diagramVersions"];
  diagramInputFingerprints: WorkspaceRecord["diagramInputFingerprints"];
  designModels: WorkspaceRecord["designModels"];
  designModelTraceability: WorkspaceRecord["designModelTraceability"];
  designPlantUml: WorkspaceRecord["designPlantUml"];
  designSvgArtifacts: WorkspaceRecord["designSvgArtifacts"];
  designDiagramErrors: WorkspaceRecord["designDiagramErrors"];
  generatedDesignDiagrams: DesignDiagramType[];
  designInputFingerprints: WorkspaceRecord["designInputFingerprints"];
  
  
};

export type RestoredSnapshotPlan = {
  requirementText: string;
  rules: RequirementRule[];
  rulesVersion: number;
  rulesBasedOnTextVersion: number;
  requirementInputFingerprint: string;
  requirementReviewCandidates: WorkspaceRecord["requirementReviewCandidates"];
  artifacts: RestoredWorkspaceArtifacts | null;
  runUiState: RestoredRunUiState;
  diagnostics: RunDiagnostics;
};

function terminalProgress(snapshot: RunHistorySnapshot) {
  return snapshot.status === "completed" || snapshot.status === "failed"
    ? 100
    : 0;
}

function restoredRunUiState(
  snapshot: RunHistorySnapshot,
  runMessage: string | null,
): RestoredRunUiState {
  return {
    runStatus: snapshot.status,
    runProgress: terminalProgress(snapshot),
    runMessage,
    errorMessage: runErrorMessage(snapshot),
  };
}

function restoredRequirementTrace(snapshot: RunHistorySnapshot) {
  if (isDesignRunSnapshot(snapshot) || isDocumentRunSnapshot(snapshot)) return [];
  return snapshot.requirementTrace ?? [];
}

function restoredRunDiagnostics(snapshot: RunHistorySnapshot): RunDiagnostics {
  return {
    ...createEmptyDiagnostics(),
    runKind: isDesignRunSnapshot(snapshot)
        ? "design"
        : "requirements",
    runId: snapshot.runId,
    activeStage: snapshot.currentStage,
    finishedAt:
      terminalProgress(snapshot) === 100 ? new Date().toISOString() : null,
    streamText: runErrorMessage(snapshot) ?? "",
    
    
    
    
    
    
    
    
    
    requirementTrace: restoredRequirementTrace(snapshot),
    designTrace: isDesignRunSnapshot(snapshot)
      ? (snapshot.designTrace ?? [])
      : [],
  };
}

function emptyRequirementArtifacts() {
  return {
    models: {} as WorkspaceRecord["models"],
    requirementModelTraceability:
      [] as WorkspaceRecord["requirementModelTraceability"],
    plantUml: {} as WorkspaceRecord["plantUml"],
    svgArtifacts: {} as WorkspaceRecord["svgArtifacts"],
    diagramErrors: {} as WorkspaceRecord["diagramErrors"],
    generatedDiagrams: [] as DiagramType[],
    diagramVersions: {} as WorkspaceRecord["diagramVersions"],
    diagramInputFingerprints:
      {} as WorkspaceRecord["diagramInputFingerprints"],
  };
}

function emptyDesignArtifacts() {
  return {
    designModels: {} as WorkspaceRecord["designModels"],
    designModelTraceability:
      [] as WorkspaceRecord["designModelTraceability"],
    designPlantUml: {} as WorkspaceRecord["designPlantUml"],
    designSvgArtifacts: {} as WorkspaceRecord["designSvgArtifacts"],
    designDiagramErrors: {} as WorkspaceRecord["designDiagramErrors"],
    generatedDesignDiagrams: [] as DesignDiagramType[],
    designInputFingerprints:
      {} as WorkspaceRecord["designInputFingerprints"],
  };
}



function restoredDesignArtifacts(input: {
  snapshot: RunHistorySnapshot;
  restoredRulesVersion: number;
  restoredRequirementFingerprint: string;
}): RestoredWorkspaceArtifacts {
  const snapshot = input.snapshot;
  if (!isDesignRunSnapshot(snapshot)) {
    throw new Error("Expected a design run snapshot");
  }
  const mapped = designSnapshotToMaps(snapshot);
  const restoredDesignDiagrams = successfulDesignDiagramsFromSnapshot(snapshot);
  const restoredDesignModels = keepDesignScopedRecord(
    mapped.models,
    restoredDesignDiagrams,
  );
  const restoredRequirementModels = Object.fromEntries(
    snapshot.requirementModels.map((model) => [
      getRequirementModelId(model),
      model,
    ]),
  ) as WorkspaceRecord["models"];
  const restoredRequirementDiagrams = snapshot.requirementModels.map(
    (model) => model.diagramKind,
  );
  const currentDesignFingerprint = designInputFingerprintFor(
    snapshot.requirementModels,
    snapshot.requirementModelTraceability,
  );

  return {
    kind: "design",
    models: restoredRequirementModels,
    requirementModelTraceability:
      snapshot.requirementModelTraceability ?? [],
    plantUml: {} as WorkspaceRecord["plantUml"],
    svgArtifacts: {} as WorkspaceRecord["svgArtifacts"],
    diagramErrors: {} as WorkspaceRecord["diagramErrors"],
    generatedDiagrams: restoredRequirementDiagrams,
    diagramVersions: Object.fromEntries(
      restoredRequirementDiagrams.map((diagram) => [
        diagram,
        input.restoredRulesVersion,
      ]),
    ) as WorkspaceRecord["diagramVersions"],
    diagramInputFingerprints: Object.fromEntries(
      restoredRequirementDiagrams.map((diagram) => [
        diagram,
        input.restoredRequirementFingerprint,
      ]),
    ) as WorkspaceRecord["diagramInputFingerprints"],
    designModels: restoredDesignModels,
    designModelTraceability: (snapshot.designModelTraceability ?? []).filter(
      (entry) =>
        designTraceabilityTouchesDiagramKinds(entry, restoredDesignDiagrams),
    ),
    designPlantUml: keepDesignScopedRecord(
      mapped.plantUml,
      restoredDesignDiagrams,
    ),
    designSvgArtifacts: keepDesignScopedRecord(
      mapped.svgArtifacts,
      restoredDesignDiagrams,
    ),
    designDiagramErrors: snapshot.diagramErrors,
    generatedDesignDiagrams: restoredDesignDiagrams,
    designInputFingerprints: Object.fromEntries(
      Object.keys(restoredDesignModels).map((modelId) => [
        modelId,
        currentDesignFingerprint,
      ]),
    ) as WorkspaceRecord["designInputFingerprints"],
    
    
  };
}

function restoredRequirementArtifacts(input: {
  snapshot: WorkspaceRunSnapshot;
  restoredRulesVersion: number;
  restoredRequirementFingerprint: string;
}): RestoredWorkspaceArtifacts {
  const mapped = snapshotToMaps(input.snapshot);
  return {
    kind: "requirements",
    models: mapped.models,
    requirementModelTraceability:
      input.snapshot.requirementModelTraceability ?? [],
    plantUml: mapped.plantUml,
    svgArtifacts: mapped.svgArtifacts,
    diagramErrors: input.snapshot.diagramErrors,
    generatedDiagrams: [...input.snapshot.selectedDiagrams],
    diagramVersions: Object.fromEntries(
      input.snapshot.selectedDiagrams.map((diagram) => [
        diagram,
        input.restoredRulesVersion,
      ]),
    ) as WorkspaceRecord["diagramVersions"],
    diagramInputFingerprints: Object.fromEntries(
      input.snapshot.selectedDiagrams.map((diagram) => [
        diagram,
        input.restoredRequirementFingerprint,
      ]),
    ) as WorkspaceRecord["diagramInputFingerprints"],
    ...emptyDesignArtifacts(),
    
    
  };
}

function restoredArtifacts(input: {
  snapshot: RunHistorySnapshot;
  restoredRulesVersion: number;
  restoredRequirementFingerprint: string;
}): RestoredWorkspaceArtifacts | null {
  const { snapshot } = input;
  if (isDocumentRunSnapshot(snapshot)) return null;
  
  if (isDesignRunSnapshot(snapshot)) return restoredDesignArtifacts(input);
  return restoredRequirementArtifacts({
    snapshot: snapshot as WorkspaceRunSnapshot,
    restoredRulesVersion: input.restoredRulesVersion,
    restoredRequirementFingerprint: input.restoredRequirementFingerprint,
  });
}

export function createRestoredSnapshotPlan(input: {
  snapshot: RunHistorySnapshot;
  rulesVersion: number;
  textVersion: number;
}): RestoredSnapshotPlan {
  if (isDocumentRunSnapshot(input.snapshot)) {
    throw new Error("说明书快照不能恢复为项目工作台。");
  }
  const restoredRulesVersion = input.rulesVersion + 1;
  const requirementText = runHistorySnapshotRequirementText(input.snapshot);
  const rules = runHistorySnapshotRules(input.snapshot);
  const restoredRequirementFingerprint = requirementInputFingerprintFor(
    requirementText,
    rules,
  );

  return {
    requirementText,
    rules,
    rulesVersion: restoredRulesVersion,
    rulesBasedOnTextVersion: input.textVersion,
    requirementInputFingerprint: restoredRequirementFingerprint,
    requirementReviewCandidates: {},
    artifacts: restoredArtifacts({
      snapshot: input.snapshot,
      restoredRulesVersion,
      restoredRequirementFingerprint,
    }),
    runUiState: restoredRunUiState(
      input.snapshot,
      input.snapshot.status === "completed" ? "已恢复历史快照" : null,
    ),
    diagnostics: restoredRunDiagnostics(input.snapshot),
  };
}
