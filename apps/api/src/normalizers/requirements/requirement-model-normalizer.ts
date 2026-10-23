// Parses requirement models losslessly and validates graph semantics before traceability.
import { diagramModelsResultSchema, useCaseDiagramSpecSchema, useCaseParticipationGaps, validateModelInput, ModelSemanticError } from "@uml-platform/contracts";
import { readGeneratedRequirementSources } from "../traceability/generated-sources.js";
import { ensureArray, isPlainRecord, parseJson } from "../json/parse-json.js";
import { normalizeModelInput, omitModelNullValues as omitNullValues } from "../diagrams/model-input.js";

export function parseRequirementDiagramModelsResult(
  value: string,
  deferParticipationRepairs = false,
) {
  const parsed = parseJson<unknown>(value);
  const result = parseRequirementDiagramModelsOnlyFromParsed(parsed, deferParticipationRepairs);
  const requirementModelTraceability = readGeneratedRequirementSources(isPlainRecord(parsed) ? omitNullValues(parsed.requirementModelTraceability) : undefined, result.models);
  return { ...result, requirementModelTraceability };
}

function parseRequirementDiagramModelsOnlyFromParsed(
  parsed: unknown,
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
  const diagnostics = [];
  if (isPlainRecord(normalized)) for (const [index, model] of ensureArray(normalized.models).entries()) {
    if (isPlainRecord(model) && !Object.keys(model).length) continue;
    let issues = validateModelInput(model, "requirements");
    const usecase = deferParticipationRepairs ? useCaseDiagramSpecSchema.safeParse(model) : null;
    if (usecase?.success && useCaseParticipationGaps(usecase.data).gaps.length) {
      // Carry this exact omission to the recorded repair loop, never to downstream consumers.
      const repaired = { ...usecase.data, relationships: useCaseParticipationGaps(usecase.data).relationships };
      if (!validateModelInput(repaired, "requirements").length) issues = issues.filter((issue) => !["actor-participation", "isolated-actor", "disconnected-usecase"].includes(issue.code));
    }
    diagnostics.push(...issues.map(issue => ({ ...issue, responsePath: `models.${index}.${issue.path}` })));
  }
  if (diagnostics.length) throw new ModelSemanticError(diagnostics);
  if (isPlainRecord(normalized)) normalized.models = ensureArray(normalized.models).filter(model => !(isPlainRecord(model) && !Object.keys(model).length));
  const result = diagramModelsResultSchema
    .omit({ requirementModelTraceability: true })
    .parse(normalized);
  if (result.models.length === 0) {
    throw new Error("generate_models must return at least one model");
  }
  return result;
}

export function parseRequirementDiagramModelsOnly(value: string, deferParticipationRepairs = false) {
  return parseRequirementDiagramModelsOnlyFromParsed(parseJson<unknown>(value), deferParticipationRepairs);
}

// Required source fields are part of newly generated analysis JSON, not a coverage audit.
export function parseGeneratedAnalysisModels(value: string) {
  const result = parseRequirementDiagramModelsOnly(value);
  const diagnostics = result.models.flatMap((model, modelIndex) => model.diagramKind !== "analysis" ? [] :
    (["participants", "messages", "fragments"] as const).flatMap(collection => model[collection].flatMap((element, index) =>
      element.sourceElementIds?.length ? [] : [{ code: "required-field", modelId: model.modelId ?? "analysis", diagramKind: model.diagramKind, elementId: element.id, path: `${collection}.${index}.sourceElementIds`, responsePath: `models.${modelIndex}.${collection}.${index}.sourceElementIds`, message: "首次生成必须填写非空 sourceElementIds 上游元素编号", severity: "error" as const }])));
  if (diagnostics.length) throw new ModelSemanticError(diagnostics);
  return result;
}
