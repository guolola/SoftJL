// Validates complete model provenance inside the same generation and repair conversation.
import {
  requirementTypeAppliesToModel, type DiagramModelSpec, type DesignDiagramModelSpec,
  type ModelElementRef, type RequirementRule, type RequirementModelTraceabilityEntry, type DesignModelTraceabilityEntry,
} from "@uml-platform/contracts";
import { collectModelRefs } from "../../../normalizers/traceability/traceability-normalizer.js";

type Model = DiagramModelSpec | DesignDiagramModelSpec;
const key = (ref: ModelElementRef) => JSON.stringify([ref.modelId ?? ref.diagramKind, ref.diagramKind, ref.elementId]);
function resolve(ref: ModelElementRef, refs: ModelElementRef[]) {
  const matches = refs.filter(item => item.diagramKind === ref.diagramKind && item.elementId === ref.elementId && (!ref.modelId || item.modelId === ref.modelId));
  return matches.length === 1 ? matches[0] : undefined;
}
function assertCoverage(models: Model[], sources: ModelElementRef[], field: string) {
  const covered = new Set(sources.map(key));
  const missing = collectModelRefs(models).refs.filter(ref => !covered.has(key(ref)));
  if (missing.length) throw new Error(`${field} 映射仍缺少 ${missing.length} 个业务元素：${JSON.stringify(missing)}。请返回完整模型和全部有效来源映射。`);
}
function accepted(binding: RequirementModelTraceabilityEntry | DesignModelTraceabilityEntry) {
  return binding.confidence !== "low" && binding.reviewStatus !== "pending" && binding.mappingSource !== "auto-filled-pending-review";
}

export function assertRequirementMappings(models: DiagramModelSpec[], rules: RequirementRule[], bindings: RequirementModelTraceabilityEntry[]) {
  // Analysis models carry use-case sources on their elements instead of direct rule mappings.
  const mappedModels = models.filter(model => model.diagramKind !== "analysis");
  if (!mappedModels.length) return;
  const refs = collectModelRefs(mappedModels, true).refs;
  const byId = new Map(rules.map(rule => [rule.id, rule]));
  const sources = bindings.map((binding, index) => {
    const ref = resolve(binding.target, refs), rule = byId.get(binding.ruleId);
    if (!ref || !rule || !accepted(binding) || !requirementTypeAppliesToModel(rule.type, ref.diagramKind as DiagramModelSpec["diagramKind"])) {
      throw new Error(`requirementModelTraceability.${index}：映射引用不存在、需求类型不适用或缺少有效来源`);
    }
    return ref;
  });
  assertCoverage(mappedModels, sources, "requirementModelTraceability");
}

export function assertDesignMappings(models: DesignDiagramModelSpec[], upstreamModels: Model[], bindings: DesignModelTraceabilityEntry[]) {
  const refs = collectModelRefs(models, true).refs;
  const upstream = collectModelRefs(upstreamModels, true).refs;
  const sources = bindings.map((binding, index) => {
    const ref = resolve(binding.source, refs);
    if (!ref || !accepted(binding) || !binding.targets.length || !binding.targets.every(target => !!resolve(target, upstream)) || !(binding.upstreamDesignRefs ?? []).every(target => !!resolve(target, upstream))) {
      throw new Error(`designModelTraceability.${index}：映射必须引用当前模型和真实的直接上游元素`);
    }
    return ref;
  });
  assertCoverage(models, sources, "designModelTraceability");
}
