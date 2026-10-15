// Parses design models losslessly; relational views are derived only from validated constraints.
import { designDiagramModelsResultSchema, assertValidModel, validateModelInput, ModelSemanticError, deriveTableModel, type DesignDiagramModelSpec, type DiagramModelSpec, type ModelElementRef } from "@uml-platform/contracts";
import { ensureArray, isPlainRecord, parseJson } from "../json/parse-json.js";
import { deriveDesignRelationshipTraceability, formatTraceabilityMissingRefs, normalizeDesignTraceabilityForSources, normalizeDesignTraceabilityWithCoverage, sanitizeTraceabilityEntries } from "../traceability/traceability-normalizer.js";
import { normalizeModelInput, omitModelNullValues as omitNullValues } from "../diagrams/model-input.js";

export function parseDesignDiagramModelsResult(
  value: string,
  requirementModels: DiagramModelSpec[] = [],
) {
  const parsed = parseJson<unknown>(value);
  const result = parseDesignDiagramModelsOnlyFromParsed(parsed);
  const { designModelTraceability } = assertCompleteDesignTraceability(
    isPlainRecord(parsed) ? parsed.designModelTraceability : undefined,
    result.models,
    requirementModels,
  );
  if (designModelTraceability.length === 0) {
    throw new Error(
      "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  return {
    ...result,
    designModelTraceability,
  };
}

function assertCompleteDesignTraceability(
  rawTraceability: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const { traceability: designModelTraceability, missingSources } =
    normalizeCompleteDesignTraceability(
      rawTraceability,
      designModels,
      requirementModels,
    );
  if (designModelTraceability.length === 0) {
    throw new Error(
      "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  if (missingSources.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("design", missingSources));
  }
  return { designModelTraceability };
}

function parseDesignDiagramModelsOnlyFromParsed(parsed: unknown) {
  const cleaned = omitNullValues(parsed);
  const normalized = isPlainRecord(cleaned)
    ? {
        ...cleaned,
        models: ensureArray(cleaned.models).map(normalizeModelInput),
      }
    : cleaned;
  if (isPlainRecord(normalized)) for (const model of ensureArray(normalized.models)) {
    const issues = validateModelInput(model, "design");
    if (issues.length) throw new ModelSemanticError(issues);
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

export function parseDesignDiagramModelsOnly(value: string) {
  return parseDesignDiagramModelsOnlyFromParsed(parseJson<unknown>(value));
}

export function parseDesignTraceabilityResult(
  value: string,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const coverage = parseDesignTraceabilityCoverageResult(
    value,
    designModels,
    requirementModels,
  );
  if (coverage.traceability.length === 0) {
    throw new Error(
      "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  if (coverage.missingSources.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("design", coverage.missingSources));
  }
  return { designModelTraceability: coverage.traceability };
}

export function parseDesignTraceabilityCoverageResult(
  value: string,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const parsed = omitNullValues(parseJson<unknown>(value));
  const rawTraceability = isPlainRecord(parsed)
    ? sanitizeTraceabilityEntries(parsed.designModelTraceability)
    : [];
  return normalizeCompleteDesignTraceability(
    rawTraceability,
    designModels,
    requirementModels,
  );
}

export function parseDesignTraceabilityCoverageForSources(
  value: string,
  requiredSources: ModelElementRef[],
  requirementModels: DiagramModelSpec[],
) {
  const parsed = omitNullValues(parseJson<unknown>(value));
  const rawTraceability = isPlainRecord(parsed)
    ? sanitizeTraceabilityEntries(parsed.designModelTraceability)
    : [];
  return normalizeDesignTraceabilityForSources(
    rawTraceability,
    requiredSources,
    requirementModels,
  );
}

function normalizeCompleteDesignTraceability(
  rawTraceability: unknown,
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const normalized = normalizeDesignTraceabilityWithCoverage(
    rawTraceability,
    designModels,
    requirementModels,
  );
  const withDerivedRelationships = deriveDesignRelationshipTraceability(
    normalized.traceability,
    designModels,
  );
  return normalizeDesignTraceabilityWithCoverage(
    withDerivedRelationships,
    designModels,
    requirementModels,
  );
}
