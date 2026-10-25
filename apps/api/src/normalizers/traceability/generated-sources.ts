// Reads source declarations from complete model responses; omissions remain errors in the model conversation.
import { designModelTraceabilityEntrySchema, requirementModelTraceabilityEntrySchema, type DiagramModelSpec, type DesignDiagramModelSpec, type RequirementRule } from "@uml-platform/contracts";
import { collectModelRefs } from "@uml-platform/contracts";
import { isPlainRecord } from "../json/parse-json.js";
import { repairDiagnostics } from "../structured-output/repair-diagnostics.js";
import { z } from "zod";
import { modelSourceElements, resolveSourceElement } from "./model-source-elements.js";

type SourceModel = DiagramModelSpec | DesignDiagramModelSpec;

export function referenceableElementIds(model: SourceModel) {
  return [...new Set(modelSourceElements(model).flatMap(element => [element.id, element.elementId]))];
}

export const modelSourceIdentity = (model: SourceModel) => ({ modelId: model.modelId, diagramKind: model.diagramKind });
export const modelSourceCatalog = (models: SourceModel[]) => models.map(model => ({ ...modelSourceIdentity(model), elementIds: referenceableElementIds(model) }));
export const ruleSources = (rules: RequirementRule[]) => rules.map(rule => ({ ruleId: rule.id, type: rule.type, text: rule.text }));

function sourceSchemaDiagnostics<T>(read: () => T, raw: unknown, models: SourceModel[], upstream?: SourceModel[], rules?: RequirementRule[]): T {
  try { return read(); } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    // Schema failures occur before mapping validation. Preserve their original issues
    // while adding the same scoped evidence, including empty or absent declarations.
    const diagnostics = repairDiagnostics(error).map(issue => {
      const path = issue.path.split(".").slice(1);
      const binding: unknown = Array.isArray(raw) ? raw[Number(path[0])] : undefined;
      let ref: unknown;
      if (isPlainRecord(binding)) {
        const field = path[1];
        if (field === "source" || field === "target") ref = binding[field];
        else if (field === "targets") {
          const targets = binding[field];
          if (Array.isArray(targets)) ref = targets[Number(path[2])];
        }
      }
      const scope = upstream && path[1] !== "source" ? upstream : models;
      const actualModels = isPlainRecord(ref) && ref.modelId ? scope.filter(model => model.modelId === ref.modelId) : [];
      const value = path.reduce<unknown>((value, part) => isPlainRecord(value) || Array.isArray(value) ? (value as Record<string, unknown>)[part] : undefined, raw);
      return { ...issue, actual: { value, reference: ref, models: actualModels.map(modelSourceIdentity) },
        expected: { legalSources: modelSourceCatalog(actualModels.length ? actualModels : scope),
          ...(upstream && !path[1] ? { currentModels: modelSourceCatalog(models) } : {}),
          ...(rules ? { legalRuleSources: models
            .map(model => ({ ...modelSourceIdentity(model), rules: ruleSources(rules) })) } : {}) } };
    });
    throw Object.assign(error, { diagnostics });
  }
}

function sourceEntries(raw: unknown, field: string) {
  const message = `${field} 必须随首次生成返回`;
  // Keep the absolute envelope path so a new missing field replaces the previous repair diagnosis.
  return parseSourceField(z.array(z.unknown(), { error: message }), raw, field);
}

// Keep envelope-relative locations after parsing a field with the current Zod API.
function parseSourceField<T extends z.ZodTypeAny>(schema: T, raw: unknown, field: string): z.output<T> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new z.ZodError(result.error.issues.map(issue => ({ ...issue, path: [field, ...issue.path] })));
}

function reference(value: unknown, models: Array<DiagramModelSpec | DesignDiagramModelSpec>) {
  if (!isPlainRecord(value)) return value;
  // Fill display metadata only for an exact, unambiguous identity; never choose a source.
  const matches = models.filter(model => model.diagramKind === value.diagramKind && (!value.modelId || model.modelId === value.modelId))
    .flatMap(model => {
      const element = resolveSourceElement(model, String(value.elementId));
      if (!element) return [];
      const known = collectModelRefs([model], true).refs.find(ref => ref.elementId === element.elementId || ref.elementId === element.id);
      return [{ modelId: model.modelId, elementKind: known?.elementKind ?? element.collection, label: element.name }];
    });
  return matches.length === 1 ? { ...matches[0], ...value } : value;
}

export function readGeneratedRequirementSources(raw: unknown, models: DiagramModelSpec[], rules?: RequirementRule[]) {
  return sourceSchemaDiagnostics(() => {
    const entries = sourceEntries(raw, "requirementModelTraceability");
    return parseSourceField(z.array(requirementModelTraceabilityEntrySchema), entries.map(entry => isPlainRecord(entry)
      ? { ...entry, target: reference(entry.target, models) } : entry), "requirementModelTraceability");
  }, raw, models, undefined, rules);
}

export function readGeneratedDesignSources(raw: unknown, models: DesignDiagramModelSpec[], upstream: SourceModel[]) {
  return sourceSchemaDiagnostics(() => {
    const entries = sourceEntries(raw, "designModelTraceability");
    return parseSourceField(z.array(designModelTraceabilityEntrySchema), entries.map(entry => isPlainRecord(entry)
      ? { ...entry, source: reference(entry.source, models), targets: Array.isArray(entry.targets) ? entry.targets.map(target => reference(target, upstream)) : entry.targets } : entry), "designModelTraceability");
  }, raw, models, upstream);
}
