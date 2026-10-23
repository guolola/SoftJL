// Derives workspace fingerprints, scoped snapshot updates, and traceability freshness for session workflows.
import {
  designDiagramKindFromRecordKey,
  designTraceabilityTouchesDiagramKinds,
  modelRecordBelongsToDiagramKinds,
} from "@uml-platform/contracts";
import type {
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DiagramModelSpec,
  RequirementBaseline,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import {
  getRequirementModelId,
  getDesignModelId,
  findRequirementModelByKind,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type {
  WorkspaceDesignRunSnapshot,
  WorkspaceRecord,
  WorkspaceRunSnapshot,
} from "../../../entities/workspace/model";
import {
  designInputFingerprint,
  snapshotInputFingerprint,
} from "./fingerprint";
import {
  orderedDesignDiagrams,
  orderedRequirementDiagrams,
} from "./generation-planning";

export type ApplyRunSnapshotOptions = {
  persistRuleState?: boolean;
};

export type DesignRequirementContext = {
  requirementBaseline: RequirementBaseline;
  requirementModels: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  rules: RequirementRule[];
};

export function requirementInputFingerprintFor(
  requirementText: string,
  rules: RequirementRule[],
) {
  return snapshotInputFingerprint({ requirementText, rules });
}

export function designInputFingerprintFor(
  requirementModels: DiagramModelSpec[],
  requirementModelTraceability: RequirementModelTraceabilityEntry[],
) {
  return designInputFingerprint(
    requirementModels,
    requirementModelTraceability,
  );
}

export function fingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return (storedFingerprint) === currentFingerprint;
}

export function designFingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return (
    (storedFingerprint) === currentFingerprint
  );
}

export function currentDesignClassFingerprint(
  designModels: WorkspaceRecord["designModels"],
  designInputFingerprints: WorkspaceRecord["designInputFingerprints"],
) {
  const classModel = Object.values(designModels).find(
    (model) => model.diagramKind === "class",
  );
  return classModel
    ? (designInputFingerprints[getDesignModelId(classModel)] ??
        designInputFingerprints.class)
    : designInputFingerprints.class;
}

export function currentDesignComponentFingerprint(
  designModels: WorkspaceRecord["designModels"],
  designInputFingerprints: WorkspaceRecord["designInputFingerprints"],
) {
  const componentModel = Object.values(designModels).find(
    (model) => model.diagramKind === "component",
  );
  return componentModel
    ? (designInputFingerprints[getDesignModelId(componentModel)] ??
        designInputFingerprints.component)
    : designInputFingerprints.component;
}

function extractUseCasesFromRequirementModel(
  model: DiagramModelSpec | undefined,
) {
  if (!model || model.diagramKind !== "usecase" || !("useCases" in model)) {
    return [];
  }
  return Array.isArray(model.useCases) ? model.useCases : [];
}

function analysisSourceUseCaseId(model: DiagramModelSpec) {
  if (model.diagramKind !== "analysis") return null;
  const explicit =
    "sourceUseCaseId" in model && typeof model.sourceUseCaseId === "string"
      ? model.sourceUseCaseId.trim()
      : "";
  if (explicit) return explicit;
  const modelId =
    "modelId" in model && typeof model.modelId === "string"
      ? model.modelId.trim()
      : "";
  return modelId.startsWith("analysis:")
    ? modelId.slice("analysis:".length)
    : null;
}

function missingAnalysisUseCaseIds(models: WorkspaceRecord["models"]) {
  const useCases = extractUseCasesFromRequirementModel(findRequirementModelByKind(models, "usecase"));
  if (useCases.length === 0) return [];
  const covered = new Set(
    Object.values(models)
      .filter((model): model is DiagramModelSpec => Boolean(model))
      .map(analysisSourceUseCaseId)
      .filter((id): id is string => Boolean(id)),
  );
  return useCases
    .filter((useCase) => !covered.has(useCase.id))
    .map((useCase) => useCase.id);
}

export function analysisTargetUseCaseIdsForRun(
  diagrams: DiagramType[],
  models: WorkspaceRecord["models"],
) {
  if (!diagrams.includes("analysis") || diagrams.includes("usecase")) {
    return [];
  }
  return missingAnalysisUseCaseIds(models);
}

