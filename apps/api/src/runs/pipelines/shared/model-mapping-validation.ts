// Validates complete model provenance inside the same generation and repair conversation.
import {
  requirementTypeAppliesToModel, type DiagramModelSpec, type DesignDiagramModelSpec,
  type ModelElementRef, type RequirementRule, type RequirementModelTraceabilityEntry, type DesignModelTraceabilityEntry,
} from "@uml-platform/contracts";
import { collectModelRefs } from "@uml-platform/contracts";

type Model = DiagramModelSpec | DesignDiagramModelSpec;
const key = (ref: ModelElementRef) => JSON.stringify([ref.modelId ?? ref.diagramKind, ref.diagramKind, ref.elementId]);
function containsElement(value: unknown, elementId: string, parentId = ""): boolean {
  if (Array.isArray(value)) return value.some(item => containsElement(item, elementId, parentId));
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  const id = typeof object.id === "string" ? object.id : undefined;
  // Walk the actual model, including nested event flows and structural elements.
  // Qualified IDs preserve current references such as tableId.columnId.
  const qualifiedId = id ? (parentId ? `${parentId}.${id}` : id) : parentId;
  if (id && (id === elementId || qualifiedId === elementId)) return true;
  return Object.values(object).some(child => containsElement(child, elementId, qualifiedId));
}
function resolve(ref: ModelElementRef, models: Model[]) {
  const matches = models.filter(model => model.diagramKind === ref.diagramKind &&
    (!ref.modelId || model.modelId === ref.modelId) && containsElement(model, ref.elementId));
  return matches.length === 1 ? { ...ref, modelId: matches[0]!.modelId ?? "" } : undefined;
}
function assertReference(ref: ModelElementRef, models: Model[], path: string, scope: string) {
  const resolved = resolve(ref, models);
  if (!resolved) throw new Error(`${path}: ${scope}中无法唯一匹配引用 ${JSON.stringify({ modelId: ref.modelId, diagramKind: ref.diagramKind, elementId: ref.elementId })}，请检查对应模型及其中真实存在的元素 id。`);
  return resolved;
}
function assertCoverage(models: Model[], sources: ModelElementRef[], field: string) {
  const covered = new Set(sources.map(key));
  const missing = collectModelRefs(models).refs.filter(ref => !covered.has(key(ref)));
  if (missing.length) throw new Error(`${field} 映射仍缺少 ${missing.length} 个业务元素：${JSON.stringify(missing)}。请返回完整模型和全部有效来源映射。`);
}

export function assertRequirementMappings(models: DiagramModelSpec[], rules: RequirementRule[], bindings: RequirementModelTraceabilityEntry[]) {
  // Analysis models carry use-case sources on their elements instead of direct rule mappings.
  const mappedModels = models.filter(model => model.diagramKind !== "analysis");
  if (!mappedModels.length) return;
  const byId = new Map(rules.map(rule => [rule.id, rule]));
  const sources = bindings.map((binding, index) => {
    const ref = resolve(binding.target, mappedModels), rule = byId.get(binding.ruleId);
    if (!ref || !rule || !requirementTypeAppliesToModel(rule.type, ref.diagramKind as DiagramModelSpec["diagramKind"])) {
      throw new Error(`requirementModelTraceability.${index}：映射引用不存在、需求类型不适用或缺少有效来源`);
    }
    return ref;
  });
  assertCoverage(mappedModels, sources, "requirementModelTraceability");
}

export function assertDesignMappings(models: DesignDiagramModelSpec[], upstreamModels: Model[], bindings: DesignModelTraceabilityEntry[]) {
  const sources = bindings.map((binding, index) => {
    const path = `designModelTraceability.${index}`;
    const ref = assertReference(binding.source, models, `${path}.source`, "当前模型");
    if (!binding.targets.length) {
      throw new Error(`designModelTraceability.${index}：映射必须引用当前模型和真实的直接上游元素`);
    }
    binding.targets.forEach((target, targetIndex) => assertReference(target, upstreamModels, `${path}.targets.${targetIndex}`, "直接上游模型"));
    (binding.upstreamDesignRefs ?? []).forEach((target, targetIndex) => assertReference(target, upstreamModels, `${path}.upstreamDesignRefs.${targetIndex}`, "直接上游模型"));
    return ref;
  });
  assertCoverage(models, sources, "designModelTraceability");
}
