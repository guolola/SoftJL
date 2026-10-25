// Checks JSON/Schema and complete real upstream provenance without semantic inference or candidate mutation.
import {
  diagramModelsResultSchema, designDiagramModelsResultSchema, diagramModelSpecSchema, designDiagramModelSpecSchema,
  unknownContractFields, contractResponseSchema, deriveTableModel,
  type DiagramModelSpec, type DesignDiagramModelSpec, type RequirementRule,
} from "@uml-platform/contracts";
import type { ZodTypeAny } from "zod";
import { omitModelNullValues, normalizeModelInput } from "../diagrams/model-input.js";
import { repairDiagnostics, type RepairDiagnostic } from "../structured-output/repair-diagnostics.js";
import { readGeneratedRequirementSources, readGeneratedDesignSources, referenceableElementIds } from "../traceability/generated-sources.js";
import { assertRequirementMappings, assertDesignMappings } from "../traceability/model-mapping-validation.js";
import { modelSourceElements, resolveSourceElement } from "../traceability/model-source-elements.js";
import { normalizeContractNulls } from "../structured-output/contract-nulls.js";

export class ModelCandidateValidationError extends Error {
  constructor(readonly diagnostics: RepairDiagnostic[]) {
    super(diagnostics.map(issue => `[${issue.code ?? "contract"}] ${issue.path}: ${issue.message}`).join("\n"));
    this.name = "ModelCandidateValidationError";
  }
}

const row = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
function capture(issues: RepairDiagnostic[], check: () => unknown) {
  try { check(); } catch (error) {
    const diagnostics = repairDiagnostics(error);
    issues.push(...(diagnostics.length ? diagnostics : [{ code: "contract", path: "", message: error instanceof Error ? error.message : String(error) }]));
  }
}
function finish(issues: RepairDiagnostic[]) {
  const byPath = new Map<string, RepairDiagnostic>();
  for (const issue of issues) {
    const key = JSON.stringify([issue.code, issue.path, issue.modelId, issue.elementId]);
    const previous = byPath.get(key);
    if (!previous || issue.expected && !previous.expected) byPath.set(key, issue);
  }
  const unique = [...byPath.values()];
  if (unique.length) throw new ModelCandidateValidationError(unique);
}
function schemaIssues(schema: ZodTypeAny, value: unknown, issues: RepairDiagnostic[]) {
  issues.push(...unknownContractFields(schema, value).map(path => ({ code: "unsupported-field", path, message: "当前输出契约不支持此字段" })));
  capture(issues, () => schema.parse(value));
}

function ruleReferenceIssues(value: unknown, rules: ReadonlyArray<{ id: string }>, issues: RepairDiagnostic[], path = "", owner?: { elementId: string; name: string }) {
  if (Array.isArray(value)) { value.forEach((item, index) => ruleReferenceIssues(item, rules, issues, path ? `${path}.${index}` : String(index), owner)); return; }
  if (!value || typeof value !== "object") return;
  const record = row(value);
  if (typeof record.id === "string") owner = { elementId: owner ? `${owner.elementId}.${record.id}` : record.id, name: String(record.name ?? record.label ?? record.id) };
  const ids = new Set(rules.map(rule => rule.id));
  for (const [key, item] of Object.entries(value)) {
    const field = path ? `${path}.${key}` : key;
    const refs = key === "sourceRequirementIds" ? array(item) : key === "sourceRequirementId" ? [item] : [];
    refs.forEach((id, index) => {
      if (!ids.has(id)) issues.push({ code: "mapping-rule-missing", path: key === "sourceRequirementId" ? field : `${field}.${index}`, ...owner,
        reason: `上游需求规则 ${String(id)} 不存在`, message: `来源规则 ${String(id)} 不存在于当前任务`, actual: id, expected: { legalSources: rules } });
    });
    ruleReferenceIssues(item, rules, issues, field, owner);
  }
}