export function sequenceModelsCoverUseCases(
  designModels: WorkspaceRecord["designModels"],
  useCaseModel: DiagramModelSpec | undefined,
) {
  const useCases = extractUseCasesFromRequirementModel(useCaseModel);
  if (useCases.length === 0) return false;
  const covered = new Set(
    Object.values(designModels)
      .filter((model) => model.diagramKind === "sequence")
      .map((model) =>
        "sourceUseCaseId" in model && typeof model.sourceUseCaseId === "string"
          ? model.sourceUseCaseId
          : null,
      )
      .filter((id): id is string => Boolean(id)),
  );
  return useCases.every((useCase) => covered.has(useCase.id));
}

function autoReviewId(artifactType: string, artifactId: string) {
  return `${artifactType}:${artifactId}`;
}

export function createAutoGeneratedUpstreamReview(input: {
  artifactType: WorkspaceRecord["autoGeneratedUpstreamReviews"][string]["artifactType"];
  artifactId: string;
  label: string;
  reason: string;
  sourceRunId: string | null;
}): WorkspaceRecord["autoGeneratedUpstreamReviews"][string] {
  return {
    id: autoReviewId(input.artifactType, input.artifactId),
    artifactType: input.artifactType,
    artifactId: input.artifactId,
    label: input.label,
    reason: input.reason,
    sourceRunId: input.sourceRunId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export function diagramErrorCount(
  snapshot: Pick<
    WorkspaceRunSnapshot | WorkspaceDesignRunSnapshot,
    "diagramErrors"
  >,
) {
  return Object.keys(snapshot.diagramErrors ?? {}).length;
}


function clearRequirementScopedRecord<T>(
  current: Record<string, T>,
  affectedDiagrams: readonly DiagramType[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      !modelRecordBelongsToDiagramKinds(key, value, affectedDiagrams, models)),
  ) as Record<string, T>;
}

type RequirementSnapshotScope = {
  broadDiagrams: DiagramType[];
  targetedModelIds: Set<string>;
};

function analysisTargetModelIds(snapshot: WorkspaceRunSnapshot) {
  return (snapshot.analysisTargetUseCaseIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map((id) => `analysis:${id}`);
}

export function requirementSnapshotScope(
  snapshot: WorkspaceRunSnapshot,
  affectedDiagrams: readonly DiagramType[],
): RequirementSnapshotScope {
  const targetedModelIds = new Set(analysisTargetModelIds(snapshot));
  const hasTargetedAnalysis =
    targetedModelIds.size > 0 && affectedDiagrams.includes("analysis");
  return {
    broadDiagrams: hasTargetedAnalysis
      ? affectedDiagrams.filter((diagram) => diagram !== "analysis")
      : [...affectedDiagrams],
    targetedModelIds: hasTargetedAnalysis
      ? targetedModelIds
      : new Set<string>(),
  };
}

export function clearRequirementScopedRecordForScope<T>(
  current: Record<string, T>,
  scope: RequirementSnapshotScope,
  models: Record<string, unknown> = {},
) {
  const next = clearRequirementScopedRecord(current, scope.broadDiagrams, models);
  for (const modelId of scope.targetedModelIds) {
    delete next[modelId];
  }
  return next;
}

function keepRequirementScopedRecord<T>(
  current: Record<string, T>,
  affectedDiagrams: readonly DiagramType[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      modelRecordBelongsToDiagramKinds(key, value, affectedDiagrams, models)),
  ) as Record<string, T>;
}

export function clearDesignScopedRecord<T>(
  current: Record<string, T>,
  affectedDiagrams: readonly DesignDiagramType[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) =>
        !modelRecordBelongsToDiagramKinds(key, value, affectedDiagrams, models),
    ),
  ) as Record<string, T>;
}

export function keepDesignScopedRecord<T>(
  current: Record<string, T>,
  affectedDiagrams: readonly DesignDiagramType[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      modelRecordBelongsToDiagramKinds(key, value, affectedDiagrams, models),
    ),
  ) as Record<string, T>;
}

export function designErrorDiagrams(
  diagramErrors: WorkspaceDesignRunSnapshot["diagramErrors"],
) {
  return new Set(
    Object.keys(diagramErrors)
      .map(designDiagramKindFromRecordKey)
      .filter((diagram): diagram is DesignDiagramType => Boolean(diagram)),
  );
}

