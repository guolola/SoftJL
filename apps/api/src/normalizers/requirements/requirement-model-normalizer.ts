// Parses requirement models losslessly and validates graph semantics before traceability.
import { diagramModelsResultSchema, useCaseDiagramSpecSchema, useCaseParticipationGaps, validateModelInput, ModelSemanticError, type DiagramModelSpec, type RequirementRule } from "@uml-platform/contracts";
import { ensureArray, isPlainRecord, parseJson } from "../json/parse-json.js";
import { formatTraceabilityMissingRefs, normalizeRequirementTraceabilityWithCoverage, sanitizeTraceabilityEntries } from "../traceability/traceability-normalizer.js";
import { normalizeModelInput, omitModelNullValues as omitNullValues } from "../diagrams/model-input.js";

export function parseRequirementDiagramModelsResult(
  value: string,
  rules: RequirementRule[] = [],
  deferParticipationRepairs = false,
) {
  const parsed = parseJson<unknown>(value);
  const result = parseRequirementDiagramModelsOnlyFromParsed(parsed, rules, deferParticipationRepairs);
  const { requirementModelTraceability } = assertCompleteRequirementTraceability(
    isPlainRecord(parsed) ? parsed.requirementModelTraceability : undefined,
    rules,
    result.models,
  );
  if (requirementModelTraceability.length === 0) {
    throw new Error(
      "generate_models must return non-empty requirementModelTraceability with valid rule-to-element references",
    );
  }
  return {
    ...result,
    requirementModelTraceability,
  };
}

function assertCompleteRequirementTraceability(
  rawTraceability: unknown,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const { traceability: requirementModelTraceability, missingTargets } =
    normalizeRequirementTraceabilityWithCoverage(rawTraceability, rules, models);
  if (requirementModelTraceability.length === 0) {
    throw new Error(
      "generate_models must return non-empty requirementModelTraceability with valid rule-to-element references",
    );
  }
  if (missingTargets.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("requirement", missingTargets));
  }
  return { requirementModelTraceability };
}

function parseRequirementDiagramModelsOnlyFromParsed(
  parsed: unknown,
  rules: RequirementRule[] = [],
  deferParticipationRepairs = false,
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
  if (isPlainRecord(normalized)) for (const model of ensureArray(normalized.models)) {
    let issues = validateModelInput(model, "requirements");
    const usecase = deferParticipationRepairs ? useCaseDiagramSpecSchema.safeParse(model) : null;
    if (usecase?.success && useCaseParticipationGaps(usecase.data).gaps.length) {
      // Carry this exact omission to the recorded repair loop, never to downstream consumers.
      const repaired = { ...usecase.data, relationships: useCaseParticipationGaps(usecase.data).relationships };
      if (!validateModelInput(repaired, "requirements").length) issues = issues.filter((issue) => !["actor-participation", "isolated-actor", "disconnected-usecase"].includes(issue.code));
    }
    if (issues.length) throw new ModelSemanticError(issues);
  }
  const result = diagramModelsResultSchema
    .omit({ requirementModelTraceability: true })
    .parse(normalized);
  if (result.models.length === 0) {
    throw new Error("generate_models must return at least one model");
  }
  return result;
}

export function parseRequirementDiagramModelsOnly(value: string, deferParticipationRepairs = false) {
  return parseRequirementDiagramModelsOnlyFromParsed(parseJson<unknown>(value), [], deferParticipationRepairs);
}

export function parseRequirementTraceabilityResult(
  value: string,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const coverage = parseRequirementTraceabilityCoverageResult(value, rules, models);
  if (coverage.traceability.length === 0) {
    throw new Error(
      "generate_models must return non-empty requirementModelTraceability with valid rule-to-element references",
    );
  }
  if (coverage.missingTargets.length > 0) {
    throw new Error(formatTraceabilityMissingRefs("requirement", coverage.missingTargets));
  }
  return { requirementModelTraceability: coverage.traceability };
}

export function parseRequirementTraceabilityCoverageResult(
  value: string,
  rules: RequirementRule[],
  models: DiagramModelSpec[],
) {
  const parsed = omitNullValues(parseJson<unknown>(value));
  const rawTraceability = isPlainRecord(parsed)
    ? sanitizeTraceabilityEntries(parsed.requirementModelTraceability)
    : [];
  return normalizeRequirementTraceabilityWithCoverage(rawTraceability, rules, models);
}
