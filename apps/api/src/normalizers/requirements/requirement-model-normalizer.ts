// Parses generated requirement models against their current Schema without semantic rewriting.
import { diagramModelsResultSchema, unknownContractFields, type RequirementRule } from "@uml-platform/contracts";
import { readGeneratedRequirementSources } from "../traceability/generated-sources.js";
import { ensureArray, isPlainRecord, parseJson } from "../json/parse-json.js";
import { normalizeModelInput, omitModelNullValues as omitNullValues } from "../diagrams/model-input.js";

export function parseRequirementDiagramModelsResult(
  value: string,
  rules?: RequirementRule[],
) {
  const parsed = parseJson<unknown>(value);
  const result = parseRequirementDiagramModelsOnlyFromParsed(parsed);
  const requirementModelTraceability = readGeneratedRequirementSources(isPlainRecord(parsed) ? omitNullValues(parsed.requirementModelTraceability) : undefined, result.models, rules);
  return { ...result, requirementModelTraceability };
}

function parseRequirementDiagramModelsOnlyFromParsed(
  parsed: unknown,
) {
  const cleaned = omitNullValues(parsed);
  const normalized = isPlainRecord(cleaned)
    ? {
        ...cleaned,
        models: ensureArray(cleaned.models).map((model) =>
          normalizeModelInput(model),
        ),
      }
    : cleaned;
  const schema = diagramModelsResultSchema.omit({ requirementModelTraceability: true });
  const unknown = unknownContractFields(schema, isPlainRecord(normalized) ? Object.fromEntries(Object.entries(normalized).filter(([key]) => key !== "requirementModelTraceability")) : normalized);
  if (unknown.length) throw new Error(`unsupported-field: ${unknown.join(", ")}`);
  const result = diagramModelsResultSchema
    .omit({ requirementModelTraceability: true })
    .parse(normalized);
  if (result.models.length === 0) {
    throw new Error("generate_models must return at least one model");
  }
  return result;
}

export function parseRequirementDiagramModelsOnly(value: string) {
  return parseRequirementDiagramModelsOnlyFromParsed(parseJson<unknown>(value));
}

// Source coverage is checked by backend candidate validation before this Schema-only parser is called.
export function parseGeneratedAnalysisModels(value: string) {
  return parseRequirementDiagramModelsOnly(value);
}
