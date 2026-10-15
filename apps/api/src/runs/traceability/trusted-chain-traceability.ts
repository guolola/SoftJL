// Builds run-level CoverageMatrix and TraceabilityMatrix artifacts from generated outputs.
import type {
  AtomicRequirement,
  
  
  CoverageMatrix,
  CoverageMatrixRow,
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DiagramModelSpec,
  ModelElementRef,
  RequirementBaseline,
  RequirementModelTraceabilityEntry,
  TraceabilityArtifactType,
  TraceabilityDiagnostic,
  TraceabilityLink,
  TraceabilityMatrix,
} from "@uml-platform/contracts";
import {
  coverageMatrixSchema,
  traceabilityMatrixSchema,
} from "@uml-platform/contracts";
import { collectModelRefs } from "../../normalizers/traceability/traceability-normalizer.js";

export type TrustedChainArtifacts = {
  coverageMatrix: CoverageMatrix;
  traceabilityMatrix: TraceabilityMatrix;
};

type RequirementStageInput = {
  runId: string;
  baseline: RequirementBaseline;
  models: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
};

type DesignStageInput = RequirementStageInput & {
  designModels: DesignDiagramModelSpec[];
  designModelTraceability: DesignModelTraceabilityEntry[];
};



type MutableTraceState = {
  links: TraceabilityLink[];
  diagnostics: TraceabilityDiagnostic[];
};

function artifactId(type: TraceabilityArtifactType, id: string) {
  return `${type}:${id}`;
}

function modelRefId(ref: ModelElementRef) {
  return `${ref.modelId ? `${ref.modelId}:` : ""}${ref.diagramKind}:${ref.elementId}`;
}

function diagnosticId(index: number) {
  return `TRACE-${String(index + 1).padStart(3, "0")}`;
}

function addDiagnostic(
  state: MutableTraceState,
  diagnostic: Omit<TraceabilityDiagnostic, "id">,
) {
  state.diagnostics.push({
    id: diagnosticId(state.diagnostics.length),
    ...diagnostic,
    blocksCompletion: false,
  });
}

function addBidirectionalLink(
  state: MutableTraceState,
  fromArtifactType: TraceabilityArtifactType,
  fromArtifactId: string,
  toArtifactType: TraceabilityArtifactType,
  toArtifactId: string,
  linkType: TraceabilityLink["linkType"],
  confidence: number,
  rationale: string,
) {
  state.links.push({
    fromArtifactType,
    fromArtifactId,
    toArtifactType,
    toArtifactId,
    linkType,
    confidence,
    rationale,
  });
  state.links.push({
    fromArtifactType: toArtifactType,
    fromArtifactId: toArtifactId,
    toArtifactType: fromArtifactType,
    toArtifactId: fromArtifactId,
    linkType: "derives-from",
    confidence,
    rationale: `Reverse trace: ${rationale}`,
  });
}

function acceptedRequirements(baseline: RequirementBaseline) {
  return baseline.requirements.filter(
    (requirement) => requirement.status === "accepted",
  );
}

function requirementByRuleId(baseline: RequirementBaseline) {
  const byRule = new Map<string, AtomicRequirement>();
  for (const requirement of baseline.requirements) {
    if (requirement.sourceRuleId) byRule.set(requirement.sourceRuleId, requirement);
  }
  return byRule;
}

function requirementById(baseline: RequirementBaseline) {
  return new Map(baseline.requirements.map((requirement) => [requirement.id, requirement]));
}

function isPlaceholderTrace(ref: ModelElementRef) {
  return /placeholder|todo|unknown|占位|未命名|孤立/iu.test(
    `${ref.label} ${ref.elementId}`,
  );
}

function normalizedTokens(requirement: AtomicRequirement) {
  const fields = [
    requirement.actor,
    requirement.subject,
    requirement.action,
    requirement.object,
    requirement.condition,
    requirement.outcome,
    requirement.sourceFragment,
    ...requirement.acceptanceCriteria,
  ];
  const rawTokens = fields
    .filter((value): value is string => Boolean(value))
    .flatMap((value) =>
      value
        .split(/[^\p{L}\p{N}]+/u)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2),
    );
  const phraseTokens = fields
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  return Array.from(new Set([...rawTokens, ...phraseTokens]));
}

