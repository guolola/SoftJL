// Builds traceability matrix rows from workspace state without rendering UI.
import type {
  CoverageMatrix,
  DesignDiagramKind,
  DiagramKind,
  DiagramModelSpec,
  ContextDiagramSpec,
  ContextTraceRow,
  ModelElementRef,
  RequirementRule,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  getDesignModelId,
  getRequirementModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import {
  SEMANTIC_KIND_META,
  buildDiagramDetailModel,
} from "../../../entities/diagram/lib/model-details";
import type { useWorkspaceSession } from "../../workspace-session/state";

const AUTO_FILLED_PENDING_REVIEW_NOTE =
  "由系统自动建立候选映射，需复核。";

export type RowStatus = "mapped" | "unmapped";
export type MatrixScope = {
  diagramKind: DiagramKind | DesignDiagramKind;
  modelId?: string;
  label?: string;
};

export type ElementRow = {
  id: string;
  label: string;
  subtitle: string;
  typeLabel: string;
  groupKey: string;
  groupLabel: string;
  scopeKey: string;
  status: RowStatus;
  mappingNote: string | null;
  requirementRules: RequirementRule[];
  requirementElements: ModelElementRef[];
  upstreamDesignElements: ModelElementRef[];
  detailLines: string[];
};

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const ALL_GROUPS = "__all__";

export function buildContextRows(
  rules: RequirementRule[],
  model: ContextDiagramSpec | null,
  traceability: ContextTraceRow[],
  copy: TraceabilityRowCopy = DEFAULT_TRACEABILITY_ROW_COPY,
): ElementRow[] {
  if (!model) return [];
  const rulesById = new Map(rules.map((rule) => [rule.id.trim().toLowerCase(), rule]));
  const hasPersistedTrace = traceability.length > 0;
  const persistedPairs = new Set(
    traceability.map((row) => `${row.requirementId.trim().toLowerCase()}:${row.targetId}`),
  );
  const createRow = (input: {
    id: string;
    label: string;
    description?: string;
    groupKey: string;
    groupLabel: string;
    typeLabel: string;
    sourceRequirementIds: string[];
    detailLines?: string[];
  }): ElementRow => {
    const sourceIds = Array.from(new Set(input.sourceRequirementIds.map((id) => id.trim()).filter(Boolean)));
    const requirementRules = sourceIds
      .map((id) => rulesById.get(id.toLowerCase()))
      .filter((rule): rule is RequirementRule => Boolean(rule));
    const invalidIds = sourceIds.filter((id) => !rulesById.has(id.toLowerCase()));
    const traceComplete =
      !hasPersistedTrace ||
      sourceIds.every((id) => persistedPairs.has(`${id.toLowerCase()}:${input.id}`));
    const mapped = sourceIds.length > 0 && invalidIds.length === 0 && traceComplete;
    return {
      id: `context:${input.groupKey}:${input.id}`,
      label: input.label,
      subtitle: input.description ?? copy.context.noDescription,
      typeLabel: input.typeLabel,
      groupKey: input.groupKey,
      groupLabel: input.groupLabel,
      scopeKey: "context",
      status: mapped ? "mapped" : "unmapped",
      mappingNote: invalidIds.length > 0
        ? copy.context.invalidSources(invalidIds.join(", "))
        : !traceComplete
          ? copy.context.incompleteTrace
          : sourceIds.length > 0
            ? copy.context.deterministicMapping
            : copy.context.missingSource,
      requirementRules,
      requirementElements: [],
      upstreamDesignElements: [],
      detailLines: [
        copy.context.sourceRules(sourceIds.length > 0 ? sourceIds.join(", ") : copy.context.unmapped),
        ...(input.detailLines ?? []),
      ],
    };
  };
  const people = model.people.map((item) => createRow({
    id: item.id,
    label: item.name,
    description: item.description,
    groupKey: "context:people",
    groupLabel: copy.context.people,
    typeLabel: copy.context.people,
    sourceRequirementIds: item.sourceRequirementIds,
  }));
  const externalSystems = model.externalSystems.map((item) => createRow({
    id: item.id,
    label: item.name,
    description: item.description,
    groupKey: "context:external-systems",
    groupLabel: copy.context.externalSystems,
    typeLabel: copy.context.externalSystems,
    sourceRequirementIds: item.sourceRequirementIds,
  }));
  const relationships = model.relationships.map((item) => createRow({
    id: item.id,
    label: item.label,
    description: item.description,
    groupKey: "context:relationships",
    groupLabel: copy.context.relationships,
    typeLabel: item.direction === "bidirectional" ? copy.context.bidirectionalInteraction : copy.context.directedInteraction,
    sourceRequirementIds: item.sourceRequirementIds,
    detailLines: [
      copy.context.endpoints(item.sourceId, item.targetId),
      copy.context.direction(item.direction === "bidirectional" ? copy.context.bidirectional : copy.context.directed),
    ],
  }));
  return [...people, ...externalSystems, ...relationships];
}

export type TraceabilityRowCopy = {
  context: {
    noDescription: string;
    people: string;
    externalSystems: string;
    relationships: string;
    directedInteraction: string;
    bidirectionalInteraction: string;
    invalidSources: (ids: string) => string;
    incompleteTrace: string;
    deterministicMapping: string;
    missingSource: string;
    sourceRules: (ids: string) => string;
    unmapped: string;
    endpoints: (source: string, target: string) => string;
    direction: (direction: string) => string;
    directed: string;
    bidirectional: string;
  };
  semanticKindLabel: (kind: keyof typeof SEMANTIC_KIND_META) => string;
  requirementGroupLabel: (diagramKind: DiagramKind | DesignDiagramKind) => string;
  designGroupLabel: (diagramKind: DiagramKind | DesignDiagramKind) => string;
  autoFilledPendingReviewNote: string;
  unnamedEventFlow: string;
  step: (order?: string) => string;
  systemResponse: (response: string) => string;
  eventFlow: (flowType: string, flowLabel: string) => string;
  derivedFromSourceUseCaseFlow: string;
  missingSourceUseCaseOrEventFlow: string;
  sourceUseCase: (label: string) => string;
  sourceUseCaseMissing: string;
  pending: (note: string) => string;
  confidence: (confidence: string) => string;
  endpointDerived: string;
  mappingDescription: (note: string) => string;
  sourceUseCaseRealization: (modelLabel: string, elementLabel?: string) => string;
  requirementElement: (groupLabel: string, elementLabel?: string) => string;
};

export const DEFAULT_TRACEABILITY_ROW_COPY: TraceabilityRowCopy = {
  context: {
    noDescription: "暂无说明",
    people: "人员",
    externalSystems: "外部系统",
    relationships: "关系",
    directedInteraction: "有向交互",
    bidirectionalInteraction: "双向交互",
    invalidSources: (ids) => `无效来源规则：${ids}`,
    incompleteTrace: "持久化跟踪数据不完整，请保存或重新生成系统环境图。",
    deterministicMapping: "根据上下文模型的来源规则编号确定性映射。",
    missingSource: "缺少来源需求规则。",
    sourceRules: (ids) => `来源规则：${ids}`,
    unmapped: "未映射",
    endpoints: (source, target) => `端点：${source} → ${target}`,
    direction: (direction) => `方向：${direction}`,
    directed: "有向",
    bidirectional: "双向",
  },
  semanticKindLabel: (kind) => SEMANTIC_KIND_META[kind].label,
  requirementGroupLabel: (diagramKind) =>
    DIAGRAM_META[diagramKind as DiagramType]?.label ?? String(diagramKind),
  designGroupLabel: (diagramKind) =>
    DESIGN_DIAGRAM_META[diagramKind as DesignDiagramType]?.label ?? String(diagramKind),
  autoFilledPendingReviewNote: AUTO_FILLED_PENDING_REVIEW_NOTE,
  unnamedEventFlow: "未命名事件流",
  step: (order) => (order ? `步骤 ${order}` : "步骤"),
  systemResponse: (response) => `系统响应：${response}`,
  eventFlow: (flowType, flowLabel) => `事件流：${flowType ? `${flowType} · ` : ""}${flowLabel}`,
  derivedFromSourceUseCaseFlow: "由来源用例事件流派生",
  missingSourceUseCaseOrEventFlow: "缺少来源用例或事件流",
  sourceUseCase: (label) => `来源用例：${label}`,
  sourceUseCaseMissing: "来源用例：未找到",
  pending: (note) => `待确认：${note}`,
  confidence: (confidence) => `置信度：${confidence}`,
  endpointDerived: "由端点映射推导",
  mappingDescription: (note) => `映射说明：${note}`,
  sourceUseCaseRealization: (modelLabel, elementLabel) =>
    `来源用例实现设计：${modelLabel} / ${elementLabel}`,
  requirementElement: (groupLabel, elementLabel) => `需求元素：${groupLabel} / ${elementLabel}`,
};

function refKey(ref: Pick<ModelElementRef, "diagramKind" | "elementId" | "modelId">) {
  const scope = ref.modelId?.trim() || ref.diagramKind;
  return `${scope}:${ref.diagramKind}:${ref.elementId}`.toLowerCase();
}

function trustedRefId(
  ref: Pick<ModelElementRef, "diagramKind" | "elementId" | "modelId">,
) {
  return `${ref.modelId ? `${ref.modelId}:` : ""}${ref.diagramKind}:${ref.elementId}`.toLowerCase();
}

export function formatRuleId(id: string) {
  const value = id.trim();
  const match = /^r(\d+)$/i.exec(value);
  return match ? `R${match[1]}` : value.toUpperCase();
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function hasInteractiveReviewText(text: string) {
  return /未找到明确(?:上游)?来源|请在跟踪矩阵|采纳|忽略|确认是否采纳/u.test(text);
}

function traceabilityDisplayNote(value: string | undefined, fallback = AUTO_FILLED_PENDING_REVIEW_NOTE) {
  const text = value?.trim();
  if (!text || hasInteractiveReviewText(text)) return fallback;
  return text;
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function refsForRequirementModels(
  models: ReturnType<typeof useWorkspaceSession>["models"],
  scope?: MatrixScope,
  copy = DEFAULT_TRACEABILITY_ROW_COPY,
) {
  const scopedModels = uniqueBy(
    Object.values(models)
      .filter((model): model is NonNullable<typeof model> => Boolean(model))
      .filter((model) => {
        if (!scope) return true;
        const modelId = getRequirementModelId(model);
        return scope.modelId
          ? modelId === scope.modelId
          : model.diagramKind === scope.diagramKind;
      }),
    getRequirementModelId,
  ).sort((left, right) => {
    const leftOrder = DIAGRAM_ORDER.indexOf(left.diagramKind as DiagramType);
    const rightOrder = DIAGRAM_ORDER.indexOf(right.diagramKind as DiagramType);
    return leftOrder - rightOrder || getRequirementModelId(left).localeCompare(getRequirementModelId(right));
  });
  return scopedModels.flatMap((model) => {
    const diagram = model.diagramKind as DiagramKind;
    const modelId = getRequirementModelId(model);
    const detail = buildDiagramDetailModel(model);
    const items = detail.items.filter((item) =>
      isBusinessTraceabilityKind(item.kind),
    );
    const businessIds = new Set(items.map((item) => item.id));
    if (model.diagramKind === "activity") for (const node of (model as Extract<DiagramModelSpec, { diagramKind: "activity" }>).nodes) if (node.type === "activity") for (const pin of [...node.inputPins ?? [], ...node.outputPins ?? []]) businessIds.add(pin.id);
    const relationships = detail.relationships.filter(
      (relationship) =>
        diagram !== "activity" ||
        (businessIds.has(relationship.sourceId) &&
          businessIds.has(relationship.targetId)),
    );
    return uniqueBy([
      ...items.map((item) => ({
        ref: {
          diagramKind: diagram as DiagramKind,
          modelId,
          elementId: item.id,
          elementKind: item.kind,
          label: item.label,
        },
        typeLabel: copy.semanticKindLabel(item.kind),
        description: item.description ?? "",
      })),
      ...relationships.map((relationship) => ({
        ref: {
          diagramKind: diagram as DiagramKind,
          modelId,
          elementId: relationship.id,
          elementKind: "relationship",
          label: relationship.label,
        },
        typeLabel: relationship.typeLabel,
        description: `${relationship.sourceId} -> ${relationship.targetId}`,
      })),
    ], (entry) => refKey(entry.ref));
  });
}

function refsForDesignModels(
  models: ReturnType<typeof useWorkspaceSession>["designModels"],
  scope?: MatrixScope,
  copy = DEFAULT_TRACEABILITY_ROW_COPY,
) {
  return Object.values(models).filter((model) => {
    if (!scope) return true;
    const modelId = getDesignModelId(model);
    return scope.modelId
      ? modelId === scope.modelId
      : model.diagramKind === scope.diagramKind;
  }).flatMap((model) => {
    const diagram = model.diagramKind;
    const modelId = getDesignModelId(model);
    const detail = buildDiagramDetailModel(model);
    const items = detail.items.filter((item) =>
      isBusinessTraceabilityKind(item.kind),
    );
    const relationships = detail.relationships;
    return [
      ...items.map((item) => ({
        ref: {
          diagramKind: diagram as DesignDiagramKind,
          modelId,
          elementId: item.id,
          elementKind: item.kind,
          label: item.label,
        },
        typeLabel: copy.semanticKindLabel(item.kind),
        description: item.description ?? "",
      })),
      ...relationships.map((relationship) => ({
        ref: {
          diagramKind: diagram as DesignDiagramKind,
          modelId,
          elementId: relationship.id,
          elementKind: "relationship",
          label: relationship.label,
        },
        typeLabel: relationship.typeLabel,
        description: `${relationship.sourceId} -> ${relationship.targetId}`,
      })),
    ];
  });
}

export function requirementGroupLabel(
  diagramKind: DiagramKind | DesignDiagramKind,
  copy = DEFAULT_TRACEABILITY_ROW_COPY,
) {
  return copy.requirementGroupLabel(diagramKind);
}

export function designGroupLabel(
  diagramKind: DiagramKind | DesignDiagramKind,
  copy = DEFAULT_TRACEABILITY_ROW_COPY,
) {
  return copy.designGroupLabel(diagramKind);
}

function sourceUseCaseIdFromAnalysisModel(model: NonNullable<ReturnType<typeof useWorkspaceSession>["models"][string]>) {
  if (model.diagramKind !== "analysis") return "";
  const explicit = compactString((model as unknown as { sourceUseCaseId?: unknown }).sourceUseCaseId);
  if (explicit) return explicit;
  const modelId = getRequirementModelId(model);
  return modelId.startsWith("analysis:") ? modelId.slice("analysis:".length) : "";
}

function sourceUseCaseForAnalysis(
  models: ReturnType<typeof useWorkspaceSession>["models"],
  analysisModelId: string,
) {
  const analysisModel = Object.values(models)
    .filter((model): model is NonNullable<typeof model> => Boolean(model))
    .find((model) => getRequirementModelId(model) === analysisModelId);
  const sourceUseCaseId = analysisModel ? sourceUseCaseIdFromAnalysisModel(analysisModel) : "";
  if (!sourceUseCaseId) return null;
  const useCaseModel = Object.values(models)
    .filter((model): model is NonNullable<typeof model> => Boolean(model))
    .find((model) => model.diagramKind === "usecase");
  if (!useCaseModel || useCaseModel.diagramKind !== "usecase") return null;
  const useCase = useCaseModel.useCases.find((item) => item.id === sourceUseCaseId);
  return useCase ? { useCaseModel, useCase } : null;
}

function eventFlowLines(useCase: unknown, copy = DEFAULT_TRACEABILITY_ROW_COPY) {
  const flows = ensureArray((useCase as { eventFlows?: unknown }).eventFlows);
  return flows.flatMap((flow) => {
    const record = flow as Record<string, unknown>;
    const flowLabel = compactString(record.name) || compactString(record.id) || copy.unnamedEventFlow;
    const flowType = compactString(record.flowType) || compactString(record.type);
    const steps = ensureArray(record.steps).slice(0, 4).map((step) => {
      const stepRecord = step as Record<string, unknown>;
      const action =
        compactString(stepRecord.actorAction) ||
        compactString(stepRecord.action) ||
        compactString(stepRecord.description);
      const response =
        compactString(stepRecord.systemResponse) ||
        compactString(stepRecord.systemAction) ||
        compactString(stepRecord.expectedResult);
      const order = compactString(stepRecord.order);
      return [
        copy.step(order),
        action,
        response ? copy.systemResponse(response) : "",
      ].filter(Boolean).join("：");
    });
    return [
      copy.eventFlow(flowType, flowLabel),
      ...steps,
    ];
  });
}

function buildAnalysisRequirementRows(
  models: ReturnType<typeof useWorkspaceSession>["models"],
  scope: MatrixScope,
  copy = DEFAULT_TRACEABILITY_ROW_COPY,
): ElementRow[] {
  return refsForRequirementModels(models, scope, copy).map(({ ref, typeLabel, description }) => {
    const source = ref.modelId ? sourceUseCaseForAnalysis(models, ref.modelId) : null;
    const sourceRef: ModelElementRef | null = source
      ? {
          diagramKind: "usecase",
          elementId: source.useCase.id,
          elementKind: "usecase",
          label: source.useCase.name,
        }
      : null;
    const flowLines = source ? eventFlowLines(source.useCase, copy) : [];
    const mapped = Boolean(sourceRef && flowLines.length > 0);
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${requirementGroupLabel(ref.diagramKind, copy)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.modelId ?? ref.diagramKind,
      groupLabel: requirementGroupLabel(ref.diagramKind, copy),
      scopeKey: ref.modelId ?? ref.diagramKind,
      status: mapped ? "mapped" : "unmapped",
      mappingNote: mapped ? copy.derivedFromSourceUseCaseFlow : copy.missingSourceUseCaseOrEventFlow,
      requirementRules: [],
      requirementElements: sourceRef ? [sourceRef] : [],
      upstreamDesignElements: [],
      detailLines: [
        ...(sourceRef ? [copy.sourceUseCase(sourceRef.label)] : [copy.sourceUseCaseMissing]),
        ...flowLines,
      ],
    };
  });
}

export function buildRequirementRows(
  rules: RequirementRule[],
  models: ReturnType<typeof useWorkspaceSession>["models"],
  traceability: ReturnType<typeof useWorkspaceSession>["requirementModelTraceability"],
  scope?: MatrixScope,
  copy = DEFAULT_TRACEABILITY_ROW_COPY,
  coverageMatrix?: CoverageMatrix | null,
): ElementRow[] {
  if (scope?.diagramKind === "analysis") {
    return buildAnalysisRequirementRows(models, scope, copy);
  }
  const rulesById = new Map(rules.map((rule) => [rule.id.toLowerCase(), rule]));
  const traceByTarget = new Map<
    string,
    Array<{
      rule: RequirementRule;
      mappingSource?: string;
      reviewStatus?: string;
      confidence?: string;
      rationale?: string;
    }>
  >();
  const trustedModelElements = coverageMatrix
    ? new Set(
        coverageMatrix.rows.flatMap((row) =>
          row.modelElements.map((elementId) => elementId.toLowerCase()),
        ),
      )
    : null;
  for (const entry of traceability) {
    const rule = rulesById.get(entry.ruleId.toLowerCase());
    if (!rule) continue;
    // Raw mappings remain visible in run evidence, but only semantically
    // validated targets contribute to the user-facing coverage matrix.
    if (
      trustedModelElements &&
      !trustedModelElements.has(trustedRefId(entry.target))
    ) {
      continue;
    }
    const key = refKey(entry.target);
    traceByTarget.set(key, [
      ...(traceByTarget.get(key) ?? []),
      {
        rule,
        mappingSource: entry.mappingSource,
        reviewStatus: entry.reviewStatus,
        confidence: entry.confidence,
        rationale: entry.rationale,
      },
    ]);
  }

  return refsForRequirementModels(models, scope, copy).map(({ ref, typeLabel, description }) => {
    const mappedEntries = uniqueBy(
      traceByTarget.get(refKey(ref)) ?? [],
      (entry) => entry.rule.id,
    );
    const mappedRules = mappedEntries.map((entry) => entry.rule);
    const pendingEntry = mappedEntries.find(
      (entry) =>
        entry.mappingSource === "auto-filled-pending-review" ||
        entry.reviewStatus === "pending",
    );
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${requirementGroupLabel(ref.diagramKind, copy)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.modelId ?? ref.diagramKind,
      groupLabel: requirementGroupLabel(ref.diagramKind, copy),
      scopeKey: ref.modelId ?? ref.diagramKind,
      status: mappedRules.length > 0 ? "mapped" : "unmapped",
      mappingNote: pendingEntry
        ? traceabilityDisplayNote(pendingEntry.rationale, copy.autoFilledPendingReviewNote)
        : null,
      requirementRules: mappedRules,
      requirementElements: [],
      upstreamDesignElements: [],
      detailLines: [
        ...(pendingEntry
          ? [copy.pending(traceabilityDisplayNote(pendingEntry.rationale, copy.autoFilledPendingReviewNote))]
          : []),
        ...mappedEntries
          .filter((entry) => entry.confidence)
          .map((entry) => copy.confidence(entry.confidence ?? "")),
        ...mappedRules.map(
        (rule) => `${formatRuleId(rule.id)} [${rule.category}] ${rule.text}`,
        ),
      ],
    };
  });
}

function deriveVisibleUpstreamDesignRefs(
  traceability: ReturnType<typeof useWorkspaceSession>["designModelTraceability"],
) {
  const sequenceSourcesByTarget = new Map<string, ModelElementRef[]>();
  for (const entry of traceability) {
    if (entry.source.diagramKind !== "sequence") continue;
    for (const target of entry.targets) {
      const key = refKey(target);
      sequenceSourcesByTarget.set(key, [
        ...(sequenceSourcesByTarget.get(key) ?? []),
        entry.source,
      ]);
    }
  }
  if (sequenceSourcesByTarget.size === 0) return traceability;

  return traceability.map((entry) => {
    if (entry.source.diagramKind === "sequence") return entry;
    const upstreamDesignRefs = new Map<string, ModelElementRef>();
    for (const ref of entry.upstreamDesignRefs ?? []) {
      upstreamDesignRefs.set(refKey(ref), ref);
    }
    for (const target of entry.targets) {
      for (const source of sequenceSourcesByTarget.get(refKey(target)) ?? []) {
        upstreamDesignRefs.set(refKey(source), source);
      }
    }
    return upstreamDesignRefs.size > 0
      ? { ...entry, upstreamDesignRefs: Array.from(upstreamDesignRefs.values()) }
      : entry;
  });
}

export function buildDesignRows(
  _rules: RequirementRule[],
  requirementModels: ReturnType<typeof useWorkspaceSession>["models"],
  designModels: ReturnType<typeof useWorkspaceSession>["designModels"],
  _requirementTraceability: ReturnType<typeof useWorkspaceSession>["requirementModelTraceability"],
  designTraceability: ReturnType<typeof useWorkspaceSession>["designModelTraceability"],
  scope?: MatrixScope,
  copy = DEFAULT_TRACEABILITY_ROW_COPY,
  coverageMatrix?: CoverageMatrix | null,
): ElementRow[] {
  const requirementRefMap = new Map(
    refsForRequirementModels(requirementModels, undefined, copy).map(({ ref }) => [refKey(ref), ref]),
  );
  const traceBySource = new Map<
    string,
    ReturnType<typeof useWorkspaceSession>["designModelTraceability"][number]
  >();
  const trustedDesignElements = coverageMatrix
    ? new Set(
        coverageMatrix.rows.flatMap((row) =>
          row.designElements.map((elementId) => elementId.toLowerCase()),
        ),
      )
    : null;
  for (const entry of deriveVisibleUpstreamDesignRefs(designTraceability)) {
    if (
      trustedDesignElements &&
      !trustedDesignElements.has(trustedRefId(entry.source))
    ) {
      continue;
    }
    traceBySource.set(entry.source.elementId ? refKey(entry.source) : "", entry);
  }

  return refsForDesignModels(designModels, scope, copy).map(({ ref, typeLabel, description }) => {
    const traceEntry = traceBySource.get(refKey(ref));
    const targets = uniqueBy<ModelElementRef>(
      (traceEntry?.targets ?? [])
        .map((target) => requirementRefMap.get(refKey(target)) ?? target),
      refKey,
    );
    const upstreamDesignElements = uniqueBy<ModelElementRef>(
      traceEntry?.upstreamDesignRefs ?? [],
      refKey,
    );
    return {
      id: refKey(ref),
      label: ref.label,
      subtitle: description || `${designGroupLabel(ref.diagramKind, copy)} · ${typeLabel}`,
      typeLabel,
      groupKey: ref.diagramKind,
      groupLabel: designGroupLabel(ref.diagramKind, copy),
      scopeKey: ref.modelId ?? ref.diagramKind,
      status: targets.length > 0 ? "mapped" : "unmapped",
      mappingNote:
        traceEntry?.mappingSource === "auto-filled-pending-review" ||
        traceEntry?.reviewStatus === "pending"
          ? traceabilityDisplayNote(traceEntry.rationale, copy.autoFilledPendingReviewNote)
          : traceEntry?.mappingSource === "derived-from-endpoints"
            ? traceabilityDisplayNote(traceEntry.rationale, copy.endpointDerived)
            : null,
      requirementRules: [],
      requirementElements: targets,
      upstreamDesignElements,
      detailLines: [
        ...(traceEntry?.mappingSource === "auto-filled-pending-review" ||
        traceEntry?.reviewStatus === "pending"
          ? [copy.pending(traceabilityDisplayNote(traceEntry.rationale, copy.autoFilledPendingReviewNote))]
          : []),
        ...(traceEntry?.mappingSource === "derived-from-endpoints"
          ? [copy.mappingDescription(traceabilityDisplayNote(traceEntry.rationale, copy.endpointDerived))]
          : []),
        ...upstreamDesignElements.map(
          (target) =>
            copy.sourceUseCaseRealization(target.modelId ?? designGroupLabel(target.diagramKind, copy), target.label),
        ),
        ...targets.map(
          (target) =>
            copy.requirementElement(requirementGroupLabel(target.diagramKind, copy), target.label),
        ),
      ],
    };
  });
}

export function includesQuery(row: ElementRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    row.label,
    row.subtitle,
    row.typeLabel,
    row.groupLabel,
    row.mappingNote ?? "",
    ...row.detailLines,
    ...row.upstreamDesignElements.map((ref) => ref.label),
    ...row.requirementElements.map((ref) => ref.label),
    ...row.requirementRules.flatMap((rule) => [
      formatRuleId(rule.id),
      rule.category,
      rule.text,
    ]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

export function buildGroupOptions(rows: ElementRow[]) {
  return Array.from(
    new Map(rows.map((row) => [row.groupKey, row.groupLabel])).entries(),
  ).map(([value, label]) => ({ value, label }));
}
