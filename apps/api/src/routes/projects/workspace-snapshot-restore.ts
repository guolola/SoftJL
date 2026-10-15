// Restores persisted run snapshots into the project workspace state without browser round-trips.
import {
  designDiagramKindFromRecordKey,
  designInputFingerprint,
  designRecordBelongsToDiagramKinds,
  designTraceabilityTouchesDiagramKinds,
  modelRecordBelongsToDiagramKinds,
  normalizeSnapshotFingerprint,
  snapshotInputFingerprint,
  isLegacyCodeSnapshot,
  stripRetiredCodeData,
  activeRequirementModels,
} from "@uml-platform/contracts";
import type {
  AtomicRequirement,
  
  DesignDiagramKind,
  DesignDiagramModelSpec,
  DesignPlantUmlArtifact,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramKind,
  DiagramModelSpec,
  DocumentRunSnapshot,
  FeasibilityRunSnapshot,
  PlantUmlArtifact,
  RequirementBaseline,
  RequirementQualityIssue,
  RequirementModelTraceabilityEntry,
  RunSnapshot,
  SvgArtifact,
} from "@uml-platform/contracts";

export type RestorableRunSnapshot =
  | RunSnapshot
  | DesignRunSnapshot;

type AnyRunSnapshot = RestorableRunSnapshot | DocumentRunSnapshot | FeasibilityRunSnapshot;
type WorkspaceState = Record<string, unknown>;
type BaselineRequirement = RequirementBaseline["requirements"][number];

const REVIEWABLE_REQUIREMENT_FIELDS = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
] as const;

export function isRestorableRunSnapshot(
  snapshot: AnyRunSnapshot,
): snapshot is RestorableRunSnapshot {
  return !isLegacyCodeSnapshot(snapshot) && !("documentKind" in snapshot) && !("selectedArtifacts" in snapshot);
}

function reviewCandidateStillNeeded(
  baseline: RequirementBaseline,
  ruleId: string,
) {
  const qualityIssueRequirementIds = new Set(
    baseline.qualityReport.issues.map((issue) => issue.requirementId),
  );
  const reviewRequiredRequirementIds = new Set(
    baseline.qualityReport.reviewRequiredRequirementIds,
  );
  return baseline.requirements.some((requirement) => {
    if (requirement.sourceRuleId !== ruleId) return false;
    if (reviewRequiredRequirementIds.has(requirement.id)) return true;
    if (qualityIssueRequirementIds.has(requirement.id)) return true;
    if (requirement.status !== "accepted") return true;
    return Object.values(requirement.fieldProvenance).some((provenance) => {
      if (!provenance || typeof provenance !== "object") return false;
      const status = stringValue(
        (provenance as Record<string, unknown>).status,
      );
      return status === "pending-review" || status === "rejected";
    });
  });
}

function requirementStillNeedsReview(requirement: BaselineRequirement) {
  if (requirement.status !== "accepted") return true;
  return REVIEWABLE_REQUIREMENT_FIELDS.some((field) => {
    const provenance = requirement.fieldProvenance[field];
    return (
      provenance?.status === "pending-review" ||
      provenance?.status === "rejected"
    );
  });
}

function acceptedRequirementFromCandidate(
  candidate: Record<string, unknown>,
  currentRequirement: BaselineRequirement,
): AtomicRequirement | null {
  if (stringValue(candidate.status) !== "accepted") return null;
  const reviewedValue =
    isRecord(candidate.afterRequirement) ?
      candidate.afterRequirement :
      isRecord(candidate.beforeRequirement) ?
        candidate.beforeRequirement :
        null;
  if (!reviewedValue) return null;
  const reviewed = reviewedValue as unknown as AtomicRequirement;
  const fieldProvenance = { ...reviewed.fieldProvenance };
  for (const field of REVIEWABLE_REQUIREMENT_FIELDS) {
    const provenance = fieldProvenance[field];
    if (!provenance) continue;
    fieldProvenance[field] = {
      ...provenance,
      status: "accepted",
      issueIds: [],
    };
  }
  return {
    ...reviewed,
    id: currentRequirement.id,
    sourceRuleId: currentRequirement.sourceRuleId ?? reviewed.sourceRuleId,
    status: "accepted",
    confidence: Math.max(reviewed.confidence, currentRequirement.confidence),
    fieldProvenance,
  };
}