function upstreamRuleReferences(models: unknown[]): Array<{ id: string }> {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      const refs = key === "sourceRequirementIds" ? array(item) : key === "sourceRequirementId" ? [item] : [];
      refs.forEach(id => { if (typeof id === "string") ids.add(id); });
      visit(item);
    }
  };
  visit(models);
  return [...ids].map(id => ({ id }));
}

function modelReferenceInScope(reference: unknown, models: Array<DiagramModelSpec | DesignDiagramModelSpec>) {
  const ref = row(reference);
  return models.some(model => model.diagramKind === ref.diagramKind &&
    (model.modelId ?? model.diagramKind) === (ref.modelId ?? ref.diagramKind) && Boolean(resolveSourceElement(model, ref.elementId)));
}

export function assertGeneratedModelCandidate(raw: string, input: {
  stage: "requirements" | "design"; kinds: string[]; rules?: RequirementRule[];
  upstream?: Array<DiagramModelSpec | DesignDiagramModelSpec>; existingMappings?: unknown[];
}) {
  const value = row(omitModelNullValues(JSON.parse(raw)));
  const issues: RepairDiagnostic[] = [];
  const schema = input.stage === "requirements" ? diagramModelsResultSchema : designDiagramModelsResultSchema;
  schemaIssues(schema, value, issues);
  // Embedded rule IDs on downstream models may only be inherited from bound sources;
  // a project-wide baseline must never authorize a reference outside this task.
  ruleReferenceIssues(value.models, input.stage === "design" || input.upstream?.length
    ? upstreamRuleReferences(input.upstream ?? []) : input.rules ?? [], issues, "models");
  const models: Array<DiagramModelSpec | DesignDiagramModelSpec> = [];
  for (const [index, item] of array(value.models).entries()) {
    const model = normalizeModelInput(item);
    const parsed = (input.stage === "requirements" ? diagramModelSpecSchema : designDiagramModelSpecSchema).safeParse(model);
    if (parsed.success) models.push(parsed.data.diagramKind === "table" ? deriveTableModel(parsed.data) : parsed.data);
    if (!input.kinds.includes(row(model).diagramKind)) issues.push({ code: "task-model-kind", path: `models.${index}.diagramKind`, message: `本次仅允许 ${input.kinds.join("、")} 模型` });
  }
  if (!array(value.models).length) issues.push({ code: "task-model-missing", path: "models", message: "本次必须返回至少一个请求的模型" });
  for (const kind of new Set(input.kinds)) if (array(value.models).filter(model => row(model).diagramKind === kind).length !== 1) {
    issues.push({ code: "task-model-count", path: "models", message: `本次必须且只能返回一个 ${kind} 模型` });
  }
  // Query the supplied snapshot's existing records only to explain identity, never to supply missing provenance.
  const existing = (input.existingMappings ?? []).filter(entry => models.some(model => {
    const ref = row(entry).source ?? row(entry).target;
    return ref?.modelId === model.modelId && ref?.diagramKind === model.diagramKind;
  })).filter(entry => input.stage === "requirements"
    ? (input.rules ?? []).some(rule => rule.id === row(entry).ruleId)
    : array(row(entry).targets).every(ref => modelReferenceInScope(ref, input.upstream ?? [])));
  if (models.length === array(value.models).length && input.stage === "requirements") {
    capture(issues, () => {
      const typed = models as DiagramModelSpec[];
      const bindings = readGeneratedRequirementSources(value.requirementModelTraceability, typed, input.rules);
      assertRequirementMappings(typed.filter(model => model.diagramKind !== "analysis" || !input.upstream?.length), input.rules ?? [], bindings);
    });
  } else if (models.length === array(value.models).length && input.stage === "design") capture(issues, () => {
    const typed = models as DesignDiagramModelSpec[];
    assertDesignMappings(typed, input.upstream ?? [], readGeneratedDesignSources(value.designModelTraceability, typed, input.upstream ?? []));
  });
  if (input.upstream?.length) models.forEach((model, index) => {
    if (model.diagramKind !== "analysis") return;
    capture(issues, () => assertAnalysisMappings(model, input.upstream!, `models.${index}`));
  });
  for (const issue of issues) if (issue.code?.startsWith("mapping-")) issue.expected = { ...(row(issue.expected)), existingMappings: existing };
  finish(issues);
}