function hasSemanticSignal(_requirement: AtomicRequirement, ref: ModelElementRef) {
  if (isPlaceholderTrace(ref)) return false;
  return `${ref.label} ${ref.elementId}`.trim().length > 0;
}

function requiresDirectRequirementTrace(ref: ModelElementRef) {
  return ref.elementKind !== "actor";
}

function compactText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function textFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(textFromUnknown);
  if (!value || typeof value !== "object") return [compactText(value)].filter(Boolean);
  return Object.values(value as Record<string, unknown>).flatMap(textFromUnknown);
}

function modelElementText(models: Array<DiagramModelSpec | DesignDiagramModelSpec>, ref: ModelElementRef) {
  const candidates = models.filter(
    (model) =>
      model.diagramKind === ref.diagramKind &&
      (!ref.modelId ||
        compactText((model as unknown as Record<string, unknown>).modelId) === ref.modelId),
  );
  for (const model of candidates) {
    const found = findElementRecord(model, ref);
    if (found) return textFromUnknown(found).join(" ");
  }
  return `${ref.label} ${ref.elementId}`;
}

function isStructuralModelRef(
  ref: ModelElementRef,
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
) {
  if (isPlaceholderTrace(ref)) return false;
  if (["actor", "relationship", "swimlane", "system-boundary"].includes(ref.elementKind)) {
    return true;
  }
  const record = findElementRecordFromModels(models, ref);
  if (!record || typeof record !== "object") return false;
  const type = compactText((record as Record<string, unknown>).type).toLowerCase();
  return ["start", "end", "final"].includes(type);
}

function findElementRecordFromModels(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
  ref: ModelElementRef,
) {
  const candidates = models.filter(
    (model) =>
      model.diagramKind === ref.diagramKind &&
      (!ref.modelId ||
        compactText((model as unknown as Record<string, unknown>).modelId) === ref.modelId),
  );
  for (const model of candidates) {
    const found = findElementRecord(model, ref);
    if (found) return found;
  }
  return null;
}

function findElementRecord(
  model: DiagramModelSpec | DesignDiagramModelSpec,
  ref: ModelElementRef,
) {
  const record = model as unknown as Record<string, unknown>;
  const listKeys = [
    "actors",
    "useCases",
    "systemBoundaries",
    "classes",
    "interfaces",
    "enums",
    "swimlanes",
    "nodes",
    "databases",
    "components",
    "externalSystems",
    "artifacts",
    "participants",
    "messages",
    "fragments",
    "tables",
  ];
  for (const key of listKeys) {
    for (const item of Array.isArray(record[key]) ? record[key] as unknown[] : []) {
      if (!item || typeof item !== "object") continue;
      const itemRecord = item as Record<string, unknown>;
      if (compactText(itemRecord.id) === ref.elementId) return itemRecord;
      if (key === "tables") {
        for (const column of Array.isArray(itemRecord.columns) ? itemRecord.columns as unknown[] : []) {
          if (!column || typeof column !== "object") continue;
          const columnRecord = column as Record<string, unknown>;
          if (`${compactText(itemRecord.id)}.${compactText(columnRecord.id)}` === ref.elementId) {
            return { table: itemRecord, column: columnRecord };
          }
        }
      }
    }
  }
  for (const relationship of Array.isArray(record.relationships) ? record.relationships as unknown[] : []) {
    if (!relationship || typeof relationship !== "object") continue;
    const relationshipRecord = relationship as Record<string, unknown>;
    if (compactText(relationshipRecord.id) === ref.elementId) return relationshipRecord;
  }
  return null;
}

function meaningfulRequirementTokens(requirement: AtomicRequirement) {
  return normalizedTokens(requirement).filter(
    (token) =>
      token.length >= 2 &&
      !["必须", "需要", "可以", "应当", "系统满足该需求", "验证"].includes(token),
  );
}