function rebuildRequirementQualityReport(
  baseline: RequirementBaseline,
  requirements: BaselineRequirement[],
  issues: RequirementQualityIssue[],
): RequirementBaseline["qualityReport"] {
  const blockingIssueIds = issues
    .filter((issue) => issue.blocksDownstream)
    .map((issue) => issue.id);
  const reviewRequiredRequirementIds = requirements
    .filter(requirementStillNeedsReview)
    .map((requirement) => requirement.id);
  const status: RequirementBaseline["qualityReport"]["status"] =
    blockingIssueIds.length > 0
      ? "blocked"
      : reviewRequiredRequirementIds.length > 0 || issues.length > 0
        ? "pending-review"
        : "passed";
  return {
    ...baseline.qualityReport,
    status,
    summary:
      status === "passed"
        ? `已建立 ${requirements.length} 条原子需求基线。`
        : `发现 ${issues.length} 个需求质量提示，可继续生成并在当前页面查看。`,
    issues,
    blockingIssueIds,
    reviewRequiredRequirementIds,
  };
}

function reconcileAcceptedReviewCandidates(
  baseline: RequirementBaseline,
  candidatesValue: unknown,
): RequirementBaseline {
  const candidates = recordValue(candidatesValue);
  const hasAcceptedCandidate = Object.values(candidates).some(
    (candidate) => isRecord(candidate) && stringValue(candidate.status) === "accepted",
  );
  if (!hasAcceptedCandidate) return baseline;

  const acceptedRequirementIds = new Set<string>();
  const requirements = baseline.requirements.map((requirement) => {
    const ruleId = requirement.sourceRuleId;
    const candidate = ruleId ? candidates[ruleId] : undefined;
    if (!isRecord(candidate) || stringValue(candidate.status) !== "accepted") {
      return requirement;
    }
    const reviewed = acceptedRequirementFromCandidate(candidate, requirement);
    if (!reviewed) return requirement;
    acceptedRequirementIds.add(requirement.id);
    acceptedRequirementIds.add(reviewed.id);
    return reviewed;
  });
  if (acceptedRequirementIds.size === 0) return baseline;

  const issues = baseline.qualityReport.issues.filter(
    (issue) =>
      !issue.requirementId || !acceptedRequirementIds.has(issue.requirementId),
  );
  return {
    ...baseline,
    requirements,
    qualityReport: rebuildRequirementQualityReport(baseline, requirements, issues),
  };
}



function pruneRequirementReviewCandidatesForBaseline(
  candidates: unknown,
  baseline: RequirementBaseline,
) {
  const next = { ...recordValue(candidates) };
  for (const [ruleId, candidate] of Object.entries(next)) {
    const status = isRecord(candidate) ? stringValue(candidate.status) : "";
    if (
      (status === "pending" || status === "failed") &&
      !reviewCandidateStillNeeded(baseline, ruleId)
    ) {
      delete next[ruleId];
    }
  }
  return next;
}

function applyRequirementBaselineToWorkspaceState(
  state: WorkspaceState,
  baseline: RequirementBaseline,
) {
  const reconciledBaseline = reconcileAcceptedReviewCandidates(
    baseline,
    state.requirementReviewCandidates,
  );
  state.requirementBaseline = reconciledBaseline;
  state.requirementQualityReport = reconciledBaseline.qualityReport;
  state.requirementReviewCandidates =
    pruneRequirementReviewCandidatesForBaseline(
      state.requirementReviewCandidates,
      reconciledBaseline,
    );
}

export function restoreRunSnapshotToWorkspaceState({
  currentState,
  snapshot,
  mode = "merge",
  replaceRequirementInput = false,
}: {
  currentState?: WorkspaceState | null;
  snapshot: RestorableRunSnapshot;
  mode?: "merge" | "restore";
  replaceRequirementInput?: boolean;
}) {
  if (isDesignRunSnapshot(snapshot)) snapshot = { ...snapshot, requirementModels: activeRequirementModels(snapshot.requirementModels) };
  const base = mode === "restore" ? {} : { ...(currentState ?? {}) };
  return applySnapshotToWorkspaceState(base, snapshot, {
    replaceRequirementInput,
  });
}

