// Validates generated traceability references against the model elements that actually exist.
import {
  type DesignDiagramModelSpec,
  type DesignModelTraceabilityEntry,
  type DiagramModelSpec,
  type ModelElementRef,
  type RequirementModelTraceabilityEntry,
  type RequirementRule,
} from "@uml-platform/contracts";
import { ensureArray, isPlainRecord } from "../json/parse-json.js";

type RefMaps = {
  refs: ModelElementRef[];
  byKey: Map<string, ModelElementRef>;
  byId: Map<string, ModelElementRef>;
};

export type RequirementTraceabilityCoverageResult = {
  traceability: RequirementModelTraceabilityEntry[];
  missingTargets: ModelElementRef[];
};

export type DesignTraceabilityCoverageResult = {
  traceability: DesignModelTraceabilityEntry[];
  missingSources: ModelElementRef[];
};

function compactString(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function omitNullValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitNullValues);
  }
  if (!isPlainRecord(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null) continue;
    next[key] = omitNullValues(item);
  }
  return next;
}

// Keeps malformed LLM traceability entries recoverable until the ref resolver can evaluate them.
export function sanitizeTraceabilityEntries(value: unknown): unknown[] {
  const cleaned = omitNullValues(value);
  if (Array.isArray(cleaned)) return cleaned;
  return isPlainRecord(cleaned) ? [cleaned] : [];
}

function normalizeMappingSource(
  value: unknown,
): DesignModelTraceabilityEntry["mappingSource"] {
  return value === "derived-from-endpoints" ||
    value === "llm" ||
    value === "auto-filled-pending-review"
    ? value
    : undefined;
}

function normalizeReviewStatus(
  value: unknown,
): DesignModelTraceabilityEntry["reviewStatus"] {
  return value === "confirmed" || value === "pending" ? value : undefined;
}

function normalizeConfidence(
  value: unknown,
): DesignModelTraceabilityEntry["confidence"] {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : undefined;
}

function normalizeRequirementMappingSource(
  value: unknown,
): RequirementModelTraceabilityEntry["mappingSource"] {
  return value === "llm" || value === "auto-filled-pending-review"
    ? value
    : undefined;
}

function refKey(diagramKind: string, elementId: string, modelId?: string) {
  const scope = compactString(modelId) || diagramKind;
  return `${scope}:${diagramKind}:${elementId}`.toLowerCase();
}

function normalizeTraceabilityDiagramKind(value: unknown) {
  const raw = compactString(value).toLowerCase().replace(/[\s_]+/g, "-");
  switch (raw) {
    case "function":
    case "function-structure":
    case "functional-structure":
    case "wbs":
    case "work-breakdown-structure":
      return "function";
    case "usecase":
    case "use-case":
    case "usecase-diagram":
    case "use-case-diagram":
      return "usecase";
    case "class":
    case "class-diagram":
    case "domain-class":
    case "domain-model":
      return "class";
    case "activity":
    case "activity-diagram":
    case "business-flow":
    case "business-process":
      return "activity";
    case "deployment":
    case "deployment-diagram":
    case "deployment-requirement":
      return "deployment";
    case "navigation": return "navigation";
    case "prototype":
    case "prototype-diagram":
    case "prototype-interface":
    case "interface-relation":
      return "prototype";
    case "analysis":
    case "analysis-sequence":
    case "requirement-analysis":
    case "requirement-analysis-sequence":
    case "sequence-analysis":
      return "analysis";
    case "architecture":
    case "overall-architecture":
    case "package":
    case "package-diagram":
      return "architecture";
    case "sequence":
    case "sequence-diagram":
    case "usecase-realization":
    case "use-case-realization":
      return "sequence";
    case "component":
    case "component-diagram":
    case "component-relationship":
    case "component-relation":
      return "component";
    case "table":
    case "database":
    case "database-design":
    case "table-diagram":
      return "table";
    default:
      return "";
  }
}

function refEntryKey(
  ref: Pick<ModelElementRef, "diagramKind" | "elementId" | "modelId">,
) {
  return refKey(ref.diagramKind, ref.elementId, "modelId" in ref ? ref.modelId : undefined);
}

function addRef(
  refs: ModelElementRef[],
  diagramKind: string,
  elementId: unknown,
  elementKind: string,
  label: unknown,
  modelId?: string,
) {
  const id = compactString(elementId);
  if (!id) return;
  refs.push({
    modelId: compactString(modelId) || undefined,
    diagramKind: diagramKind as ModelElementRef["diagramKind"],
    elementId: id,
    elementKind,
    label: compactString(label) || id,
  });
}