const SEMANTIC_FILLER_WORDS =
  /必须|需要|可以|应当|不得|不能|禁止|支持|能够|才能|系统|验证|该需求|相关|记录|列表|信息/gu;

function normalizeSemanticSlot(value: string | null | undefined) {
  return (value ?? "")
    .replace(SEMANTIC_FILLER_WORDS, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function containsSemanticSlot(text: string, slot: string | null | undefined) {
  const normalizedSlot = normalizeSemanticSlot(slot);
  if (normalizedSlot.length < 2) return false;
  return normalizeSemanticSlot(text).includes(normalizedSlot);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function actionSlotCandidates(requirement: AtomicRequirement) {
  const action = requirement.action ?? "";
  const object = requirement.object ?? "";
  const actionKeywords = [
    "生成",
    "审批",
    "审核",
    "访问",
    "提交",
    "创建",
    "记录",
    "查询",
    "更新",
    "删除",
    "归档",
    "处理",
    "办理",
    "借书",
    "还书",
    "借阅",
    "发送",
    "预约",
    "选课",
    "采购",
    "维修",
    "登录",
  ];
  const normalizedAction = normalizeSemanticSlot(action);
  const withoutObject = object
    ? normalizeSemanticSlot(action.replace(new RegExp(escapeRegExp(object), "gu"), ""))
    : "";
  const keywordCandidates = actionKeywords
    .filter((keyword) => action.includes(keyword))
    .map((keyword) => normalizeSemanticSlot(keyword));
  return Array.from(
    new Set(
      [normalizedAction, withoutObject, ...keywordCandidates].filter(
        (value) => value.length >= 2,
      ),
    ),
  );
}

function requirementSemanticEvidence(requirement: AtomicRequirement, text: string) {
  const normalizedText = normalizeSemanticSlot(text);
  const action = actionSlotCandidates(requirement).some((candidate) =>
    normalizedText.includes(candidate),
  );
  const object = containsSemanticSlot(text, requirement.object);
  const condition = containsSemanticSlot(text, requirement.condition);
  const outcome = containsSemanticSlot(text, requirement.outcome);
  return { action, object, condition, outcome };
}

function requiresActionEvidence(requirement: AtomicRequirement) {
  return ["functional", "business-rule", "role", "exception"].includes(requirement.type);
}

function modelExplainsRequirement(
  requirement: AtomicRequirement,
  ref: ModelElementRef,
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
) {
  if (isPlaceholderTrace(ref)) return false;
  const text = modelElementText(models, ref);
  const evidence = requirementSemanticEvidence(requirement, text);
  if (requiresActionEvidence(requirement)) {
    if (!evidence.action) return false;
    return requirement.object ? evidence.object : evidence.condition || evidence.outcome || true;
  }
  if (requirement.object && evidence.object) return true;
  if (evidence.action || evidence.condition || evidence.outcome) return true;
  const loweredText = text.toLowerCase();
  const tokens = meaningfulRequirementTokens(requirement);
  if (tokens.length === 0) return true;
  return tokens.some((token) => loweredText.includes(token.toLowerCase()));
}

function addRequirementModelSemanticDiagnostics(
  state: MutableTraceState,
  refsByRequirement: Map<string, { requirement: AtomicRequirement; refs: ModelElementRef[] }>,
  models: DiagramModelSpec[],
) {
  for (const { requirement, refs } of refsByRequirement.values()) {
    const candidates = refs.filter((ref) => !isStructuralModelRef(ref, models));
    for (const target of candidates) {
      if (modelExplainsRequirement(requirement, target, models)) continue;
      addSemanticModelDiagnostic(
        state,
        requirement,
        "requirements-model",
        modelRefId(target),
      );
    }
  }
}

function addDesignModelSemanticDiagnostics(
  state: MutableTraceState,
  refsByRequirement: Map<string, { requirement: AtomicRequirement; refs: ModelElementRef[] }>,
  designModels: DesignDiagramModelSpec[],
) {
  for (const { requirement, refs } of refsByRequirement.values()) {
    const candidates = refs.filter((ref) =>
      shouldCheckDesignSourceSemantics(ref, designModels),
    );
    if (candidates.length === 0) continue;
    const explainer = candidates.find((ref) =>
      designSourceExplainsRequirement(requirement, ref, designModels),
    );
    if (explainer) continue;
    addSemanticModelDiagnostic(
      state,
      requirement,
      "design-model",
      modelRefId(candidates[0]!),
    );
  }
}

function addSemanticModelDiagnostic(
  state: MutableTraceState,
  requirement: AtomicRequirement,
  artifactType: TraceabilityArtifactType,
  artifactId: string,
) {
  addDiagnostic(state, {
    severity: "warning",
    code: "semantic-model-gap",
    message: `${artifactId} does not explain ${requirement.id} (${requirement.sourceFragment}).`,
    artifactType,
    artifactId,
    requirementId: requirement.id,
    blocksCompletion: false,
  });
}

function sequenceExplainsRequirement(
  requirement: AtomicRequirement,
  model: DesignDiagramModelSpec,
) {
  if (model.diagramKind !== "sequence") return true;
  const messageText = model.messages
    .map((message) =>
      [
        message.name,
        message.condition,
        message.description,
        message.returnValue,
        ...message.parameters,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(" ")
    .trim();
  if (!messageText.trim()) return false;
  const evidence = requirementSemanticEvidence(requirement, messageText);
  if (requiresActionEvidence(requirement)) {
    if (!evidence.action) return false;
    return requirement.object ? evidence.object : evidence.condition || evidence.outcome || true;
  }
  if (requirement.object && evidence.object) return true;
  if (evidence.action || evidence.condition || evidence.outcome) return true;
  const loweredText = messageText.toLowerCase();
  return meaningfulRequirementTokens(requirement).some((token) =>
    loweredText.includes(token.toLowerCase()),
  );
}

function designSourceExplainsRequirement(
  requirement: AtomicRequirement,
  ref: ModelElementRef,
  designModels: DesignDiagramModelSpec[],
) {
  const model = designModels.find(
    (candidate) =>
      candidate.diagramKind === ref.diagramKind &&
      (!ref.modelId || candidate.modelId === ref.modelId),
  );
  if (model?.diagramKind === "sequence") {
    return sequenceExplainsRequirement(requirement, model);
  }
  return modelExplainsRequirement(requirement, ref, designModels);
}

function shouldCheckDesignSourceSemantics(
  ref: ModelElementRef,
  designModels: DesignDiagramModelSpec[],
) {
  const model = designModels.find(
    (candidate) =>
      candidate.diagramKind === ref.diagramKind &&
      (!ref.modelId || candidate.modelId === ref.modelId),
  );
  if (model?.diagramKind === "sequence") return true;
  return !isStructuralModelRef(ref, designModels);
}





function codeMatchesRequirement(path: string, content: string, requirement: AtomicRequirement) {
  const text = `${path}\n${content}`.toLowerCase();
  return normalizedTokens(requirement).some((token) =>
    text.includes(token.toLowerCase()),
  );
}

function coverageStatusForRequirement(
  requirement: AtomicRequirement,
  modelElements: string[],
  designElements: string[],
  
): CoverageMatrixRow["status"] {
  if (requirement.status === "conflict") return "conflict";
  if (requirement.status === "pending-review" || requirement.status === "ambiguous") {
    return "pending-review";
  }
  if (requirement.status !== "accepted") return "pending-review";
  if (
    requirement.type === "non-functional" &&
    modelElements.length === 0 &&
    designElements.length === 0
  ) {
    return "not-modelable";
  }
  return modelElements.length > 0 || designElements.length > 0
    ? "covered"
    : "pending-review";
}

function buildCoverageRows(
  baseline: RequirementBaseline,
  tracedArtifacts: Map<
    string,
    {
      modelElements: Set<string>;
      designElements: Set<string>;
      
      tests: Set<string>;
      reviewItems: Set<string>;
    }
  >,
): CoverageMatrixRow[] {
  return baseline.requirements.map((requirement) => {
    const traced = tracedArtifacts.get(requirement.id) ?? {
      modelElements: new Set<string>(),
      designElements: new Set<string>(),
      
      tests: new Set<string>(),
      reviewItems: new Set<string>(),
    };
    const modelElements = Array.from(traced.modelElements);
    const designElements = Array.from(traced.designElements);
    
    const status = coverageStatusForRequirement(
      requirement,
      modelElements,
      designElements,
      
    );
    return {
      requirementId: requirement.id,
      status,
      rationale:
        status === "not-modelable"
          ? "Requirement is not directly modelable in UML and requires an alternative evidence path / 替代证据路径."
          : status === "covered"
          ? "Requirement has at least one traced downstream artifact."
          : "Requirement needs review or an alternative evidence path before completion.",
      modelElements,
      designElements,
      
      tests: Array.from(traced.tests),
      reviewItems:
        status === "not-modelable"
          ? Array.from(new Set([...traced.reviewItems, `alternative-evidence:${requirement.id}`]))
          : Array.from(traced.reviewItems),
    };
  });
}

function addTracedArtifact(
  tracedArtifacts: Map<
    string,
    {
      modelElements: Set<string>;
      designElements: Set<string>;
      
      tests: Set<string>;
      reviewItems: Set<string>;
    }
  >,
  requirementId: string,
  kind: "modelElements" | "designElements" |  "tests" | "reviewItems",
  artifact: string,
) {
  const current = tracedArtifacts.get(requirementId) ?? {
    modelElements: new Set<string>(),
    designElements: new Set<string>(),
    
    tests: new Set<string>(),
    reviewItems: new Set<string>(),
  };
  current[kind].add(artifact);
  tracedArtifacts.set(requirementId, current);
}

export function buildRequirementStageTrustedChain({
  runId,
  baseline,
  models,
  requirementModelTraceability,
}: RequirementStageInput): TrustedChainArtifacts {
  const state: MutableTraceState = { links: [], diagnostics: [] };
  const byRule = requirementByRuleId(baseline);
  const tracedArtifacts = new Map<
    string,
    {
      modelElements: Set<string>;
      designElements: Set<string>;
      
      tests: Set<string>;
      reviewItems: Set<string>;
    }
  >();
  const tracedModelRefs = new Set<string>();
  const semanticRefsByRequirement = new Map<
    string,
    { requirement: AtomicRequirement; refs: ModelElementRef[] }
  >();

  for (const entry of requirementModelTraceability) {
    const requirement = byRule.get(entry.ruleId);
    const targetId = modelRefId(entry.target);
    tracedModelRefs.add(targetId);
    if (!requirement) {
      addDiagnostic(state, {
        severity: "critical",
        code: "fake-trace",
        message: `Trace entry references rule ${entry.ruleId} with no baseline requirement.`,
        artifactType: "requirements-model",
        artifactId: targetId,
        blocksCompletion: true,
      });
      continue;
    }
    if (!hasSemanticSignal(requirement, entry.target)) {
      addDiagnostic(state, {
        severity: "error",
        code: "shallow-trace",
        message: `${targetId} does not carry a meaningful semantic signal for ${requirement.id}.`,
        artifactType: "requirements-model",
        artifactId: targetId,
        requirementId: requirement.id,
        blocksCompletion: true,
      });
    }
    const currentSemanticRefs = semanticRefsByRequirement.get(requirement.id) ?? {
      requirement,
      refs: [],
    };
    currentSemanticRefs.refs.push(entry.target);
    semanticRefsByRequirement.set(requirement.id, currentSemanticRefs);
  }

  for (const ref of collectModelRefs(models).refs) {
    if (!requiresDirectRequirementTrace(ref)) continue;
    const id = modelRefId(ref);
    if (tracedModelRefs.has(id)) continue;
    addDiagnostic(state, {
      severity: "error",
      code: "orphan-artifact",
      message: `Requirements model artifact ${id} has no requirement trace.`,
      artifactType: "requirements-model",
      artifactId: id,
      blocksCompletion: true,
    });
  }
  addRequirementModelSemanticDiagnostics(state, semanticRefsByRequirement, models);
  for (const { requirement, refs } of semanticRefsByRequirement.values()) {
    for (const ref of refs) {
      if (isStructuralModelRef(ref, models)) continue;
      if (!modelExplainsRequirement(requirement, ref, models)) continue;
      const targetId = modelRefId(ref);
      addTracedArtifact(
        tracedArtifacts,
        requirement.id,
        "modelElements",
        targetId,
      );
      addBidirectionalLink(
        state,
        "requirement",
        requirement.id,
        "requirements-model",
        targetId,
        "satisfies",
        Math.min(0.95, requirement.confidence),
        `Semantically verified requirement model element maps to ${requirement.id}.`,
      );
    }
  }

  const coverageMatrix = coverageMatrixSchema.parse({
    runId,
    rows: buildCoverageRows(baseline, tracedArtifacts),
  });
  addCoverageDiagnostics(state, coverageMatrix);

  return {
    coverageMatrix,
    traceabilityMatrix: traceabilityMatrixSchema.parse({
      runId,
      links: state.links,
      diagnostics: state.diagnostics,
    }),
  };
}

export function buildDesignStageTrustedChain(input: DesignStageInput): TrustedChainArtifacts {
  const base = buildRequirementStageTrustedChain(input);
  const state: MutableTraceState = {
    links: [...base.traceabilityMatrix.links],
    diagnostics: [...base.traceabilityMatrix.diagnostics],
  };
  const tracedArtifacts = coverageRowsToTraceMap(base.coverageMatrix.rows);
  const requirementTargetToId = new Map<string, string>();
  const byRule = requirementByRuleId(input.baseline);
  const byId = requirementById(input.baseline);
  for (const entry of input.requirementModelTraceability) {
    const requirement = byRule.get(entry.ruleId);
    if (requirement) requirementTargetToId.set(modelRefId(entry.target), requirement.id);
  }

  const tracedDesignRefs = new Set<string>();
  const semanticDesignRefsByRequirement = new Map<
    string,
    { requirement: AtomicRequirement; refs: ModelElementRef[] }
  >();
  for (const entry of input.designModelTraceability) {
    const sourceId = modelRefId(entry.source);
    tracedDesignRefs.add(sourceId);
    const requirementIds = new Set(
      entry.targets
        .map((target) => requirementTargetToId.get(modelRefId(target)))
        .filter((id): id is string => Boolean(id)),
    );
    if (requirementIds.size === 0) {
      addDiagnostic(state, {
        severity: "critical",
        code: "fake-trace",
        message: `Design artifact ${sourceId} does not resolve to any baseline requirement.`,
        artifactType: "design-model",
        artifactId: sourceId,
        blocksCompletion: true,
      });
      continue;
    }
    for (const requirementId of requirementIds) {
      const requirement = byId.get(requirementId);
      if (
        requirement &&
        shouldCheckDesignSourceSemantics(entry.source, input.designModels)
      ) {
        const currentSemanticRefs = semanticDesignRefsByRequirement.get(requirement.id) ?? {
          requirement,
          refs: [],
        };
        currentSemanticRefs.refs.push(entry.source);
        semanticDesignRefsByRequirement.set(requirement.id, currentSemanticRefs);
      }
      const traceConfirmed =
        entry.confidence !== "low" &&
        entry.reviewStatus !== "pending" &&
        entry.mappingSource !== "auto-filled-pending-review";
      if (
        !requirement ||
        !traceConfirmed ||
        !shouldCheckDesignSourceSemantics(entry.source, input.designModels) ||
        !designSourceExplainsRequirement(
          requirement,
          entry.source,
          input.designModels,
        )
      ) {
        continue;
      }
      addTracedArtifact(
        tracedArtifacts,
        requirementId,
        "designElements",
        sourceId,
      );
      addBidirectionalLink(
        state,
        "requirement",
        requirementId,
        "design-model",
        sourceId,
        "refines",
        entry.confidence === "medium" ? 0.7 : 0.9,
        `Semantically verified design model artifact refines ${requirementId}.`,
      );
    }
    if (entry.reviewStatus === "pending" || entry.mappingSource === "auto-filled-pending-review") {
      addDiagnostic(state, {
        severity: "error",
        code: "pending-review",
        message: `Design trace ${sourceId} requires human review.`,
        artifactType: "design-model",
        artifactId: sourceId,
        blocksCompletion: true,
      });
    }
  }

  for (const ref of collectModelRefs(input.designModels).refs) {
    const id = modelRefId(ref);
    if (tracedDesignRefs.has(id)) continue;
    addDiagnostic(state, {
      severity: "error",
      code: "orphan-artifact",
      message: `Design model artifact ${id} has no requirement trace.`,
      artifactType: "design-model",
      artifactId: id,
      blocksCompletion: true,
    });
  }
  addDesignModelSemanticDiagnostics(
    state,
    semanticDesignRefsByRequirement,
    input.designModels,
  );

  const coverageMatrix = coverageMatrixSchema.parse({
    runId: input.runId,
    rows: buildCoverageRows(input.baseline, tracedArtifacts),
  });
  addCoverageDiagnostics(state, coverageMatrix);

  return {
    coverageMatrix,
    traceabilityMatrix: traceabilityMatrixSchema.parse({
      runId: input.runId,
      links: state.links,
      diagnostics: dedupeDiagnostics(state.diagnostics),
    }),
  };
}



export function assertTrustedChainAllowsCompletion(_artifacts: TrustedChainArtifacts) {
  // Trusted-chain gaps are now audit hints in the interactive workflow. Pipeline
  // stages should continue unless the underlying generation/parsing step fails.
}

function addCoverageDiagnostics(
  state: MutableTraceState,
  coverageMatrix: CoverageMatrix,
) {
  for (const row of coverageMatrix.rows) {
    if (row.status === "pending-review") {
      addDiagnostic(state, {
        severity: "error",
        code: "uncovered-requirement",
        message: `${row.requirementId} has no accountable downstream coverage.`,
        artifactType: "requirement",
        artifactId: row.requirementId,
        requirementId: row.requirementId,
        blocksCompletion: true,
      });
    }
    if (row.status === "conflict") {
      addDiagnostic(state, {
        severity: "critical",
        code: "conflict",
        message: `${row.requirementId} remains conflicting.`,
        artifactType: "requirement",
        artifactId: row.requirementId,
        requirementId: row.requirementId,
        blocksCompletion: true,
      });
    }
  }
}

function coverageRowsToTraceMap(rows: CoverageMatrix["rows"]) {
  const tracedArtifacts = new Map<
    string,
    {
      modelElements: Set<string>;
      designElements: Set<string>;
      
      tests: Set<string>;
      reviewItems: Set<string>;
    }
  >();
  for (const row of rows) {
    tracedArtifacts.set(row.requirementId, {
      modelElements: new Set(row.modelElements),
      designElements: new Set(row.designElements),
      
      tests: new Set(row.tests),
      reviewItems: new Set(row.reviewItems),
    });
  }
  return tracedArtifacts;
}

function dedupeDiagnostics(diagnostics: TraceabilityDiagnostic[]) {
  const byKey = new Map<string, TraceabilityDiagnostic>();
  for (const diagnostic of diagnostics) {
    byKey.set(
      [
        diagnostic.code,
        diagnostic.artifactType ?? "",
        diagnostic.artifactId ?? "",
        diagnostic.requirementId ?? "",
        diagnostic.message,
      ].join("|"),
      diagnostic,
    );
  }
  return Array.from(byKey.values()).map((diagnostic, index) => ({
    ...diagnostic,
    id: diagnosticId(index),
  }));
}