function applySnapshotToWorkspaceState(
  state: WorkspaceState,
  snapshot: RestorableRunSnapshot,
  options: { replaceRequirementInput?: boolean } = {},
) {
  const next: WorkspaceState = stripRetiredCodeData({ ...state });
  const currentRequirementText = stringValue(next.requirementText);
  const currentRules = arrayValue(next.rules);
  const currentHasRequirements =
    currentRequirementText.trim().length > 0 || currentRules.length > 0;

  
  const isDesignSnapshot = isDesignRunSnapshot(snapshot);
  const isRequirementSnapshot = !isDesignSnapshot;
  {
    const kind = isDesignSnapshot ? "design" : "requirements";
    next.visualReviews = {
      ...recordValue(next.visualReviews),
      ...Object.fromEntries(Object.entries(snapshot.visualReviews ?? {}).map(([id, review]) => [`${kind}:${id}`, review])),
    };
  }
  const snapshotRequirementFingerprint = snapshotInputFingerprint({
        requirementText: snapshot.requirementText,
        rules: snapshot.rules,
      });
  if (
    isRequirementSnapshot &&
    currentRequirementText.trim().length === 0 &&
    snapshot.requirementText.trim().length > 0
  ) {
    next.requirementText = snapshot.requirementText;
  }
  const isRulesOnlyRequirementSnapshot =
    isRequirementSnapshot &&
    snapshot.selectedDiagrams.length === 0 &&
    snapshot.models.length === 0 &&
    snapshot.plantUml.length === 0 &&
    snapshot.svgArtifacts.length === 0 &&
    Object.keys(snapshot.diagramErrors).length === 0;

  if (
    options.replaceRequirementInput &&
    isRequirementSnapshot &&
    snapshot.rules.length > 0
  ) {
    next.requirementText = snapshot.requirementText;
    next.rules = [...snapshot.rules];
  } else if (
    isRequirementSnapshot &&
    (isRulesOnlyRequirementSnapshot || !currentHasRequirements)
  ) {
    next.requirementText = snapshot.requirementText;
    next.rules = [...snapshot.rules];
  }
  if (
    isRequirementSnapshot &&
    snapshot.rules.length > 0 &&
    currentRules.length === 0 &&
    stringValue(next.requirementText).trim() === snapshot.requirementText.trim()
  ) {
    next.rules = [...snapshot.rules];
  }

  const workspaceRequirementFingerprint = snapshotInputFingerprint({
    requirementText: stringValue(next.requirementText),
    rules: arrayValue(next.rules),
  });
  if (
    isRequirementSnapshot &&
    snapshot.requirementBaseline &&
    (!currentHasRequirements ||
      fingerprintMatches(
        snapshotRequirementFingerprint,
        workspaceRequirementFingerprint,
      ))
  ) {
    applyRequirementBaselineToWorkspaceState(next, snapshot.requirementBaseline);
  }

  

  if (isDesignRunSnapshot(snapshot)) {
    const designRecords = mapDesignSnapshotToRecords(snapshot);
    const erroredDesignDiagrams = new Set(
      Object.keys(snapshot.diagramErrors)
        .map(designDiagramKindFromRecordKey)
        .filter((diagram): diagram is DesignDiagramKind => Boolean(diagram)),
    );
    const successfulAffectedDesignDiagrams =
      successfulDesignDiagramsFromSnapshot(snapshot, designRecords);
    const affectedForErrors = uniqueStrings([
      ...snapshot.selectedDiagrams,
      ...successfulAffectedDesignDiagrams,
      ...Array.from(erroredDesignDiagrams),
    ]) as DesignDiagramKind[];
    const affectedDesignModelIds = Object.entries(
      recordValue(next.designModels),
    )
      .filter(([modelId, model]) =>
        designRecordBelongsToDiagramKinds(
          modelId,
          model,
          successfulAffectedDesignDiagrams,
        ),
      )
      .map(([modelId]) => modelId);
    const affectedDesignModelMap = keepDesignScopedRecords(
      designRecords.modelMap,
      successfulAffectedDesignDiagrams,
    );
    const requirementDiagrams = snapshot.requirementModels.map(
      (model) => model.diagramKind,
    );
    const canMergeRequirementContextFromSnapshot =
      requirementDiagrams.length > 0 &&
      snapshot.requirementText.trim().length > 0 &&
      snapshot.rules.length > 0 &&
      !currentHasRequirements;
    const currentRequirementVersion = fingerprintMatches(
      stringOrNull(next.requirementInputFingerprint),
      workspaceRequirementFingerprint,
    )
      ? numberValue(next.rulesVersion)
      : numberValue(next.rulesVersion) + 1;
    const currentDesignFingerprint = designInputFingerprint(
      snapshot.requirementModels,
      snapshot.requirementModelTraceability,
    );

    next.selectedDesignDiagramTypes = [];
    if (successfulAffectedDesignDiagrams.length > 0) {
      next.designModels = {
        ...clearDesignScopedRecords(
          recordValue(next.designModels),
          successfulAffectedDesignDiagrams,
        ),
        ...affectedDesignModelMap,
      };
    }
    next.designModelTraceability = mergeDesignTraceability(
      arrayValue(
        next.designModelTraceability,
      ) as DesignRunSnapshot["designModelTraceability"],
      snapshot.designModelTraceability,
      successfulAffectedDesignDiagrams,
      affectedDesignModelIds,
    );
    next.generatedDesignDiagramTypes = uniqueStrings([
      ...stringArrayValue(next.generatedDesignDiagramTypes),
      ...successfulAffectedDesignDiagrams,
    ]);
    if (successfulAffectedDesignDiagrams.length > 0) {
      next.designInputFingerprints = {
        ...clearDesignScopedRecords(
          recordValue(next.designInputFingerprints),
          successfulAffectedDesignDiagrams,
          recordValue(state.designModels),
        ),
        ...Object.fromEntries(
          Object.keys(affectedDesignModelMap).map((modelId) => [
            modelId,
            currentDesignFingerprint,
          ]),
        ),
      };
      next.designPlantUml = {
        ...clearDesignScopedRecords(
          recordValue(next.designPlantUml),
          successfulAffectedDesignDiagrams,
          recordValue(state.designModels),
        ),
        ...keepDesignScopedRecords(
          designRecords.plantUmlMap,
          successfulAffectedDesignDiagrams,
          designRecords.modelMap,
        ),
      };
      next.designSvgArtifacts = {
        ...clearDesignScopedRecords(
          recordValue(next.designSvgArtifacts),
          successfulAffectedDesignDiagrams,
          recordValue(state.designModels),
        ),
        ...keepDesignScopedRecords(
          designRecords.svgMap,
          successfulAffectedDesignDiagrams,
        ),
      };
    }
    next.designDiagramErrors = clearAndMergeDiagramErrors(
      recordValue(next.designDiagramErrors),
      snapshot.diagramErrors,
      affectedForErrors,
      recordValue(state.designModels),
    );
    next.selectedDiagramTypes = [];
    if (canMergeRequirementContextFromSnapshot) {
      next.models = {
        ...clearScopedRecords(recordValue(next.models), requirementDiagrams),
        ...Object.fromEntries(
          snapshot.requirementModels.map((model) => [
            getRequirementModelId(model),
            model,
          ]),
        ),
      };
      next.requirementModelTraceability = mergeRequirementTraceability(
        arrayValue(
          next.requirementModelTraceability,
        ) as RequirementModelTraceabilityEntry[],
        snapshot.requirementModelTraceability,
        requirementDiagrams,
      );
      next.generatedDiagramTypes = uniqueStrings([
        ...stringArrayValue(next.generatedDiagramTypes),
        ...requirementDiagrams,
      ]);
      next.requirementInputFingerprint = workspaceRequirementFingerprint;
      next.rulesVersion = currentRequirementVersion;
      next.rulesBasedOnTextVersion = 0;
      next.diagramInputFingerprints = {
        ...recordValue(next.diagramInputFingerprints),
        ...Object.fromEntries(
          requirementDiagrams.map((diagram) => [
            diagram,
            snapshotRequirementFingerprint,
          ]),
        ),
      };
      next.diagramVersions = {
        ...recordValue(next.diagramVersions),
        ...Object.fromEntries(
          requirementDiagrams.map((diagram) => [
            diagram,
            currentRequirementVersion,
          ]),
        ),
      };
    }
    return finalizeSnapshotWorkspaceState(next);
  }

  const records = mapRequirementSnapshotToRecords(snapshot);
  const erroredDiagrams = new Set(
    Object.keys(snapshot.diagramErrors)
      .map(diagramKindFromErrorKey)
      .filter((diagram): diagram is DiagramKind => Boolean(diagram)),
  );
  const modelDiagrams = uniqueStrings(
    Object.values(records.modelMap)
      .map((model) => model.diagramKind)
      .filter((diagram): diagram is DiagramKind =>
        Boolean(diagram && !erroredDiagrams.has(diagram)),
      ),
  ) as DiagramKind[];
  const artifactDiagrams = uniqueStrings(
    [
      ...snapshot.plantUml.map((artifact) => artifact.diagramKind),
      ...snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ].filter(
      (diagram): diagram is DiagramKind => !erroredDiagrams.has(diagram),
    ),
  );
  const selectedModelDiagrams = modelDiagrams.filter((diagram) =>
    snapshot.selectedDiagrams.includes(diagram),
  );
  const canFallbackToContextModels =
    snapshot.selectedDiagrams.length === 0 &&
    Object.keys(snapshot.diagramErrors).length === 0;
  const successfulAffected = uniqueStrings(
    artifactDiagrams.length > 0
      ? artifactDiagrams
      : selectedModelDiagrams.length > 0
        ? selectedModelDiagrams
        : canFallbackToContextModels
          ? modelDiagrams
          : [],
  ) as DiagramKind[];
  const affectedForErrors = uniqueStrings([
    ...snapshot.selectedDiagrams,
    ...successfulAffected,
    ...Array.from(erroredDiagrams),
  ]) as DiagramKind[];
  const affected =
    affectedForErrors.length > 0 ? affectedForErrors : successfulAffected;
  const affectedModelMap = keepScopedRecords(
    records.modelMap,
    successfulAffected,
  );
  const inputChanged =
    next.requirementInputFingerprint !== null &&
    next.requirementInputFingerprint !== undefined &&
    !fingerprintMatches(
      stringOrNull(next.requirementInputFingerprint),
      workspaceRequirementFingerprint,
    );
  const nextRulesVersion = inputChanged
    ? numberValue(next.rulesVersion) + 1
    : numberValue(next.rulesVersion) || 1;

  next.selectedDiagramTypes = [];
  next.rulesVersion = nextRulesVersion;
  next.rulesBasedOnTextVersion = 0;
  next.requirementInputFingerprint = workspaceRequirementFingerprint;
  if (affected.length === 0) {
    return finalizeSnapshotWorkspaceState(next);
  }

  if (successfulAffected.length > 0) {
    next.models = {
      ...clearScopedRecords(recordValue(next.models), successfulAffected),
      ...affectedModelMap,
    };
  }
  next.requirementModelTraceability = mergeRequirementTraceability(
    arrayValue(
      next.requirementModelTraceability,
    ) as RequirementModelTraceabilityEntry[],
    snapshot.requirementModelTraceability ?? [],
    successfulAffected,
  );
  next.generatedDiagramTypes = uniqueStrings([
    ...stringArrayValue(next.generatedDiagramTypes),
    ...successfulAffected,
  ]);
  if (successfulAffected.length > 0) {
    next.plantUml = {
      ...clearScopedRecords(recordValue(next.plantUml), successfulAffected, recordValue(state.models)),
      ...keepScopedRecords(records.plantUmlMap, successfulAffected, records.modelMap),
    };
    next.svgArtifacts = {
      ...clearScopedRecords(recordValue(next.svgArtifacts), successfulAffected),
      ...keepScopedRecords(records.svgMap, successfulAffected),
    };
  }
  next.diagramErrors = clearAndMergeDiagramErrors(
    recordValue(next.diagramErrors),
    snapshot.diagramErrors,
    affected,
    recordValue(state.models),
  );
  next.diagramVersions = {
    ...recordValue(next.diagramVersions),
    ...Object.fromEntries(
      successfulAffected.map((diagram) => [diagram, nextRulesVersion]),
    ),
  };
  next.diagramInputFingerprints = {
    ...recordValue(next.diagramInputFingerprints),
    ...Object.fromEntries(
      successfulAffected.map((diagram) => [
        diagram,
        snapshotRequirementFingerprint,
      ]),
    ),
  };
  return finalizeSnapshotWorkspaceState(next);
}



