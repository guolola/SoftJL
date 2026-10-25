// Validates complete model provenance inside the same generation and repair conversation.
import {
  type DiagramModelSpec, type DesignDiagramModelSpec,
  type ModelElementRef, type RequirementRule, type RequirementModelTraceabilityEntry, type DesignModelTraceabilityEntry,
} from "@uml-platform/contracts";
import { modelSourceElements, resolveSourceElement } from "./model-source-elements.js";
import type { RepairDiagnostic } from "../structured-output/repair-diagnostics.js";
import { referenceableElementIds as elementIds, modelSourceIdentity as identity, modelSourceCatalog as sourceCatalog, ruleSources } from "./generated-sources.js";

type Model = DiagramModelSpec | DesignDiagramModelSpec;
const key = (ref: ModelElementRef) => JSON.stringify([ref.modelId ?? ref.diagramKind, ref.diagramKind, ref.elementId]);

class ModelMappingValidationError extends Error {
  readonly diagnostics: RepairDiagnostic[];

  constructor(diagnostic: RepairDiagnostic | RepairDiagnostic[]) {
    const diagnostics = Array.isArray(diagnostic) ? diagnostic : [diagnostic];
    super(diagnostics.map(issue => `[${issue.code}] ${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ModelMappingValidationError";
    this.diagnostics = diagnostics;
  }
}

function resolve(ref: ModelElementRef, models: Model[]) {
  const matches = models.filter(model => model.diagramKind === ref.diagramKind &&
    (!ref.modelId || model.modelId === ref.modelId) && Boolean(resolveSourceElement(model, ref.elementId)));
  if (matches.length !== 1) return undefined;
  const element = resolveSourceElement(matches[0], ref.elementId)!;
  return { ...ref, modelId: matches[0]!.modelId ?? "", elementId: element.elementId, label: element.name };
}

function assertReference(ref: ModelElementRef, models: Model[], path: string, scope: string, outsideModels: Model[] = []) {
  const resolved = resolve(ref, models);
  if (resolved) return resolved;

  const namedModels = models.filter(model => ref.modelId ? model.modelId === ref.modelId : model.diagramKind === ref.diagramKind);
  const sameKind = namedModels.filter(model => model.diagramKind === ref.diagramKind);
  const outside = outsideModels.filter(model => ref.modelId ? model.modelId === ref.modelId :
    model.diagramKind === ref.diagramKind && elementIds(model).includes(ref.elementId));
  let code: string, field: string, reason: string;
  if (!namedModels.length) {
    code = outside.length ? "mapping-source-out-of-scope" : "mapping-model-missing";
    field = ref.modelId ? ".modelId" : ".diagramKind";
    reason = outside.length ? `模型存在于当前引用范围之外，不能作为${scope}来源` : `本次${scope}中不存在指定模型`;
  } else if (!sameKind.length) {
    code = "mapping-diagram-kind-mismatch"; field = ".diagramKind";
    reason = `引用类型为 ${ref.diagramKind}，模型 ${ref.modelId} 的实际类型为 ${[...new Set(namedModels.map(model => model.diagramKind))].join("、")}`;
  } else if (!sameKind.some(model => elementIds(model).includes(ref.elementId))) {
    code = "mapping-element-missing"; field = ".elementId";
    reason = `指定模型中不存在元素 id ${ref.elementId}；不能用模型 id、步骤顺序号或虚构 id 代替元素 id`;
  } else {
    code = "mapping-reference-ambiguous"; field = ".modelId";
    reason = "多个模型匹配该引用，必须使用可唯一定位真实元素的 modelId、diagramKind 和 elementId";
  }
  throw new ModelMappingValidationError({
    code, path: `${path}${field}`, modelId: ref.modelId, elementId: ref.elementId, name: ref.label, reason,
    message: `${scope}引用无效：${reason}。收到 ${JSON.stringify(ref)}。合法来源见 expected.legalSources，仅核对身份，不能据此猜测业务来源。`,
    actual: { reference: ref, models: namedModels.map(model => ({ ...identity(model), elementExists: elementIds(model).includes(ref.elementId) })), outsideModels: outside.map(identity) },
    expected: { scope, legalSources: sourceCatalog(namedModels.length ? namedModels : models) },
  });
}

function accumulate(issues: RepairDiagnostic[], check: () => void) {
  try { check(); } catch (error) {
    if (!(error instanceof ModelMappingValidationError)) throw error;
    issues.push(...error.diagnostics);
  }
}
function assertCoverage(models: Model[], sources: ModelElementRef[], legalSources: () => unknown) {
  const covered = new Set(sources.map(key));
  const issues = models.flatMap((model, index) => modelSourceElements(model).filter(element => !covered.has(key({
    modelId: model.modelId, diagramKind: model.diagramKind, elementId: element.elementId,
    elementKind: element.collection, label: element.name,
  }))).map(element => ({
    code: "mapping-coverage-missing", path: `models.${index}.${element.path}`,
    modelId: model.modelId, elementId: element.elementId, name: element.name, reason: "缺少至少一条指向真实上游元素的映射",
    message: `元素 ${element.elementId}（${element.name}）缺少有效上游映射`,
    expected: { legalSources: legalSources() },
  })));
  if (issues.length) throw new ModelMappingValidationError(issues);
}

export function assertRequirementMappings(models: DiagramModelSpec[], rules: RequirementRule[], bindings: RequirementModelTraceabilityEntry[]) {
  const byId = new Map(rules.map(rule => [rule.id, rule]));
  const sources: ModelElementRef[] = [], issues: RepairDiagnostic[] = [];
  bindings.forEach((binding, index) => accumulate(issues, () => {
    const path = `requirementModelTraceability.${index}`;
    const ref = assertReference(binding.target, models, `${path}.target`, "当前需求模型");
    if (!byId.has(binding.ruleId)) throw new ModelMappingValidationError({
      code: "mapping-rule-missing", path: `${path}.ruleId`, modelId: ref.modelId,
      elementId: ref.elementId, name: ref.label, reason: `上游需求规则 ${binding.ruleId} 不存在`,
      message: `规则 ${binding.ruleId} 不存在于本次输入，不能作为有效来源`,
      actual: { ruleId: binding.ruleId, target: ref }, expected: { legalSources: ruleSources(rules) },
    });
    sources.push(ref);
  }));
  accumulate(issues, () => assertCoverage(models, sources, () => ruleSources(rules)));
  if (issues.length) throw new ModelMappingValidationError(issues);
}

export function assertDesignMappings(models: DesignDiagramModelSpec[], upstreamModels: Model[], bindings: DesignModelTraceabilityEntry[]) {
  const sources: ModelElementRef[] = [], issues: RepairDiagnostic[] = [];
  bindings.forEach((binding, index) => {
    const path = `designModelTraceability.${index}`;
    let source: ModelElementRef | undefined;
    accumulate(issues, () => { source = assertReference(binding.source, models, `${path}.source`, "当前模型", upstreamModels); });
    let validTargets = 0;
    if (!binding.targets.length) issues.push({
      code: "mapping-targets-empty", path: `${path}.targets`, modelId: binding.source.modelId,
      elementId: source?.elementId ?? binding.source.elementId, name: source?.label ?? binding.source.label, reason: "映射没有上游元素",
      message: "映射必须引用至少一个真实的直接上游元素",
      expected: { scope: "直接上游模型", legalSources: sourceCatalog(upstreamModels) },
    });
    binding.targets.forEach((target, targetIndex) => accumulate(issues, () => {
      assertReference(target, upstreamModels, `${path}.targets.${targetIndex}`, "直接上游模型", models); validTargets++;
    }));
    if (source && validTargets) sources.push(source);
    for (const issue of issues.filter(issue => issue.path.startsWith(`${path}.`))) {
      issue.elementId ??= source?.elementId ?? binding.source.elementId;
      issue.name ??= source?.label ?? binding.source.label;
      issue.reason ??= issue.message;
    }
  });
  accumulate(issues, () => assertCoverage(models, sources, () => sourceCatalog(upstreamModels)));
  if (issues.length) throw new ModelMappingValidationError(issues);
}