function hasWholeDesignDiagramError(
  diagramErrors: WorkspaceDesignRunSnapshot["diagramErrors"],
  diagram: DesignDiagramType,
) {
  return Object.keys(diagramErrors).some((key) => {
    if (key === diagram) return true;
    if (key.startsWith(`${diagram}:`)) return false;
    return designDiagramKindFromRecordKey(key) === diagram;
  });
}

export function successfulDesignDiagramsFromSnapshot(
  snapshot: WorkspaceDesignRunSnapshot,
) {
  const selected = new Set(snapshot.selectedDiagrams);
  const artifactDiagrams = Array.from(
    new Set(
      snapshot.svgArtifacts
        .filter((artifact) => {
          if (!selected.has(artifact.diagramKind)) return false;
          if (hasWholeDesignDiagramError(snapshot.diagramErrors, artifact.diagramKind)) {
            return false;
          }
          const artifactId = artifact.modelId ?? artifact.diagramKind;
          return !snapshot.diagramErrors[artifactId];
        })
        .map((artifact) => artifact.diagramKind),
    ),
  );
  const modelDiagrams = Array.from(
    new Set(
      snapshot.models
        .filter((model) => {
          if (!selected.has(model.diagramKind)) return false;
          if (hasWholeDesignDiagramError(snapshot.diagramErrors, model.diagramKind)) {
            return false;
          }
          return !snapshot.diagramErrors[getDesignModelId(model)];
        })
        .map((model) => model.diagramKind),
    ),
  );
  return orderedDesignDiagrams([...new Set([...artifactDiagrams, ...modelDiagrams])]);
}

export function mergeDesignTraceability(
  current: WorkspaceRecord["designModelTraceability"],
  incoming: WorkspaceRecord["designModelTraceability"],
  affectedDiagrams: readonly DesignDiagramType[],
  deletedModelIds: readonly string[],
) {
  if (affectedDiagrams.length === 0 && deletedModelIds.length === 0) {
    return current;
  }
  return [
    ...current.filter(
      (entry) =>
        !designTraceabilityTouchesDiagramKinds(
          entry,
          affectedDiagrams,
          deletedModelIds,
        ),
    ),
    ...incoming.filter((entry) =>
      designTraceabilityTouchesDiagramKinds(entry, affectedDiagrams),
    ),
  ];
}

export function designModelIdsFromRecord(
  models: WorkspaceRecord["designModels"],
) {
  return Object.keys(models);
}

export function mergeDesignPreviewTraceability(
  current: WorkspaceRecord["designModelTraceability"],
  incoming: WorkspaceRecord["designModelTraceability"],
  affectedDiagrams: readonly DesignDiagramType[],
  incomingModelIds: readonly string[],
) {
  if (affectedDiagrams.length === 0 && incomingModelIds.length === 0) {
    return current;
  }
  const scopedIncoming = incoming.filter((entry) =>
    designTraceabilityTouchesDiagramKinds(
      entry,
      affectedDiagrams,
      incomingModelIds,
    ),
  );
  if (scopedIncoming.length === 0) {
    return current;
  }
  const next = current.filter(
    (entry) =>
      !designTraceabilityTouchesDiagramKinds(entry, [], incomingModelIds),
  );
  const seen = new Set(next.map((entry) => JSON.stringify(entry)));
  for (const entry of scopedIncoming) {
    const signature = JSON.stringify(entry);
    if (!seen.has(signature)) {
      seen.add(signature);
      next.push(entry);
    }
  }
  return next;
}

export function keepRequirementScopedRecordForScope<T>(
  current: Record<string, T>,
  scope: RequirementSnapshotScope,
  models: Record<string, unknown> = {},
) {
  const next = keepRequirementScopedRecord(current, scope.broadDiagrams, models);
  for (const modelId of scope.targetedModelIds) {
    const value = current[modelId];
    if (value !== undefined) {
      next[modelId] = value;
    }
  }
  return next;
}

