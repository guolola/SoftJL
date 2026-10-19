// Removes provider null placeholders without changing IDs, business text, nodes or graph topology.
import { isPlainRecord } from "../json/parse-json.js";

export function omitModelNullValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitModelNullValues);
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, omitModelNullValues(item)]));
}

export function normalizeModelInput(value: unknown) {
  const model = omitModelNullValues(value);
  if (!isPlainRecord(model)) return model;
  // Providers sometimes repeat an empty response-envelope array inside a model.
  // Only empty metadata can be removed locally; populated or unknown fields still fail validation.
  for (const field of ["designModelTraceability", "requirementModelTraceability"]) {
    if (Array.isArray(model[field]) && model[field].length === 0) delete model[field];
  }
  // modelId is metadata; unlike element IDs it may be assigned without inventing model content.
  if (!model.modelId && typeof model.diagramKind === "string" && model.diagramKind !== "context") {
    model.modelId = ["analysis", "sequence"].includes(model.diagramKind) && typeof model.sourceUseCaseId === "string"
      ? `${model.diagramKind}:${model.sourceUseCaseId}` : model.diagramKind;
  }
  return model;
}