function isDesignRunSnapshot(
  snapshot: RestorableRunSnapshot,
): snapshot is DesignRunSnapshot {
  return "requirementModels" in snapshot;
}

function getDesignModelId(
  model: Pick<DesignDiagramModelSpec, "diagramKind" | "modelId">,
) {
  return model.modelId ?? model.diagramKind;
}

function getDesignArtifactId(
  artifact: Pick<
    DesignPlantUmlArtifact | DesignSvgArtifact,
    "diagramKind" | "modelId"
  >,
) {
  return artifact.modelId ?? artifact.diagramKind;
}

function getRequirementModelId(
  model: Pick<DiagramModelSpec, "diagramKind"> & { modelId?: string | null },
) {
  return model.modelId ?? model.diagramKind;
}

function getRequirementArtifactId(
  artifact: Pick<PlantUmlArtifact | SvgArtifact, "diagramKind"> & {
    modelId?: string | null;
  },
) {
  return artifact.modelId ?? artifact.diagramKind;
}

function hasWholeDesignDiagramError(
  diagramErrors: DesignRunSnapshot["diagramErrors"],
  diagram: DesignDiagramKind,
) {
  return Object.keys(diagramErrors).some((key) => {
    if (key === diagram) return true;
    if (key.startsWith(`${diagram}:`)) return false;
    return designDiagramKindFromRecordKey(key) === diagram;
  });
}

