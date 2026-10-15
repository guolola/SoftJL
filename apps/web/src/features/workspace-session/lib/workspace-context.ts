// Derives workspace fingerprints, scoped snapshot updates, and traceability freshness for session workflows.
import {
  designDiagramKindFromRecordKey,
  designRecordBelongsToDiagramKinds,
  designTraceabilityTouchesDiagramKinds,
  modelRecordBelongsToDiagramKinds,
} from "@uml-platform/contracts";
import type {
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DiagramModelSpec,
  ModelElementRef,
  RequirementBaseline,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import {
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
  normalizeDesignInputFingerprint,
  normalizeSnapshotFingerprint,
  snapshotInputFingerprint,
} from "./fingerprint";
import {
  orderedDesignDiagrams,
  orderedRequirementDiagrams,
} from "./generation-planning";

export type ApplyRunSnapshotOptions = {
  preserveRuleReviewState?: boolean;
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
  return normalizeSnapshotFingerprint(storedFingerprint) === currentFingerprint;
}

export function designFingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return (
    normalizeDesignInputFingerprint(storedFingerprint) === currentFingerprint
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

function refKey(diagramKind: string, elementId: string, modelId?: string) {
  const scope = compactRefValue(modelId) || diagramKind;
  return `${scope}:${diagramKind}:${elementId}`.toLowerCase();
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

function compactRefValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function activityNodeTraceabilityKind(nodeType: unknown) {
  switch (nodeType) {
    case "activity":
      return "activity";
    case "decision":
      return "decision";
    case "object": return "object-node";
    case "flow_final": return "flow-final-node";
    case "start":
      return "start-node";
    case "end":
      return "end-node";
    case "merge":
      return "merge-node";
    case "fork":
      return "fork-node";
    case "join":
      return "join-node";
    default:
      return "activity-node";
  }
}

function prototypeNodeTraceabilityKind(nodeType: unknown) {
  switch (nodeType) {
    case "screen":
      return "screen";
    case "module":
      return "module";
    case "entry-point":
      return "entry-point";
    default:
      return "interface-node";
  }
}

function isBusinessTraceabilityKind(kind: string) {
  return ![
    "flow-final-node", "input-pin", "output-pin", "activation",
    "system-boundary",
    "swimlane",
    "start-node",
    "end-node",
    "merge-node",
    "fork-node",
    "join-node",
  ].includes(kind);
}

function collectTraceableRefKeys(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
) {
  const keys = new Set<string>();
  for (const model of models) {
    const diagramKind = model.diagramKind;
    const modelId = compactRefValue(
      (model as unknown as Record<string, unknown>).modelId,
    );
    const record = model as unknown as Record<string, unknown>;
    const listKeys: Array<[string, string]> = [
      ["actors", "actor"],
      ["useCases", "usecase"],
      ["systemBoundaries", "system-boundary"],
      ["classes", "class"],
      ["interfaces", "interface"],
      ["enums", "enum"],
      ["swimlanes", "swimlane"],
      [
        "nodes",
        diagramKind === "function"
          ? "function"
          : diagramKind === "deployment"
            ? "deployment-node"
            : "activity-node",
      ],
      ["packages", "package"],
      ["databases", "database"],
      ["components", "component"],
      ["externalSystems", "external-system"],
      ["artifacts", "artifact"],
      ["participants", "participant"],
      ["messages", "message"],
      ["fragments", "fragment"],
      ["tables", "table"],
    ];
    const businessElementIds = new Set<string>();
    if (model.diagramKind === "activity") for (const node of model.nodes) if (node.type === "activity") for (const pin of [...node.inputPins ?? [], ...node.outputPins ?? []]) businessElementIds.add(pin.id);

    for (const [key, defaultKind] of listKeys) {
      const items = Array.isArray(record[key]) ? record[key] : [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const itemRecord = item as Record<string, unknown>;
        const id = compactRefValue(itemRecord.id);
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? activityNodeTraceabilityKind(itemRecord.type)
            : key === "nodes" && (diagramKind === "prototype" || diagramKind === "navigation")
              ? prototypeNodeTraceabilityKind(itemRecord.nodeType)
            : defaultKind;
        if (id && isBusinessTraceabilityKind(kind)) {
          keys.add(refKey(diagramKind, id, modelId || undefined));
          businessElementIds.add(id);
        }
        if (key === "tables") {
          const columns = Array.isArray(itemRecord.columns)
            ? itemRecord.columns
            : [];
          for (const column of columns) {
            if (!column || typeof column !== "object") continue;
            const columnId = compactRefValue(
              (column as Record<string, unknown>).id,
            );
            if (id && columnId) {
              keys.add(
                refKey(diagramKind, `${id}.${columnId}`, modelId || undefined),
              );
              businessElementIds.add(`${id}.${columnId}`);
            }
          }
        }
      }
    }

    const relationships = Array.isArray(record.relationships)
      ? record.relationships
      : [];
    for (const relationship of relationships) {
      if (!relationship || typeof relationship !== "object") continue;
      const relationshipRecord = relationship as Record<string, unknown>;
      if (
        diagramKind === "activity" &&
        (!businessElementIds.has(
          compactRefValue(relationshipRecord.sourceId),
        ) ||
          !businessElementIds.has(compactRefValue(relationshipRecord.targetId)))
      ) {
        continue;
      }
      const id = compactRefValue(relationshipRecord.id);
      if (id) keys.add(refKey(diagramKind, id, modelId || undefined));
    }
  }
  return keys;
}

function hasCompleteTraceabilityCoverage(
  modelRefs: Set<string>,
  refs: ModelElementRef[],
) {
  if (modelRefs.size === 0) return false;
  const covered = new Set(
    refs.map((ref) => refKey(ref.diagramKind, ref.elementId, ref.modelId)),
  );
  return Array.from(modelRefs).every((key) => covered.has(key));
}

function isManualModelRerendered(
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"],
  key: string,
) {
  return manualModelEditStatus[key]?.status === "rerendered";
}

export function hasCompleteRequirementTraceability(
  models: Array<DiagramModelSpec | undefined>,
  traceability: RequirementModelTraceabilityEntry[],
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"] = {},
) {
  const availableModels = models.filter((model): model is DiagramModelSpec =>
    Boolean(model),
  );
  const modelsRequiringTraceability = availableModels.filter(
    (model) =>
      model.diagramKind !== "analysis" &&
      !isManualModelRerendered(manualModelEditStatus, model.diagramKind),
  );
  if (modelsRequiringTraceability.length === 0) {
    return availableModels.length > 0;
  }
  const modelRefs = collectTraceableRefKeys(modelsRequiringTraceability);
  return hasCompleteTraceabilityCoverage(
    modelRefs,
    traceability.map((entry) => entry.target),
  );
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
    requirementInputFingerprint,
    diagramInputFingerprints,
    diagramVersions,
    rulesVersion,
    models,
  } = input;
  const diagramFingerprint = diagramInputFingerprints[diagram];
  if (diagramFingerprint) {
    return !fingerprintMatches(
      diagramFingerprint,
      activeRequirementFingerprint,
    );
  }
  if (!generatedDiagrams.includes(diagram)) return false;

  const diagramVersion = diagramVersions[diagram];
  if (diagramVersion !== undefined) return diagramVersion !== rulesVersion;

  if (!findRequirementModelByKind(models, diagram) || !requirementInputFingerprint) return false;
  return !fingerprintMatches(
    requirementInputFingerprint,
    activeRequirementFingerprint,
  );
}

export function hasCompleteDesignTraceability(
  models: Array<DesignDiagramModelSpec | undefined>,
  traceability: DesignModelTraceabilityEntry[],
  manualModelEditStatus: WorkspaceRecord["manualModelEditStatus"] = {},
  requirementModels: Array<DiagramModelSpec | undefined> = [],
) {
  const availableModels = models.filter(
    (model): model is DesignDiagramModelSpec => Boolean(model),
  );
  const modelsRequiringTraceability = availableModels.filter(
    (model) =>
      !isManualModelRerendered(manualModelEditStatus, getDesignModelId(model)),
  );
  if (modelsRequiringTraceability.length === 0) {
    return availableModels.length > 0;
  }
  const modelRefs = collectTraceableRefKeys(modelsRequiringTraceability);
  const sourceCoverageComplete = hasCompleteTraceabilityCoverage(
    modelRefs,
    traceability.map((entry) => entry.source),
  );
  if (!sourceCoverageComplete) return false;
  const requirementRefs = collectTraceableRefKeys(
    requirementModels.filter((model): model is DiagramModelSpec =>
      Boolean(model),
    ),
  );
  if (requirementRefs.size === 0) return true;
  return traceability.every((entry) =>
    entry.targets.every((target) =>
      requirementRefs.has(
        refKey(target.diagramKind, target.elementId, target.modelId),
      ),
    ),
  );
}

export function describeDesignTraceabilityGap(input: {
  models: Array<DesignDiagramModelSpec | undefined>;
  traceability: DesignModelTraceabilityEntry[];
  manualModelEditStatus?: WorkspaceRecord["manualModelEditStatus"];
  requirementModels?: Array<DiagramModelSpec | undefined>;
  limit?: number;
}) {
  const limit = input.limit ?? 5;
  const availableModels = input.models.filter(
    (model): model is DesignDiagramModelSpec => Boolean(model),
  );
  const manualStatus = input.manualModelEditStatus ?? {};
  const modelsRequiringTraceability = availableModels.filter(
    (model) => !isManualModelRerendered(manualStatus, getDesignModelId(model)),
  );
  const expectedSources = collectTraceableRefKeys(modelsRequiringTraceability);
  const coveredSources = new Set(
    input.traceability.map((entry) =>
      refKey(entry.source.diagramKind, entry.source.elementId, entry.source.modelId),
    ),
  );
  const missingSources = Array.from(expectedSources).filter(
    (key) => !coveredSources.has(key),
  );

  const requirementRefs = collectTraceableRefKeys(
    (input.requirementModels ?? []).filter((model): model is DiagramModelSpec =>
      Boolean(model),
    ),
  );
  const invalidTargets =
    requirementRefs.size === 0
      ? []
      : input.traceability.flatMap((entry) =>
          entry.targets
            .map((target) =>
              refKey(target.diagramKind, target.elementId, target.modelId),
            )
            .filter((key) => !requirementRefs.has(key)),
        );
  const details: string[] = [];
  if (missingSources.length > 0) {
    details.push(`缺少映射：${missingSources.slice(0, limit).join("、")}`);
  }
  if (invalidTargets.length > 0) {
    details.push(`目标已失效：${invalidTargets.slice(0, limit).join("、")}`);
  }
  return details.join("；");
}

export type DesignModelTraceabilityCheck = {
  modelId: string;
  diagramKind: DesignDiagramType;
  sourceCoverageComplete: boolean;
  targetRefsValid: boolean;
  complete: boolean;
};

function designTraceabilityEntriesForModel(
  model: DesignDiagramModelSpec,
  traceability: DesignModelTraceabilityEntry[],
) {
  const modelId = getDesignModelId(model);
  return traceability.filter((entry) => {
    const sourceModelId = entry.source.modelId?.trim();
    if (sourceModelId) return sourceModelId === modelId;
    return modelId === model.diagramKind && entry.source.diagramKind === model.diagramKind;
  });
}

export function checkDesignModelTraceability(input: {
  model: DesignDiagramModelSpec;
  traceability: DesignModelTraceabilityEntry[];
  manualModelEditStatus?: WorkspaceRecord["manualModelEditStatus"];
  requirementModels?: Array<DiagramModelSpec | undefined>;
}): DesignModelTraceabilityCheck {
  const manualStatus = input.manualModelEditStatus ?? {};
  const modelId = getDesignModelId(input.model);
  const entries = designTraceabilityEntriesForModel(input.model, input.traceability);
  const sourceCoverageComplete = isManualModelRerendered(manualStatus, modelId)
    ? true
    : hasCompleteTraceabilityCoverage(
        collectTraceableRefKeys([input.model]),
        entries.map((entry) => entry.source),
      );
  const requirementRefs = collectTraceableRefKeys(
    (input.requirementModels ?? []).filter((model): model is DiagramModelSpec =>
      Boolean(model),
    ),
  );
  const targetRefsValid =
    requirementRefs.size === 0 ||
    entries.every((entry) =>
      entry.targets.every((target) =>
        requirementRefs.has(
          refKey(target.diagramKind, target.elementId, target.modelId),
        ),
      ),
    );
  return {
    modelId,
    diagramKind: input.model.diagramKind,
    sourceCoverageComplete,
    targetRefsValid,
    complete: sourceCoverageComplete && targetRefsValid,
  };
}