export function traceabilityEntryMatchesScope(
  entry: RequirementModelTraceabilityEntry,
  scope: RequirementSnapshotScope,
) {
  if (scope.broadDiagrams.includes(entry.target.diagramKind as DiagramType)) {
    return true;
  }
  const modelId =
    "modelId" in entry.target && typeof entry.target.modelId === "string"
      ? entry.target.modelId
      : "";
  return scope.targetedModelIds.has(modelId);
}

function requirementErrorDiagrams(
  diagramErrors: WorkspaceRunSnapshot["diagramErrors"],
) {
  return new Set(
    Object.keys(diagramErrors)
      .map((key) => key.split(":")[0])
      .filter((diagram): diagram is DiagramType =>
        Boolean(
          diagram &&
            [
              "function",
              "usecase",
              "class",
              "activity",
              "deployment",
              "prototype",
              "analysis",
            ].includes(diagram),
        ),
      ),
  );
}

export function successfulRequirementDiagramsFromSnapshot(
  snapshot: WorkspaceRunSnapshot,
) {
  const errored = requirementErrorDiagrams(snapshot.diagramErrors);
  const artifactDiagrams = Array.from(
    new Set([
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ]),
  ).filter((diagram) => !errored.has(diagram));
  const selectedModelDiagrams = Array.from(
    new Set(
      snapshot.models
        .map((model) => model.diagramKind)
        .filter(
          (diagram) =>
            snapshot.selectedDiagrams.includes(diagram) &&
            !errored.has(diagram),
        ),
    ),
  );
  const modelDiagrams = Array.from(
    new Set(snapshot.models.map((model) => model.diagramKind)),
  ).filter((diagram) => !errored.has(diagram));
  return orderedRequirementDiagrams(
    artifactDiagrams.length > 0
      ? artifactDiagrams
      : selectedModelDiagrams.length > 0
        ? selectedModelDiagrams
        : modelDiagrams,
  );
}

export function diagramsFromRequirementSnapshot(
  snapshot: WorkspaceRunSnapshot,
) {
  return Array.from(
    new Set([
      ...snapshot.selectedDiagrams,
      ...snapshot.models.map((model) => model.diagramKind),
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
      ...Object.keys(snapshot.diagramErrors),
    ]),
  ) as DiagramType[];
}

// Generated source declarations are trusted; availability does not re-audit element coverage.
export function hasRequirementSources(
  models: Array<DiagramModelSpec | undefined>,
  traceability: RequirementModelTraceabilityEntry[],
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"] = {},
  sourceKinds?: readonly DiagramType[],
) {
  const available = models.filter(model => model && (!sourceKinds || sourceKinds.includes(model.diagramKind)));
  return available.length > 0 && (traceability.length > 0 || available.every(model => model!.diagramKind === "analysis" || manualModelEditStatus[getRequirementModelId(model!)]?.status === "rerendered"));
}

export function isRequirementDiagramStale(input: {
  diagram: DiagramType;
  activeRequirementFingerprint: string;
  generatedDiagrams: DiagramType[];
  requirementInputFingerprint: string | null;
  diagramInputFingerprints: Partial<Record<DiagramType, string>>;
  diagramVersions: Partial<Record<DiagramType, number>>;
  rulesVersion: number;
  models: Partial<Record<DiagramType, DiagramModelSpec>>;
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"];
}) {
  const {
    diagram,
    activeRequirementFingerprint,
    generatedDiagrams,
    diagramInputFingerprints,
    models,
  } = input;
  const diagramFingerprint = diagramInputFingerprints[diagram];
  if (diagramFingerprint) {
    return !fingerprintMatches(
      diagramFingerprint,
      activeRequirementFingerprint,
    );
  }
  // Existing output without its own current receipt has an unverified source.
  return generatedDiagrams.includes(diagram) || Boolean(findRequirementModelByKind(models, diagram));
}

export function hasDesignSources(
  models: Array<DesignDiagramModelSpec | undefined>,
  traceability: DesignModelTraceabilityEntry[],
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"] = {},
) {
  const available = models.filter(Boolean);
  return available.length > 0 && (traceability.length > 0 || available.every(model => manualModelEditStatus[getDesignModelId(model!)]?.status === "rerendered"));
}

export function describeMissingDesignSources(traceability: DesignModelTraceabilityEntry[]) {
  return traceability.length ? "" : "缺少首次生成的来源声明";
}
