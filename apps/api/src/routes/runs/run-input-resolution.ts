// Resolves project-scoped run start commands into full pipeline request inputs.
import { requirementRuleFacts } from "@uml-platform/contracts";
import { conflictingModelGenerationTarget, type ModelGenerationStage } from "@uml-platform/contracts";
import {
  requirementBaselineSchema,
  requirementRulesSchema,
  buildAcceptedRequirementSnapshot,
  buildFeasibilityImplementationFingerprint,
  buildFeasibilityContextFingerprint,
  readFeasibilityBusinessFlowArtifact,
  designInputFingerprint,
  designDependencies,
  snapshotInputFingerprint,
  designRecordBelongsToDiagramKinds,
  resolveModelArtifactIdentity,
  validateModelInput,
  type ModelingStage,
  designTraceabilityTouchesDiagramKinds,


  startDesignRunCommandSchema,
  startDesignRunRequestSchema,
  startDocumentRunCommandSchema,
  startDocumentRunRequestSchema,
  startRunCommandSchema,
  startRunRequestSchema,
  type DesignDiagramKind,
  type DiagramKind,


  type StartDesignRunCommand,
  type StartDesignRunRequest,
  type StartDocumentRunCommand,
  type StartDocumentRunRequest,
  type StartRunCommand,
  type StartRunRequest,
  apiErrorResponseSchema,
  type ApiErrorCategory,
  type ApiErrorResponse,
} from "@uml-platform/contracts";

type RunInputMetadata = {
  projectId?: string;
};

type ProjectWorkspaceForRun = {
  state?: unknown;
};

export type LoadProjectWorkspaceForRun = (
  projectId: string,
) => Promise<ProjectWorkspaceForRun | Record<string, unknown> | null | undefined>;

type InputResolution<T> =
  | { ok: true; input: T; workspaceState?: Record<string, unknown> }
  | { ok: false; statusCode: number; body: ApiErrorResponse };

type ProjectGenerationPreflightKind =
  | "requirements"
  | "design"
  | "requirementsSpec"
  | "softwareDesignSpec"
  | "feasibilityStudy";

function runInputResolutionError(
  statusCode: number,
  code: string,
  options: {
    category?: ApiErrorCategory;
    details?: Record<string, unknown>;
    params?: Record<string, string | number | boolean | null>;
    retryable?: boolean;
  } = {},
): InputResolution<never> {
  return {
    ok: false,
    statusCode,
    body: apiErrorResponseSchema.parse({
      error: {
        code,
        category: options.category ?? (statusCode >= 500 ? "internal" : "conflict"),
        retryable: options.retryable ?? statusCode >= 500,
        params: options.params,
        details: options.details,
      },
    }),
  };
}

function rejectInvalidModelStructures(models: unknown[], stage: ModelingStage): InputResolution<never> | null {
  const diagnostics = models.flatMap((model) => validateModelInput(model, stage)).filter((issue) => issue.severity === "error");
  return diagnostics.length ? runInputResolutionError(409, "MODEL_STRUCTURE_INVALID", { details: { diagnostics }, params: { count: diagnostics.length } }) : null;
}