function successfulDesignDiagramsFromSnapshot(
  snapshot: DesignRunSnapshot,
  designRecords: ReturnType<typeof mapDesignSnapshotToRecords>,
) {
  const selectedDesignDiagrams = new Set(snapshot.selectedDiagrams);
  const artifactDesignDiagrams = uniqueStrings(
    snapshot.svgArtifacts
      .filter((artifact) => {
        if (!selectedDesignDiagrams.has(artifact.diagramKind)) return false;
        if (hasWholeDesignDiagramError(snapshot.diagramErrors, artifact.diagramKind)) {
          return false;
        }
        const artifactId = artifact.modelId ?? artifact.diagramKind;
        return !snapshot.diagramErrors[artifactId];
      })
      .map((artifact) => artifact.diagramKind),
  ) as DesignDiagramKind[];
  const modelDesignDiagrams = uniqueStrings(
    Object.values(designRecords.modelMap)
      .filter((model) => {
        if (!selectedDesignDiagrams.has(model.diagramKind)) return false;
        if (hasWholeDesignDiagramError(snapshot.diagramErrors, model.diagramKind)) {
          return false;
        }
        return !snapshot.diagramErrors[getDesignModelId(model)];
      })
      .map((model) => model.diagramKind),
  ) as DesignDiagramKind[];
  const successful = new Set([...artifactDesignDiagrams, ...modelDesignDiagrams]);
  return snapshot.selectedDiagrams.filter((diagram) => successful.has(diagram));
}

