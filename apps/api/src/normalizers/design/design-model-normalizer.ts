// Parses design models losslessly; relational views are derived only from validated constraints.
import { designDiagramModelsResultSchema, unknownContractFields, deriveTableModel, type DiagramModelSpec, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { readGeneratedDesignSources } from "../traceability/generated-sources.js";
import { ensureArray, isPlainRecord, parseJson } from "../json/parse-json.js";
import { normalizeModelInput, omitModelNullValues as omitNullValues } from "../diagrams/model-input.js";

export function parseDesignDiagramModelsResult(
  value: string,
  requirementModels: Array<DiagramModelSpec | DesignDiagramModelSpec> = [],
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
  const schema = designDiagramModelsResultSchema.omit({ designModelTraceability: true });
  const unknown = unknownContractFields(schema, isPlainRecord(normalized) ? Object.fromEntries(Object.entries(normalized).filter(([key]) => key !== "designModelTraceability")) : normalized);
  if (unknown.length) throw new Error(`unsupported-field: ${unknown.join(", ")}`);
  const result = designDiagramModelsResultSchema
    .omit({ designModelTraceability: true })
    .parse(normalized);
  if (result.models.length === 0) {
    throw new Error("generate_design_models must return at least one model");
  }
  return { ...result, models: result.models.map((model) => model.diagramKind === "table" ? deriveTableModel(model) : model) };
}