function rejectConflictingModelBatch(stage: ModelGenerationStage, diagrams: readonly string[]): InputResolution<never> | null {
  for (const target of diagrams) {
    const conflict = conflictingModelGenerationTarget(stage, target, diagrams);
    if (conflict) return runInputResolutionError(409, "MODEL_GENERATION_BATCH_CONFLICT", { details: { stage, targets: [target, conflict] } });
  }
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

// Same contract as buildAcceptedRequirementSnapshot: every rule counts as generated.
function acceptedFeasibilityRules(state: Record<string, unknown>) {
  return arrayValue(state.rules);
}

// Routes consume saved current facts; invalid storage must never become a newly
// accepted baseline merely because a generation command was submitted.
function currentRequirementSource(state: Record<string, unknown>) {
  const rules = requirementRulesSchema.safeParse(state.rules ?? []);
  const baseline = requirementBaselineSchema.nullable().safeParse(state.requirementBaseline ?? null);
  if (!rules.success || !baseline.success) return runInputResolutionError(409, "REQUIREMENT_BASELINE_BLOCKED");
  if (baseline.data && snapshotInputFingerprint(baseline.data.rules.map(requirementRuleFacts)) !== snapshotInputFingerprint(rules.data)) {
    return runInputResolutionError(409, "REQUIREMENT_BASELINE_BLOCKED");
  }
  return { ok: true as const, input: { rules: rules.data, baseline: baseline.data } };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringRecordValue(value: unknown) {
  return Object.fromEntries(
    Object.entries(recordValue(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function presentRecordValues(value: unknown) {
  return Object.values(recordValue(value)).filter(Boolean);
}

const DESIGN_DIAGRAM_ORDER: DesignDiagramKind[] = [
  "architecture",
  "sequence",
  "class",
  "navigation",
  "table",
  "component",
  "deployment",
];

const DESIGN_MODEL_DEPENDENCY_MAP: Record<
  DesignDiagramKind,
  DesignDiagramKind[]
> = {
  architecture: [],
  sequence: [],
  navigation: [],
  class: [],
  component: ["class"],
  deployment: ["component"],
  table: ["class"],
};

const DESIGN_REQUIREMENT_SOURCE_MAP: Record<DesignDiagramKind, DiagramKind[]> = {
  architecture: ["function"],
  sequence: ["usecase", "analysis"],
  navigation: ["prototype"],
  class: ["class", "usecase"],
  component: [],
  deployment: ["deployment"],
  table: [],
};

const REQUIREMENT_DIAGRAM_ORDER: DiagramKind[] = [
  "function",
  "activity",
  "usecase",
  "class",
  "prototype",
  "deployment",
  "analysis",
];

function isDesignDiagramKind(value: unknown): value is DesignDiagramKind {
  return DESIGN_DIAGRAM_ORDER.includes(value as DesignDiagramKind);
}

function isRequirementDiagramKind(value: unknown): value is DiagramKind {
  return REQUIREMENT_DIAGRAM_ORDER.includes(value as DiagramKind);
}

function orderedDesignDiagrams(diagrams: DesignDiagramKind[]) {
  const selected = new Set(diagrams);
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => selected.has(diagram));
}

function orderedRequirementDiagrams(diagrams: DiagramKind[]) {
  const selected = new Set(diagrams);
  return REQUIREMENT_DIAGRAM_ORDER.filter((diagram) => selected.has(diagram));
}

function designDiagramKindFromWorkspaceRecord(value: unknown) {
  const diagramKind = recordValue(value).diagramKind;
  return isDesignDiagramKind(diagramKind) ? diagramKind : null;
}

function requirementDiagramKindFromWorkspaceRecord(value: unknown) {
  const diagramKind = recordValue(value).diagramKind;
  return isRequirementDiagramKind(diagramKind) ? diagramKind : null;
}

function resolveRequirementCommandTargets(input: {
  selectedDiagrams: DiagramKind[];
  requestedDiagrams?: DiagramKind[];
  dependencyDiagrams?: DiagramKind[];
}) {
  const requestedDiagrams = orderedRequirementDiagrams(
    input.requestedDiagrams ?? input.selectedDiagrams,
  );
  const dependencyDiagrams = new Set(input.dependencyDiagrams ?? []);

  return {
    selectedDiagrams: orderedRequirementDiagrams([
      ...input.selectedDiagrams,
      ...dependencyDiagrams,
    ]),
    requestedDiagrams,
    dependencyDiagrams: orderedRequirementDiagrams([...dependencyDiagrams]),
  };
}

function resolveDesignCommandTargets(input: {
  selectedDiagrams: DesignDiagramKind[];
  requestedDiagrams?: DesignDiagramKind[];
  existingDesignModels: unknown[];
}) {
  const requestedDiagrams = orderedDesignDiagrams(
    input.requestedDiagrams ?? input.selectedDiagrams,
  );
  const requestedSet = new Set(input.selectedDiagrams);
  const existing = new Set(
    input.existingDesignModels.flatMap((model) => {
      const diagramKind = designDiagramKindFromWorkspaceRecord(model);
      return diagramKind ? [diagramKind] : [];
    }),
  );
  const dependencyDiagrams = new Set<DesignDiagramKind>();

  const includeDependenciesFor = (diagram: DesignDiagramKind) => {
    for (const dependency of DESIGN_MODEL_DEPENDENCY_MAP[diagram]) {
      if (existing.has(dependency) && !requestedSet.has(dependency)) {
        continue;
      }
      if (!existing.has(dependency) && !requestedSet.has(dependency)) {
        dependencyDiagrams.add(dependency);
      }
      includeDependenciesFor(dependency);
    }
  };

  for (const diagram of input.selectedDiagrams) {
    includeDependenciesFor(diagram);
  }

  return {
    selectedDiagrams: orderedDesignDiagrams([
      ...input.selectedDiagrams,
      ...dependencyDiagrams,
    ]),
    requestedDiagrams,
  };
}

function normalizedFingerprintMatches(
  storedFingerprint: unknown,
  activeFingerprint: string,
) {
  return storedFingerprint === activeFingerprint;
}

function requirementModelIsStale(input: {
  diagram: DiagramKind;
  activeRequirementFingerprint: string;
  state: Record<string, unknown>;
}) {
  const diagramInputFingerprints = recordValue(input.state.diagramInputFingerprints);
  const diagramFingerprint = diagramInputFingerprints[input.diagram];
  if (typeof diagramFingerprint === "string" && diagramFingerprint.trim()) {
    return !normalizedFingerprintMatches(
      diagramFingerprint,
      input.activeRequirementFingerprint,
    );
  }

  // Every consumed source needs an explicit receipt from the current workflow.
  return true;
}

function activeRequirementFingerprintForState(state: Record<string, unknown>) {
  return snapshotInputFingerprint({
    requirementText: stringValue(state.requirementText),
    rules: arrayValue(state.rules),
  });
}

function requirementModelEntriesFromState(state: Record<string, unknown>) {
  return Object.entries(recordValue(state.models)).filter(([, model]) =>
    Boolean(requirementDiagramKindFromWorkspaceRecord(model)),
  );
}

function requirementModelDiagramsFromState(state: Record<string, unknown>) {
  return orderedRequirementDiagrams(
    requirementModelEntriesFromState(state)
      .map(([, model]) => requirementDiagramKindFromWorkspaceRecord(model))
      .filter((diagram): diagram is DiagramKind => Boolean(diagram)),
  );
}

function requiredExistingRequirementSourcesForDesign(input: {
  designDiagrams: DesignDiagramKind[];
  requirementModels: unknown[];
}) {
  const existingRequirementDiagrams = new Set(
    input.requirementModels.flatMap((model) => {
      const diagramKind = requirementDiagramKindFromWorkspaceRecord(model);
      return diagramKind ? [diagramKind] : [];
    }),
  );
  return orderedRequirementDiagrams(
    input.designDiagrams.flatMap((diagram) =>
      DESIGN_REQUIREMENT_SOURCE_MAP[diagram].filter((source) =>
        existingRequirementDiagrams.has(source),
      ),
    ),
  );
}

function staleRequirementModelDiagrams(input: {
  diagrams: DiagramKind[];
  state: Record<string, unknown>;
}) {
  const activeRequirementFingerprint = activeRequirementFingerprintForState(
    input.state,
  );
  return input.diagrams.filter((diagram) =>
    requirementModelIsStale({
      diagram,
      activeRequirementFingerprint,
      state: input.state,
    }),
  );
}

function rejectStaleRequirementModelsForDesignCommand(input: {
  designDiagrams: DesignDiagramKind[];
  requirementModels: unknown[];
  state: Record<string, unknown>;
}): InputResolution<never> | null {
  const staleSources = staleRequirementModelDiagrams({
    diagrams: requiredExistingRequirementSourcesForDesign({
      designDiagrams: input.designDiagrams,
      requirementModels: input.requirementModels,
    }),
    state: input.state,
  });
  if (staleSources.length === 0) return null;
  return runInputResolutionError(
    409,
    "REQUIREMENT_MODELS_STALE",
    {
      params: { count: staleSources.length },
      details: { diagramKinds: staleSources },
    },
  );
}

function modelKeyForWorkspaceRecord(entry: [string, unknown]) {
  const [key, model] = entry;
  return readNestedText(model, "modelId") || key;
}

function modelKeysForWorkspaceRecord(entry: [string, unknown]) {
  const [key, model] = entry;
  const modelId = readNestedText(model, "modelId");
  return modelId && modelId !== key ? [key, modelId] : [key];
}

function recordHasAnyKey(
  record: Record<string, string>,
  keys: string[],
) {
  return keys.some((key) => Boolean(record[key]));
}

function recordValueForAnyKey(
  record: Record<string, string>,
  keys: string[],
) {
  for (const key of keys) {
    const value = record[key];
    if (value) return value;
  }
  return "";
}

function generatedDesignModelEntries(input: {
  state: Record<string, unknown>;
  includeAllWhenUngenerated: boolean;
}) {
  const allDesignModelEntries = Object.entries(
    recordValue(input.state.designModels),
  );
  const generatedDesignDiagrams = arrayValue(
    input.state.generatedDesignDiagramTypes,
  ).filter(isDesignDiagramKind);
  const generated = new Set(generatedDesignDiagrams);
  return allDesignModelEntries.filter(([, model]) => {
    const diagramKind = designDiagramKindFromWorkspaceRecord(model);
    return (
      (input.includeAllWhenUngenerated && generated.size === 0) ||
      Boolean(diagramKind && generated.has(diagramKind))
    );
  });
}

function designChainIssues(input: {
  state: Record<string, unknown>;
  includeAllWhenUngenerated: boolean;
  requireTraceability: boolean;
}) {
  const designModelEntries = generatedDesignModelEntries(input);
  const activeDesignFingerprint = designInputFingerprint(
    presentRecordValues(input.state.models),
    arrayValue(input.state.requirementModelTraceability),
  );
  const designInputFingerprints = stringRecordValue(
    input.state.designInputFingerprints,
  );
  const designPlantUml = stringRecordValue(input.state.designPlantUml);
  const missingFingerprints = designModelEntries
    .filter((entry) =>
      !recordHasAnyKey(designInputFingerprints, modelKeysForWorkspaceRecord(entry)),
    )
    .map(modelKeyForWorkspaceRecord);
  const staleFingerprints = designModelEntries
    .filter((entry) => {
      const fingerprint = recordValueForAnyKey(
        designInputFingerprints,
        modelKeysForWorkspaceRecord(entry),
      );
      return typeof fingerprint === "string" && fingerprint !== activeDesignFingerprint;
    })
    .map(modelKeyForWorkspaceRecord);
  const missingPlantUml = designModelEntries
    .filter((entry) =>
      !recordHasAnyKey(designPlantUml, modelKeysForWorkspaceRecord(entry)),
    )
    .map(modelKeyForWorkspaceRecord);
  const missingTraceability =
    input.requireTraceability &&
    arrayValue(input.state.designModelTraceability).length === 0;
  return {
    missingFingerprints,
    staleFingerprints,
    missingPlantUml,
    missingTraceability,
    checkedModelCount: designModelEntries.length,
  };
}

function rejectIncompleteDesignChain(input: {
  state: Record<string, unknown>;
  includeAllWhenUngenerated: boolean;
  requireTraceability: boolean;
}): InputResolution<never> | null {
  const issues = designChainIssues(input);
  if (issues.checkedModelCount === 0) return null;
  if (
    issues.missingFingerprints.length === 0 &&
    issues.staleFingerprints.length === 0 &&
    issues.missingPlantUml.length === 0 &&
    !issues.missingTraceability
  ) {
    return null;
  }

  return runInputResolutionError(
    409,
    "DESIGN_MODELS_INVALID",
    {
      params: {
        count:
          issues.missingFingerprints.length +
          issues.staleFingerprints.length +
          issues.missingPlantUml.length +
          (issues.missingTraceability ? 1 : 0),
      },
      details: {
        missingFingerprints: issues.missingFingerprints,
        staleFingerprints: issues.staleFingerprints,
        missingPlantUml: issues.missingPlantUml,
        missingTraceability: issues.missingTraceability,
      },
    },
  );
}

function rejectProjectGenerationPreflight(input: {
  kind: ProjectGenerationPreflightKind;
  state: Record<string, unknown>;
  designDiagrams?: DesignDiagramKind[];
}): InputResolution<never> | null {

  const requirementSourceMissing =
    stringValue(input.state.requirementText).trim().length === 0;
  if (requirementSourceMissing && input.kind !== "feasibilityStudy") {
    return runInputResolutionError(
      409,
      "REQUIREMENT_SOURCE_MISSING",
    );
  }

  if (input.kind === "requirements") return null;

  const structuralError = rejectInvalidModelStructures(
    presentRecordValues(input.state.models), "requirements",
  );
  if (structuralError && input.kind !== "feasibilityStudy") return structuralError;

  if (input.kind === "feasibilityStudy") {
    const contextModel = recordValue(input.state.feasibilityContextModel);
    const contextPlantUml = stringValue(input.state.feasibilityContextPlantUml);
    const contextSvg = stringValue(input.state.feasibilityContextSvg);
    const implementationPlan = recordValue(input.state.feasibilityImplementationPlan);
    if (
      Object.keys(contextModel).length === 0 ||
      !contextPlantUml ||
      !contextSvg ||
      Object.keys(implementationPlan).length === 0
    ) {
      return runInputResolutionError(
        409,
        "FEASIBILITY_CONTEXT_MISSING",
      );
    }
    const invalidContext = rejectInvalidModelStructures([contextModel], "feasibility");
    if (invalidContext) return invalidContext;
    const requirementFingerprint = buildAcceptedRequirementSnapshot(
      input.state.rules ?? [], input.state.requirementBaseline ?? null,
    ).snapshot.fingerprint;
    const contextFingerprint = buildFeasibilityContextFingerprint({
      rules: input.state.rules ?? [], requirementBaseline: input.state.requirementBaseline ?? null,
      inputs: input.state.feasibilityInputs ?? {},
    });
    if (
      stringValue(input.state.feasibilityContextFingerprint) !==
      contextFingerprint
    ) {
      return runInputResolutionError(409, "FEASIBILITY_CONTEXT_STALE");
    }
    const businessFlow = readFeasibilityBusinessFlowArtifact(input.state.feasibilityBusinessFlow);
    if (!businessFlow) return runInputResolutionError(409, "FEASIBILITY_BUSINESS_FLOW_MISSING");
    const invalidFlow = rejectInvalidModelStructures([businessFlow.model], "feasibility");
    if (invalidFlow) return invalidFlow;
    if (businessFlow.fingerprint !== requirementFingerprint) return runInputResolutionError(409, "FEASIBILITY_BUSINESS_FLOW_STALE");
    const implementationFingerprint = buildFeasibilityImplementationFingerprint({
      rules: acceptedFeasibilityRules(input.state),
      requirementBaseline: input.state.requirementBaseline ?? null,
      contextModel,
      businessFlow,
      inputs: recordValue(input.state.feasibilityInputs),
    });
    if (
      stringValue(input.state.feasibilityImplementationFingerprint) !==
      implementationFingerprint
    ) {
      return runInputResolutionError(409, "FEASIBILITY_IMPLEMENTATION_STALE");
    }
    return null;
  }

  const requirementModelEntries = requirementModelEntriesFromState(input.state);
  if (requirementModelEntries.length === 0) {
    return runInputResolutionError(
      409,
      "REQUIREMENT_MODELS_MISSING",
    );
  }

  if (input.kind === "design") {
    const staleRequirements = rejectStaleRequirementModelsForDesignCommand({
      designDiagrams: input.designDiagrams ?? [],
      requirementModels: requirementModelEntries.map(([, model]) => model),
      state: input.state,
    });
    if (staleRequirements) return staleRequirements;
    const existing = Object.entries(recordValue(input.state.designModels));
    const plan = resolveDesignCommandTargets({ selectedDiagrams: input.designDiagrams ?? [], existingDesignModels: existing.map(([, model]) => model) });
    const generated = new Set<string>(plan.selectedDiagrams);
    const consumed = new Set<string>();
    const visit = (kind: string) => {
      for (const dependency of designDependencies[kind] ?? []) {
        if (consumed.has(dependency)) continue;
        consumed.add(dependency); visit(dependency);
      }
    };
    plan.selectedDiagrams.forEach(visit);
    const active = designInputFingerprint(presentRecordValues(input.state.models), arrayValue(input.state.requirementModelTraceability));
    const stored = stringRecordValue(input.state.designInputFingerprints);
    const stale = existing.filter(entry => {
      const kind = designDiagramKindFromWorkspaceRecord(entry[1]);
      return kind && consumed.has(kind) && !generated.has(kind) && recordValueForAnyKey(stored, modelKeysForWorkspaceRecord(entry)) !== active;
    }).map(modelKeyForWorkspaceRecord);
    if (stale.length) return runInputResolutionError(409, "DESIGN_MODELS_STALE", { details: { modelIds: stale } });
  } else {
    const staleDiagrams = staleRequirementModelDiagrams({
      diagrams: requirementModelDiagramsFromState(input.state),
      state: input.state,
    });
    if (staleDiagrams.length > 0) {
      return runInputResolutionError(
        409,
        "REQUIREMENT_MODELS_STALE",
        {
          params: { count: staleDiagrams.length },
          details: { diagramKinds: staleDiagrams },
        },
      );
    }
  }

  if (
    (input.kind === "design" ||
      input.kind === "requirementsSpec" ||
      input.kind === "softwareDesignSpec") &&
    arrayValue(input.state.requirementModelTraceability).length === 0
  ) {
    return runInputResolutionError(
      409,
      "REQUIREMENT_TRACEABILITY_MISSING",
    );
  }

  if (
    input.kind === "requirementsSpec" ||
    input.kind === "softwareDesignSpec"
  ) {
    const requirementPlantUml = stringRecordValue(input.state.plantUml);
    const missingPlantUml = requirementModelEntries
      .map(modelKeyForWorkspaceRecord)
      .filter((modelId) => !requirementPlantUml[modelId]);
    if (missingPlantUml.length > 0) {
      return runInputResolutionError(
        409,
        "REQUIREMENT_PLANTUML_MISSING",
        {
          params: { count: missingPlantUml.length },
          details: { modelIds: missingPlantUml },
        },
      );
    }
  }

  if (input.kind === "softwareDesignSpec") {
    const designModelEntries = Object.entries(recordValue(input.state.designModels));
    if (designModelEntries.length === 0) {
      return runInputResolutionError(
        409,
        "DESIGN_MODELS_MISSING",
      );
    }
    const invalidDesign = rejectInvalidModelStructures(designModelEntries.map(([, model]) => model), "design");
    if (invalidDesign) return invalidDesign;

    const designDiagramErrorKeys = Object.keys(recordValue(input.state.designDiagramErrors));
    if (designDiagramErrorKeys.length > 0) {
      return runInputResolutionError(
        409,
        "DESIGN_MODELS_INVALID",
        {
          params: { count: designDiagramErrorKeys.length },
          details: { diagramKinds: designDiagramErrorKeys },
        },
      );
    }
  }


  if (input.kind === "softwareDesignSpec") {
    return rejectIncompleteDesignChain({
      state: input.state,
      includeAllWhenUngenerated: true,
      requireTraceability: true,
    });
  }

  return null;
}

function compactRunInputText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function readNestedText(value: unknown, key: string) {
  return compactRunInputText(recordValue(value)[key]);
}

function requirementPlantUmlArtifactsFromWorkspace(state: Record<string, unknown>) {
  return Object.entries(stringRecordValue(state.plantUml)).map(
    ([artifactId, source]) => ({
      ...resolveModelArtifactIdentity(artifactId, recordValue(state.models), recordValue(state.svgArtifacts)),
      source,
    }),
  );
}

function designPlantUmlArtifactsFromWorkspace(state: Record<string, unknown>) {
  const designModels = recordValue(state.designModels);
  const designSvgArtifacts = recordValue(state.designSvgArtifacts);
  return Object.entries(stringRecordValue(state.designPlantUml)).map(
    ([artifactId, source]) => ({
      ...resolveModelArtifactIdentity(artifactId, designModels, designSvgArtifacts),
      source,
    }),
  );
}


async function loadWorkspaceStateForCommand({
  commandProjectId,
  metadata,
  loadProjectWorkspace,
}: {
  commandProjectId?: string;
  metadata: RunInputMetadata | undefined;
  loadProjectWorkspace?: LoadProjectWorkspaceForRun;
}): Promise<InputResolution<{ projectId: string; state: Record<string, unknown> }>> {
  const projectId = commandProjectId ?? metadata?.projectId;
  if (!projectId) {
    return runInputResolutionError(
      400,
      "PROJECT_ID_REQUIRED",
      { category: "validation" },
    );
  }
  if (!loadProjectWorkspace) {
    return runInputResolutionError(
      500,
      "GENERATION_WORKSPACE_UNAVAILABLE",
      { category: "internal", retryable: true },
    );
  }
  const workspace = await loadProjectWorkspace(projectId);
  if (!workspace) {
    return runInputResolutionError(404, "PROJECT_WORKSPACE_NOT_FOUND", {
      category: "not_found",
    });
  }
  const state = isPlainRecord(workspace.state) ? workspace.state : workspace;
  if (!isPlainRecord(state)) {
    return runInputResolutionError(400, "PROJECT_WORKSPACE_INVALID", {
      category: "validation",
    });
  }
  return { ok: true, input: { projectId, state } };
}

export async function resolveRequirementRunInput(
  body: unknown,
  metadata: RunInputMetadata | undefined,
  loadProjectWorkspace?: LoadProjectWorkspaceForRun,
): Promise<InputResolution<StartRunRequest>> {
  const command: StartRunCommand = startRunCommandSchema.parse(body);
  const batchError = rejectConflictingModelBatch("requirements", [...command.selectedDiagrams, ...command.requestedDiagrams ?? [], ...command.dependencyDiagrams ?? []]);
  if (batchError) return batchError;
  const rulesOnly = command.selectedDiagrams.length === 0;
  const workspace = await loadWorkspaceStateForCommand({
    commandProjectId: command.projectId,
    metadata,
    loadProjectWorkspace,
  });
  if (!workspace.ok) return workspace;
  const requirementText = rulesOnly && command.requirementText !== undefined
    ? command.requirementText
    : stringValue(workspace.input.state.requirementText);
  const preflight = rulesOnly && command.attachments?.length ? null : rejectProjectGenerationPreflight({
    kind: "requirements",
    // A rules-only run commits the submitted draft after success. The saved
    // workspace can be empty before that first extraction.
    state: { ...workspace.input.state, requirementText },
  });
  if (preflight) return preflight;
  const contextModels = presentRecordValues(workspace.input.state.models);
  const requirementSource = currentRequirementSource(workspace.input.state);
  if (!requirementSource.ok) return requirementSource;
  const requirementTargets = resolveRequirementCommandTargets({
    selectedDiagrams: command.selectedDiagrams,
    requestedDiagrams: command.requestedDiagrams,
    dependencyDiagrams: command.dependencyDiagrams,
  });
  // Public commands consume saved upstreams; selecting usecase in this batch cannot fill a missing source.
  if (requirementTargets.selectedDiagrams.includes("analysis") &&
    !contextModels.some(model => requirementDiagramKindFromWorkspaceRecord(model) === "usecase")) {
    return runInputResolutionError(409, "REQUIREMENT_MODELS_MISSING", { details: { missingDiagrams: ["usecase"] } });
  }
  if (requirementTargets.selectedDiagrams.includes("analysis") && !requirementTargets.selectedDiagrams.includes("usecase")) {
    const invalid = rejectInvalidModelStructures(contextModels.filter((model) => requirementDiagramKindFromWorkspaceRecord(model) === "usecase"), "requirements");
    if (invalid) return invalid;
  }
  return {
    ok: true,
    workspaceState: structuredClone(workspace.input.state),
    input: startRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      requirementText,
      attachments: rulesOnly ? command.attachments : undefined,
      reasoning: command.reasoning,
      selectedDiagrams: requirementTargets.selectedDiagrams,
      requestedDiagrams: requirementTargets.requestedDiagrams,
      dependencyDiagrams: requirementTargets.dependencyDiagrams,
      // A rules-only run must not carry old rules into failed snapshots.
      rules: rulesOnly ? [] : requirementSource.input.rules,
      requirementBaseline: requirementSource.input.baseline,
      contextModels,
      contextRequirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
      analysisTargetUseCaseIds: command.analysisTargetUseCaseIds,
      providerSettings: command.providerSettings,
    }),
  };
}

export async function resolveDesignRunInput(
  body: unknown,
  metadata: RunInputMetadata | undefined,
  loadProjectWorkspace?: LoadProjectWorkspaceForRun,
): Promise<InputResolution<StartDesignRunRequest>> {
  const command: StartDesignRunCommand = startDesignRunCommandSchema.parse(body);
  const batchError = rejectConflictingModelBatch("design", [...command.selectedDiagrams, ...command.requestedDiagrams ?? []]);
  if (batchError) return batchError;
  const workspace = await loadWorkspaceStateForCommand({
    commandProjectId: command.projectId,
    metadata,
    loadProjectWorkspace,
  });
  if (!workspace.ok) return workspace;
  const existingDesignModels = presentRecordValues(
    workspace.input.state.designModels,
  );
  const requirementModels = presentRecordValues(workspace.input.state.models);
  const designTargets = resolveDesignCommandTargets({
    selectedDiagrams: command.selectedDiagrams,
    requestedDiagrams: command.requestedDiagrams,
    existingDesignModels,
  });
  const preflight = rejectProjectGenerationPreflight({
    kind: "design",
    state: workspace.input.state,
    designDiagrams: designTargets.requestedDiagrams,
  });
  if (preflight) return preflight;
  const requirementSource = currentRequirementSource(workspace.input.state);
  if (!requirementSource.ok) return requirementSource;
  if (!requirementSource.input.baseline) return runInputResolutionError(409, "REQUIREMENT_BASELINE_BLOCKED");
  const input = filterReplacingDesignContext(startDesignRunRequestSchema.parse({
    projectId: workspace.input.projectId,
    requirementBaseline: requirementSource.input.baseline,
    requirementModels,
    requirementModelTraceability: arrayValue(workspace.input.state.requirementModelTraceability),
    selectedDiagrams: designTargets.selectedDiagrams,
    requestedDiagrams: designTargets.requestedDiagrams,
    existingDesignModels,
    existingDesignModelTraceability: arrayValue(workspace.input.state.designModelTraceability),
    existingDesignPlantUml: designPlantUmlArtifactsFromWorkspace(workspace.input.state),
    existingDesignSvgArtifacts: presentRecordValues(workspace.input.state.designSvgArtifacts),
    reasoning: command.reasoning,
    providerSettings: command.providerSettings,
  }));
  const invalidDesign = rejectInvalidModelStructures(input.existingDesignModels, "design");
  if (invalidDesign) return invalidDesign;
  return {
    ok: true,
    input,
    workspaceState: structuredClone(workspace.input.state),
  };
}

function filterReplacingDesignContext(
  input: StartDesignRunRequest,
): StartDesignRunRequest {
  const replacingDiagrams = Array.from(
    new Set([
      ...input.selectedDiagrams,
      ...(input.requestedDiagrams ?? []),
    ]),
  ) as DesignDiagramKind[];
  if (replacingDiagrams.length === 0) return input;
  return {
    ...input,
    existingDesignModels: input.existingDesignModels.filter(
      (model) =>
        !designRecordBelongsToDiagramKinds(
          model.modelId ?? model.diagramKind,
          model,
          replacingDiagrams,
        ),
    ),
    existingDesignModelTraceability:
      input.existingDesignModelTraceability.filter(
        (entry) =>
          !designTraceabilityTouchesDiagramKinds(entry, replacingDiagrams),
      ),
    existingDesignPlantUml: input.existingDesignPlantUml.filter(
      (artifact) =>
        !designRecordBelongsToDiagramKinds(
          artifact.modelId ?? artifact.diagramKind,
          artifact,
          replacingDiagrams,
        ),
    ),
    existingDesignSvgArtifacts: input.existingDesignSvgArtifacts.filter(
      (artifact) =>
        !designRecordBelongsToDiagramKinds(
          artifact.modelId ?? artifact.diagramKind,
          artifact,
          replacingDiagrams,
        ),
    ),
  };
}


export async function resolveDocumentRunInput(
  body: unknown,
  metadata: RunInputMetadata | undefined,
  loadProjectWorkspace?: LoadProjectWorkspaceForRun,
): Promise<InputResolution<StartDocumentRunRequest>> {
  const command: StartDocumentRunCommand = startDocumentRunCommandSchema.parse(body);
  const workspace = await loadWorkspaceStateForCommand({
    commandProjectId: command.projectId,
    metadata,
    loadProjectWorkspace,
  });
  if (!workspace.ok) return workspace;
  const requirementSource = currentRequirementSource(workspace.input.state);
  if (!requirementSource.ok) return requirementSource;
  const preflight = rejectProjectGenerationPreflight({
    kind: command.documentKind,
    state: workspace.input.state,
  });
  if (preflight) return preflight;
  return {
    ok: true,
    workspaceState: structuredClone(workspace.input.state),
    input: startDocumentRunRequestSchema.parse({
      projectId: workspace.input.projectId,
      documentKind: command.documentKind,
      requirementText:
        stringValue(workspace.input.state.requirementText) ||
        (command.documentKind === "feasibilityStudy" ? "未提供/待确认" : ""),
      requirementBaseline: requirementSource.input.baseline,
      rules: command.documentKind === "feasibilityStudy"
        ? acceptedFeasibilityRules(workspace.input.state)
        : arrayValue(workspace.input.state.rules),
      requirementModels: [
        ...presentRecordValues(workspace.input.state.models).filter(model => command.documentKind !== "feasibilityStudy" || recordValue(model).diagramKind !== "context"),
        ...(command.documentKind === "feasibilityStudy"
          ? [workspace.input.state.feasibilityContextModel]
          : []),
      ],
      requirementModelTraceability: arrayValue(
        workspace.input.state.requirementModelTraceability,
      ),
      requirementPlantUml: [
        ...requirementPlantUmlArtifactsFromWorkspace(workspace.input.state).filter(artifact => command.documentKind !== "feasibilityStudy" || artifact.diagramKind !== "context"),
        ...(command.documentKind === "feasibilityStudy"
          ? [{
              diagramKind: "context",
              modelId: stringValue(recordValue(workspace.input.state.feasibilityContextModel).modelId) || "context",
              source: stringValue(workspace.input.state.feasibilityContextPlantUml),
            }]
          : []),
      ],
      requirementSvgArtifacts: [
        ...presentRecordValues(workspace.input.state.svgArtifacts).filter(artifact => command.documentKind !== "feasibilityStudy" || recordValue(artifact).diagramKind !== "context"),
        ...(command.documentKind === "feasibilityStudy"
          ? [{
              diagramKind: "context",
              modelId: stringValue(recordValue(workspace.input.state.feasibilityContextModel).modelId) || "context",
              svg: stringValue(workspace.input.state.feasibilityContextSvg),
              renderMeta: {
                engine: "plantuml",
                generatedAt: new Date().toISOString(),
                sourceLength: stringValue(workspace.input.state.feasibilityContextPlantUml).length,
                durationMs: 0,
              },
            }]
          : []),
      ],
      designModels: presentRecordValues(workspace.input.state.designModels),
      designModelTraceability: arrayValue(
        workspace.input.state.designModelTraceability,
      ),
      designPlantUml: designPlantUmlArtifactsFromWorkspace(workspace.input.state),
      designSvgArtifacts: presentRecordValues(
        workspace.input.state.designSvgArtifacts,
      ),
      feasibilityImplementationPlan:
        workspace.input.state.feasibilityImplementationPlan ?? null,
      feasibilityInputs: workspace.input.state.feasibilityInputs ?? {},
      providerSettings: command.providerSettings,
      useAiText: command.useAiText,
      reasoning: command.reasoning,
      documentStyle: command.documentStyle,
    }),
  };
}