function mapRequirementSnapshotToRecords(snapshot: RunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model: DiagramModelSpec) => [
        getRequirementModelId(model),
        model,
      ]),
    ),
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact: PlantUmlArtifact) => [
        getRequirementArtifactId(artifact),
        artifact.source,
      ]),
    ),
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact: SvgArtifact) => [
        getRequirementArtifactId(artifact),
        artifact,
      ]),
    ),
  };
}

function mapDesignSnapshotToRecords(snapshot: DesignRunSnapshot) {
  return {
    modelMap: Object.fromEntries(
      snapshot.models.map((model) => [getDesignModelId(model), model]),
    ),
    plantUmlMap: Object.fromEntries(
      snapshot.plantUml.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact.source,
      ]),
    ),
    svgMap: Object.fromEntries(
      snapshot.svgArtifacts.map((artifact) => [
        getDesignArtifactId(artifact),
        artifact,
      ]),
    ),
  };
}

function clearAndMergeDiagramErrors<T extends string>(
  current: Record<string, unknown>,
  incoming: Partial<Record<T, unknown>>,
  affected: readonly T[],
  models: Record<string, unknown> = {},
) {
  const next = Object.fromEntries(Object.entries(current).filter(([key, value]) =>
    !modelRecordBelongsToDiagramKinds(key, value, affected, models)));
  return { ...next, ...incoming };
}