export function assertAnalysisMappings(model: DiagramModelSpec, upstream: Array<DiagramModelSpec | DesignDiagramModelSpec>, path = "") {
  const issues: RepairDiagnostic[] = [];
  for (const element of modelSourceElements(model)) {
    const ids = array(element.value.sourceElementIds);
    const valid = ids.filter(id => upstream.some(source => resolveSourceElement(source, id)));
    for (const id of ids) if (!valid.includes(id)) issues.push({ code: "mapping-element-missing", path: `${path}.${element.path}.sourceElementIds`,
      elementId: element.elementId, name: element.name, reason: `上游元素 ${id} 不存在`, message: `上游元素 ${id} 不存在于本次绑定模型`,
      expected: { legalSources: upstream.flatMap(referenceableElementIds) } });
    if (!valid.length) issues.push(missingElement(element, `${path}.${element.path}.sourceElementIds`, upstream.flatMap(referenceableElementIds)));
  }
  finish(issues);
}

function missingElement(element: ReturnType<typeof modelSourceElements>[number], path: string, legalSources: unknown): RepairDiagnostic {
  return { code: "mapping-coverage-missing", path, elementId: element.elementId, name: element.name,
    reason: "缺少至少一条指向真实上游元素的映射", message: `元素 ${element.elementId}（${element.name}）缺少有效上游映射`, expected: { legalSources } };
}

export function assertFeasibilityCandidate(value: unknown, input: {
  schema: ZodTypeAny; kind: "context" | "business-flow" | "implementation"; rules: RequirementRule[];
  upstream?: unknown[];
}) {
  const cleaned = normalizeContractNulls(value, contractResponseSchema(input.schema));
  const issues: RepairDiagnostic[] = [];
  schemaIssues(input.schema, cleaned, issues);
  const ruleIds = new Set(input.rules.map(rule => rule.id));
  ruleReferenceIssues(cleaned, input.rules, issues);
  const root = row(cleaned);
  if (input.kind === "business-flow") {
    const elements = modelSourceElements(root.model), covered = new Set<string>();
    array(root.traceability).forEach((binding, index) => {
      const target = resolveSourceElement(root.model, binding.targetId);
      if (!ruleIds.has(binding.requirementId)) issues.push({ code: "mapping-rule-missing", path: `traceability.${index}.requirementId`,
        elementId: target?.elementId ?? binding.targetId, name: target?.name ?? binding.targetId, reason: `上游规则 ${binding.requirementId} 不存在`,
        message: `上游规则 ${binding.requirementId} 不存在`, expected: { legalSources: input.rules } });
      if (!target) issues.push({ code: "mapping-element-missing", path: `traceability.${index}.targetId`,
        elementId: binding.targetId, name: binding.targetId, reason: "当前模型中不存在此元素 ID", message: `当前模型中不存在元素 ${binding.targetId}` });
      if (target && ruleIds.has(binding.requirementId)) covered.add(target.elementId);
    });
    for (const element of elements) if (!covered.has(element.elementId)) issues.push(missingElement(element, `model.${element.path}`, input.rules));
  } else {
    // Context and implementation use embedded source IDs on every identified record.
    for (const element of modelSourceElements(root)) {
      const ids = array(element.value.sourceRequirementIds);
      const contextId = element.value.contextExternalSystemId;
      const validContext = typeof contextId === "string" && (input.upstream ?? []).some(source => resolveSourceElement(source, contextId));
      if (typeof contextId === "string" && !validContext) issues.push({ code: "mapping-element-missing", path: `${element.path}.contextExternalSystemId`,
        elementId: element.elementId, name: element.name, reason: `上游元素 ${contextId} 不存在`, message: `上游元素 ${contextId} 不存在` });
      if (!ids.some(id => ruleIds.has(id)) && !validContext) issues.push(missingElement(element, `${element.path}.sourceRequirementIds`, input.rules));
    }
  }
  finish(issues);
}
