// Parses design models losslessly; relational views are derived only from validated constraints.
import { designDiagramModelsResultSchema, assertValidModel, validateModelInput, ModelSemanticError, deriveTableModel, type DiagramModelSpec } from "@uml-platform/contracts";
import { readGeneratedDesignSources } from "../traceability/generated-sources.js";
import { ensureArray, isPlainRecord, parseJson } from "../json/parse-json.js";
import { normalizeModelInput, omitModelNullValues as omitNullValues } from "../diagrams/model-input.js";

export function parseDesignDiagramModelsResult(
  value: string,
  requirementModels: DiagramModelSpec[] = [],
) {
  const parsed = parseJson<unknown>(value);
  const result = parseDesignDiagramModelsOnlyFromParsed(parsed);
  const designModelTraceability = readGeneratedDesignSources(isPlainRecord(parsed) ? omitNullValues(parsed.designModelTraceability) : undefined, result.models, requirementModels);
  return { ...result, designModelTraceability };
}

function parseDesignDiagramModelsOnlyFromParsed(parsed: unknown) {
  const cleaned = omitNullValues(parsed);
  const normalized = isPlainRecord(cleaned)
    ? {
        ...cleaned,
        models: ensureArray(cleaned.models).map(normalizeModelInput),
      }
    : cleaned;
  if (isPlainRecord(normalized)) {
    // Empty provider placeholders contain no model content; preserve every substantive record and its original index.
    const models = ensureArray(normalized.models);
    const issues = models.flatMap((model, index) => isPlainRecord(model) && !Object.keys(model).length ? []
      : validateModelInput(model, "design").map(issue => ({ ...issue, responsePath: `models.${index}.${issue.path}` })));
    if (issues.length) throw new ModelSemanticError(issues);
    normalized.models = models.filter(model => !(isPlainRecord(model) && !Object.keys(model).length));
  }
  const result = designDiagramModelsResultSchema
    .omit({ designModelTraceability: true })
    .parse(normalized);
  if (result.models.length === 0) {
    throw new Error("generate_design_models must return at least one model");
  }
  for (const model of result.models) assertValidModel(model, "design");
  return { ...result, models: result.models.map((model) => model.diagramKind === "table" ? deriveTableModel(model) : model) };
}