function clearScopedRecords<T>(
  current: Record<string, T>,
  affected: readonly string[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      !modelRecordBelongsToDiagramKinds(key, value, affected, models)),
  ) as Record<string, T>;
}

function keepScopedRecords<T>(
  current: Record<string, T>,
  affected: readonly string[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      modelRecordBelongsToDiagramKinds(key, value, affected, models)),
  ) as Record<string, T>;
}

function clearDesignScopedRecords<T>(
  current: Record<string, T>,
  affected: readonly DesignDiagramKind[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      !modelRecordBelongsToDiagramKinds(key, value, affected, models)),
  ) as Record<string, T>;
}

function keepDesignScopedRecords<T>(
  current: Record<string, T>,
  affected: readonly DesignDiagramKind[],
  models: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) =>
      modelRecordBelongsToDiagramKinds(key, value, affected, models)),
  ) as Record<string, T>;
}

function keepDesignRecordsForModelIds<T>(
  current: Record<string, T>,
  modelIds: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      const modelId =
        value && typeof value === "object" && "modelId" in value
          ? String((value as { modelId?: unknown }).modelId ?? "")
          : "";
      return modelIds.has(key) || modelIds.has(modelId);
    }),
  ) as Record<string, T>;
}

function repairMissingDesignInputFingerprints(state: WorkspaceState) {
  const generatedDesignDiagrams = stringArrayValue(state.generatedDesignDiagramTypes);
  const designModels = recordValue(state.designModels);
  if (
    generatedDesignDiagrams.length === 0 ||
    Object.keys(designModels).length === 0
  ) {
    return state;
  }

  const currentDesignFingerprint = designInputFingerprint(
    presentRecordValues(state.models) as DiagramModelSpec[],
    arrayValue(
      state.requirementModelTraceability,
    ) as RequirementModelTraceabilityEntry[],
  );
  const generated = new Set(generatedDesignDiagrams);
  const designInputFingerprints = {
    ...stringRecordValue(state.designInputFingerprints),
  };
  let repaired = false;
  for (const [modelId, model] of Object.entries(designModels)) {
    const diagramKind = readNestedString(model, ["diagramKind"]);
    if (!generated.has(diagramKind)) continue;
    if (!designInputFingerprints[modelId]) {
      designInputFingerprints[modelId] = currentDesignFingerprint;
      repaired = true;
    }
  }
  if (repaired) {
    state.designInputFingerprints = designInputFingerprints;
  }
  return state;
}

function assertGeneratedDesignChainComplete(state: WorkspaceState) {
  const generatedDesignDiagrams = stringArrayValue(state.generatedDesignDiagramTypes);
  if (generatedDesignDiagrams.length === 0) return;
  const generated = new Set(generatedDesignDiagrams);
  const designModels = recordValue(state.designModels);
  const generatedDesignModelIds = Object.entries(designModels)
    .filter(([, model]) => generated.has(readNestedString(model, ["diagramKind"])))
    .map(([modelId]) => modelId);
  if (generatedDesignModelIds.length === 0) return;

  const designInputFingerprints = stringRecordValue(state.designInputFingerprints);
  const designPlantUml = stringRecordValue(state.designPlantUml);
  const missingFingerprints = generatedDesignModelIds.filter(
    (modelId) => !designInputFingerprints[modelId],
  );
  const missingPlantUml = generatedDesignModelIds.filter(
    (modelId) => !designPlantUml[modelId],
  );
  const generatedDesignModelIdSet = new Set(generatedDesignModelIds);
  const traceability = arrayValue(
    state.designModelTraceability,
  ) as DesignRunSnapshot["designModelTraceability"];
  const hasGeneratedDesignTraceability = traceability.some((entry) => {
    if (!entry.source) return false;
    const sourceModelId = entry.source.modelId?.trim();
    if (sourceModelId) return generatedDesignModelIdSet.has(sourceModelId);
    return generated.has(entry.source.diagramKind);
  });
  if (
    missingFingerprints.length === 0 &&
    missingPlantUml.length === 0 &&
    hasGeneratedDesignTraceability
  ) {
    return;
  }

  const issues = [
    missingFingerprints.length > 0
      ? `missing design fingerprints: ${missingFingerprints.join(", ")}`
      : null,
    missingPlantUml.length > 0
      ? `missing design PlantUML: ${missingPlantUml.join(", ")}`
      : null,
    !hasGeneratedDesignTraceability ? "missing design traceability" : null,
  ].filter(Boolean);
  throw new Error(
    `快照链路元数据不完整，已阻止写入当前项目工作区：${issues.join("; ")}`,
  );
}