function activityNodeKind(nodeType: unknown) {
  switch (nodeType) {
    case "object": return "object-node";
    case "flow_final": return "flow-final-node";
    case "activity":
      return "activity";
    case "decision":
      return "decision";
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

function prototypeNodeKind(nodeType: unknown) {
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

function isBusinessElementKind(kind: string) {
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

export function collectModelRefs(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
): RefMaps {
  const refs: ModelElementRef[] = [];
  for (const model of models) {
    const diagramKind = model.diagramKind;
    const modelId = compactString((model as unknown as Record<string, unknown>).modelId);
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
    const pinOwners = new Map<string, string>();
    if (model.diagramKind === "activity") for (const node of model.nodes) if (node.type === "activity") for (const pin of [...node.inputPins ?? [], ...node.outputPins ?? []]) pinOwners.set(pin.id, node.id);
    for (const [key, defaultKind] of listKeys) {
      for (const item of ensureArray(record[key])) {
        if (!isPlainRecord(item)) continue;
        const kind =
          key === "nodes" && diagramKind === "activity"
            ? activityNodeKind(item.type)
            : key === "nodes" && (diagramKind === "prototype" || diagramKind === "navigation")
              ? prototypeNodeKind(item.nodeType)
              : defaultKind;
        const beforeCount = refs.length;
        if (isBusinessElementKind(kind)) {
          addRef(refs, diagramKind, item.id, kind, item.name ?? item.label, modelId);
        }
        if (refs.length > beforeCount) {
          businessElementIds.add(refs.at(-1)!.elementId);
        }
        if (key === "tables") {
          for (const column of ensureArray(item.columns)) {
            if (!isPlainRecord(column)) continue;
            const tableId = compactString(item.id);
            const columnId = compactString(column.id);
            if (!tableId || !columnId) continue;
            addRef(
              refs,
              diagramKind,
              `${tableId}.${columnId}`,
              "table-column",
              `${compactString(item.name) || tableId}.${compactString(column.name) || columnId}`,
              modelId,
            );
            businessElementIds.add(`${tableId}.${columnId}`);
          }
        }
      }
    }

    for (const relationship of ensureArray(record.relationships)) {
      if (!isPlainRecord(relationship)) continue;
      if (
        diagramKind === "activity" &&
        (!businessElementIds.has(pinOwners.get(compactString(relationship.sourceId)) ?? compactString(relationship.sourceId)) ||
          !businessElementIds.has(pinOwners.get(compactString(relationship.targetId)) ?? compactString(relationship.targetId)))
      ) {
        continue;
      }
      addRef(
        refs,
        diagramKind,
        relationship.id,
        "relationship",
        relationship.label ?? `${compactString(relationship.sourceId)} -> ${compactString(relationship.targetId)}`,
        modelId,
      );
    }
  }

  const byKey = new Map<string, ModelElementRef>();
  const byId = new Map<string, ModelElementRef>();
  for (const ref of refs) {
    byKey.set(refEntryKey(ref), ref);
    byId.set(ref.elementId.toLowerCase(), ref);
  }
  return { refs: Array.from(byKey.values()), byKey, byId };
}

function relationshipEndpointIds(
  relationship: Record<string, unknown>,
) {
  return [
    compactString(relationship.sourceId || relationship.sourceTableId),
    compactString(relationship.targetId || relationship.targetTableId),
  ].filter(Boolean);
}

function collectRelationshipEndpointRefs(
  models: Array<DiagramModelSpec | DesignDiagramModelSpec>,
) {
  const refs = collectModelRefs(models);
  const endpointsByRelationship = new Map<string, ModelElementRef[]>();

  for (const model of models) {
    const diagramKind = model.diagramKind;
    const record = model as unknown as Record<string, unknown>;
    for (const relationship of ensureArray(record.relationships)) {
      if (!isPlainRecord(relationship)) continue;
      const relationshipId = compactString(relationship.id);
      if (!relationshipId) continue;
      const relationshipRef = refs.byKey.get(refKey(diagramKind, relationshipId));
      if (!relationshipRef) continue;
      const endpoints = relationshipEndpointIds(relationship)
        .map((id) => refs.byKey.get(refKey(diagramKind, id)))
        .filter((ref): ref is ModelElementRef => Boolean(ref));
      if (endpoints.length > 0) {
        endpointsByRelationship.set(refEntryKey(relationshipRef), endpoints);
      }
    }
  }

  return endpointsByRelationship;
}

function resolveRef(raw: unknown, maps: RefMaps) {
  if (!isPlainRecord(raw)) return null;
  const diagramKind = normalizeTraceabilityDiagramKind(
    raw.diagramKind ?? raw.diagram ?? raw.diagramType ?? raw.modelKind,
  );
  const elementId = compactString(
    raw.elementId ??
      raw.elementID ??
      raw.element_id ??
      raw.refId ??
      raw.sourceId ??
      raw.targetId ??
      raw.id,
  );
  const modelId = compactString(raw.modelId ?? raw.modelID ?? raw.model_id);
  if (!diagramKind || !elementId) return null;
  const direct = maps.byKey.get(refKey(diagramKind, elementId, modelId || undefined));
  if (direct) return direct;
  if (modelId) return null;
  const candidates = maps.refs.filter(
    (ref) =>
      ref.diagramKind === diagramKind &&
      ref.elementId.toLowerCase() === elementId.toLowerCase(),
  );
  return candidates.length === 1 ? candidates[0] : null;
}

function missingRefsForTargets(
  refs: ModelElementRef[],
  coveredRefs: Iterable<ModelElementRef>,
) {
  const coveredKeys = new Set(
    Array.from(coveredRefs, (ref) => refEntryKey(ref)),
  );
  return refs.filter((ref) => !coveredKeys.has(refEntryKey(ref)));
}

export function formatTraceabilityMissingRefs(
  scope: "requirement" | "design",
  missingRefs: ModelElementRef[],
) {
  const label = scope === "requirement" ? "需求元素" : "设计元素";
  const preview = missingRefs
    .slice(0, 8)
    .map((ref) =>
      [
        ref.modelId ? `${ref.modelId} |` : "",
        `${ref.diagramKind}:${ref.elementId}`,
        ref.label ? `| ${ref.label}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("、");
  const suffix = missingRefs.length > 8 ? ` 等 ${missingRefs.length} 个` : "";
  return `缺少 ${missingRefs.length} 个${label}映射：${preview}${suffix}`;
}

export function normalizeRequirementTraceability(
  raw: unknown,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
): RequirementModelTraceabilityEntry[] {
  return normalizeRequirementTraceabilityWithCoverage(raw, rules, models).traceability;
}

export function normalizeRequirementTraceabilityWithCoverage(
  raw: unknown,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
): RequirementTraceabilityCoverageResult {
  const validRules = new Set(rules.map((rule) => rule.id.toLowerCase()));
  const requirementRefs = collectModelRefs(models);
  const traceability = ensureArray(raw).flatMap((entry) => {
    if (!isPlainRecord(entry)) return [];
    const ruleId = compactString(entry.ruleId);
    if (!ruleId || !validRules.has(ruleId.toLowerCase())) return [];
    const target = resolveRef(entry.target, requirementRefs);
    return target
      ? [
          {
            ruleId,
            target,
            mappingSource: normalizeRequirementMappingSource(entry.mappingSource),
            reviewStatus: normalizeReviewStatus(entry.reviewStatus),
            confidence: normalizeConfidence(entry.confidence),
            rationale: compactString(entry.rationale) || undefined,
          },
        ]
      : [];
  });
  const missingTargets = missingRefsForTargets(
    requirementRefs.refs,
    traceability.map((entry) => entry.target),
  );
  return { traceability, missingTargets };
}

function scoreRequirementRuleForTarget(
  rule: RequirementRule,
  target: ModelElementRef,
) {
  const ruleText = `${rule.id} ${rule.category} ${rule.text}`.toLowerCase();
  const targetLabel = target.label.toLowerCase();
  const targetId = target.elementId.toLowerCase();
  let score = rule.relatedDiagrams.some((diagram) => diagram === target.diagramKind)
    ? 10
    : 0;
  if (targetLabel && ruleText.includes(targetLabel)) score += 8;
  if (targetId && ruleText.includes(targetId)) score += 6;
  for (const token of targetLabel.split(/[\s:：,，.。;；/\\|_\-]+/)) {
    if (token.length >= 2 && ruleText.includes(token)) score += 2;
  }
  return score;
}

export function autoFillRequirementTraceability(
  missingTargets: ModelElementRef[],
  rules: RequirementRule[],
): RequirementModelTraceabilityEntry[] {
  if (rules.length === 0) return [];
  return missingTargets.flatMap((target, targetIndex): RequirementModelTraceabilityEntry[] => {
    const candidates = rules.filter((rule) =>
      rule.relatedDiagrams.some((diagram) => diagram === target.diagramKind),
    );
    const fallback =
      candidates[targetIndex % Math.max(candidates.length, 1)] ??
      rules[targetIndex % rules.length];
    if (!fallback) return [];
    const scored = (candidates.length > 0 ? candidates : rules).reduce(
      (current, rule) =>
        scoreRequirementRuleForTarget(rule, target) >
        scoreRequirementRuleForTarget(current, target)
          ? rule
          : current,
      fallback,
    );
    const best =
      scoreRequirementRuleForTarget(scored, target) > 10 ? scored : fallback;
    const deterministic = scoreRequirementRuleForTarget(best, target) > 10;
    return [
      {
        ruleId: best.id,
        target,
        // Text similarity is a suggested link even when its score is high.
        mappingSource: "auto-filled-pending-review",
        reviewStatus: "pending",
        confidence: deterministic ? "medium" : "low",
        rationale: deterministic
          ? "由需求规则文本与模型元素名称相似度建立映射。"
          : "由需求规则关联图类型自动建立候选映射，需复核。",
      },
    ];
  });
}

export function normalizeDesignTraceability(
  raw: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
): DesignModelTraceabilityEntry[] {
  return normalizeDesignTraceabilityWithCoverage(
    raw,
    designModels,
    requirementModels,
  ).traceability;
}

export function normalizeDesignTraceabilityWithCoverage(
  raw: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
): DesignTraceabilityCoverageResult {
  const designRefs = collectModelRefs(designModels);
  return normalizeDesignTraceabilityForSources(
    raw,
    designRefs.refs,
    requirementModels,
  );
}

export function normalizeDesignTraceabilityForSources(
  raw: unknown,
  requiredSources: ModelElementRef[],
  requirementModels: DiagramModelSpec[],
): DesignTraceabilityCoverageResult {
  const designRefs = mapsForRefs(requiredSources);
  const requirementRefs = collectModelRefs(requirementModels);
  const traceability = ensureArray(raw).flatMap((entry) => {
    if (!isPlainRecord(entry)) return [];
    const source = resolveRef(entry.source, designRefs);
    if (!source) return [];
    const targets = ensureArray(entry.targets)
      .map((target) => resolveRef(target, requirementRefs))
      .filter((target): target is ModelElementRef => Boolean(target));
    const upstreamDesignRefs = ensureArray(entry.upstreamDesignRefs)
      .filter(isPlainRecord)
      .flatMap((ref): ModelElementRef[] => {
        const diagramKind = compactString(ref.diagramKind);
        const elementId = compactString(ref.elementId ?? ref.id);
        const elementKind = compactString(ref.elementKind);
        const label = compactString(ref.label);
        if (!diagramKind || !elementId || !elementKind || !label) return [];
        return [
          {
            modelId: compactString(ref.modelId) || undefined,
            diagramKind: diagramKind as ModelElementRef["diagramKind"],
            elementId,
            elementKind,
            label,
          },
        ];
      });
    return targets.length > 0
      ? [
          {
            source,
            targets,
            upstreamDesignRefs:
              upstreamDesignRefs.length > 0 ? upstreamDesignRefs : undefined,
            mappingSource: normalizeMappingSource(entry.mappingSource),
            reviewStatus: normalizeReviewStatus(entry.reviewStatus),
            confidence: normalizeConfidence(entry.confidence),
            rationale: compactString(entry.rationale) || undefined,
          },
        ]
      : [];
  });
  const missingSources = missingRefsForTargets(
    requiredSources,
    traceability.map((entry) => entry.source),
  );
  return { traceability, missingSources };
}

function mapsForRefs(refs: ModelElementRef[]): RefMaps {
  const byKey = new Map<string, ModelElementRef>();
  const byId = new Map<string, ModelElementRef>();
  for (const ref of refs) {
    byKey.set(refEntryKey(ref), ref);
    byId.set(ref.elementId.toLowerCase(), ref);
  }
  return { refs: Array.from(byKey.values()), byKey, byId };
}

export function deriveDesignRelationshipTraceability(
  current: DesignModelTraceabilityEntry[],
  designModels: DesignDiagramModelSpec[],
) {
  const endpointRefs = collectRelationshipEndpointRefs(designModels);
  const designRefs = collectModelRefs(designModels);
  const bySource = new Map<string, DesignModelTraceabilityEntry>();
  for (const entry of current) {
    bySource.set(refEntryKey(entry.source), entry);
  }

  const derived: DesignModelTraceabilityEntry[] = [];
  for (const [relationshipKey, endpoints] of endpointRefs) {
    if (bySource.has(relationshipKey)) continue;
    const targets = new Map<string, ModelElementRef>();
    for (const endpoint of endpoints) {
      const endpointTrace = bySource.get(refEntryKey(endpoint));
      for (const target of endpointTrace?.targets ?? []) {
        targets.set(refEntryKey(target), target);
      }
    }
    if (targets.size === 0) continue;
    const relationshipRef = designRefs.byKey.get(relationshipKey);
    if (!relationshipRef) continue;
    derived.push({
      source: relationshipRef,
      targets: Array.from(targets.values()),
      mappingSource: "derived-from-endpoints",
      rationale: "由关系两端设计元素的需求映射合并推导",
    });
  }

  return mergeDesignTraceability(current, derived);
}

export function deriveUpstreamDesignRefsFromTraceability(
  current: DesignModelTraceabilityEntry[],
) {
  const sequenceSourcesByTarget = new Map<string, ModelElementRef[]>();
  for (const entry of current) {
    if (entry.source.diagramKind !== "sequence") continue;
    for (const target of entry.targets) {
      const key = refEntryKey(target);
      sequenceSourcesByTarget.set(key, [
        ...(sequenceSourcesByTarget.get(key) ?? []),
        entry.source,
      ]);
    }
  }
  if (sequenceSourcesByTarget.size === 0) return current;

  return current.map((entry) => {
    if (entry.source.diagramKind === "sequence") return entry;
    const upstreamDesignRefs = new Map<string, ModelElementRef>();
    for (const ref of entry.upstreamDesignRefs ?? []) {
      upstreamDesignRefs.set(refEntryKey(ref), ref);
    }
    for (const target of entry.targets) {
      for (const source of sequenceSourcesByTarget.get(refEntryKey(target)) ?? []) {
        upstreamDesignRefs.set(refEntryKey(source), source);
      }
    }
    if (upstreamDesignRefs.size === (entry.upstreamDesignRefs?.length ?? 0)) {
      return entry;
    }
    return {
      ...entry,
      upstreamDesignRefs: Array.from(upstreamDesignRefs.values()),
      mappingSource: entry.mappingSource ?? "derived-from-endpoints",
      rationale:
        entry.rationale ??
        "由共享需求元素映射补齐与用例实现设计的上游追踪关系",
    };
  });
}

export function mergeRequirementTraceability(
  current: RequirementModelTraceabilityEntry[],
  patch: RequirementModelTraceabilityEntry[],
) {
  const merged = new Map<string, RequirementModelTraceabilityEntry>();
  for (const entry of [...current, ...patch]) {
    merged.set(
      `${entry.ruleId.toLowerCase()}:${refEntryKey(entry.target)}`,
      entry,
    );
  }
  return Array.from(merged.values());
}

export function mergeDesignTraceability(
  current: DesignModelTraceabilityEntry[],
  patch: DesignModelTraceabilityEntry[],
) {
  const merged = new Map<string, DesignModelTraceabilityEntry>();
  for (const entry of [...current, ...patch]) {
    const key = refEntryKey(entry.source);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      continue;
    }
    const targets = new Map<string, ModelElementRef>();
    for (const target of [...existing.targets, ...entry.targets]) {
      targets.set(refEntryKey(target), target);
    }
    const upstreamDesignRefs = new Map<string, ModelElementRef>();
    for (const ref of [
      ...(existing.upstreamDesignRefs ?? []),
      ...(entry.upstreamDesignRefs ?? []),
    ]) {
      upstreamDesignRefs.set(refEntryKey(ref), ref);
    }
    merged.set(key, {
      source: existing.source,
      targets: Array.from(targets.values()),
      upstreamDesignRefs:
        upstreamDesignRefs.size > 0
          ? Array.from(upstreamDesignRefs.values())
          : undefined,
      mappingSource: existing.mappingSource ?? entry.mappingSource,
      reviewStatus: existing.reviewStatus ?? entry.reviewStatus,
      confidence: existing.confidence ?? entry.confidence,
      rationale: existing.rationale ?? entry.rationale,
    });
  }
  return Array.from(merged.values());
}