function completeGeneratedDesignDiagrams(
  state: WorkspaceState,
  candidates: readonly DesignDiagramKind[],
) {
  const designModels = recordValue(state.designModels);
  const designInputFingerprints = stringRecordValue(state.designInputFingerprints);
  const designPlantUml = stringRecordValue(state.designPlantUml);
  const traceability = arrayValue(
    state.designModelTraceability,
  ) as DesignRunSnapshot["designModelTraceability"];
  return candidates.filter((diagram) => {
    const modelIds = Object.entries(designModels)
      .filter(([, model]) => readNestedString(model, ["diagramKind"]) === diagram)
      .map(([modelId]) => modelId);
    if (modelIds.length === 0) return false;
    const modelIdSet = new Set(modelIds);
    const hasTraceability = traceability.some((entry) => {
      if (!entry.source) return false;
      const sourceModelId = entry.source.modelId?.trim();
      if (sourceModelId) return modelIdSet.has(sourceModelId);
      return entry.source.diagramKind === diagram;
    });
    return (
      hasTraceability &&
      modelIds.every(
        (modelId) =>
          Boolean(designInputFingerprints[modelId]) &&
          Boolean(designPlantUml[modelId]),
      )
    );
  });
}

function finalizeSnapshotWorkspaceState(state: WorkspaceState) {
  const repaired = repairMissingDesignInputFingerprints(state);
  repaired.generatedDesignDiagramTypes = completeGeneratedDesignDiagrams(
    repaired,
    stringArrayValue(repaired.generatedDesignDiagramTypes) as DesignDiagramKind[],
  );
  assertGeneratedDesignChainComplete(repaired);
  return repaired;
}

function mergeDesignTraceability(
  current: DesignRunSnapshot["designModelTraceability"],
  incoming: DesignRunSnapshot["designModelTraceability"],
  affected: readonly DesignDiagramKind[],
  deletedModelIds: readonly string[],
) {
  if (affected.length === 0 && deletedModelIds.length === 0) {
    return current;
  }
  return [
    ...current.filter(
      (entry) =>
        entry.source &&
        Array.isArray(entry.targets) &&
        !designTraceabilityTouchesDiagramKinds(entry, affected, deletedModelIds),
    ),
    ...incoming.filter((entry) =>
      designTraceabilityTouchesDiagramKinds(entry, affected),
    ),
  ];
}

function diagramKindFromErrorKey(key: string) {
  const [candidate] = key.split(":");
  return candidate &&
    [
      "usecase",
      "class",
      "activity",
      "deployment",
      "prototype",
      "analysis",
    ].includes(candidate)
    ? (candidate as DiagramKind)
    : null;
}

function mergeRequirementTraceability(
  current: RequirementModelTraceabilityEntry[],
  incoming: RequirementModelTraceabilityEntry[],
  affectedDiagrams: readonly DiagramKind[],
) {
  const affected = new Set<DiagramKind>(affectedDiagrams);
  return [
    ...current.filter(
      (entry) => !affected.has(entry.target.diagramKind as DiagramKind),
    ),
    ...incoming.filter((entry) =>
      affected.has(entry.target.diagramKind as DiagramKind),
    ),
  ];
}

function fingerprintMatches(
  storedFingerprint: string | null | undefined,
  currentFingerprint: string,
) {
  return normalizeSnapshotFingerprint(storedFingerprint) === currentFingerprint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function presentRecordValues(value: unknown) {
  return Object.values(recordValue(value)).filter(Boolean);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values));
}

function stringRecordValue(value: unknown) {
  return Object.fromEntries(
    Object.entries(recordValue(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readNestedString(value: unknown, path: readonly string[]) {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" ? current : "";
}
