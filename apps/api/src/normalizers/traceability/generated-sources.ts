// Reads source declarations from complete model responses; omissions remain errors in the model conversation.
import { designModelTraceabilityEntrySchema, requirementModelTraceabilityEntrySchema, type DiagramModelSpec, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { collectModelRefs } from "@uml-platform/contracts";
import { isPlainRecord } from "../json/parse-json.js";
import { z } from "zod";

function sourceEntries(raw: unknown, field: string) {
  const message = `${field} 必须随首次生成返回`;
  // Keep the absolute envelope path so a new missing field replaces the previous repair diagnosis.
  return z.array(z.unknown(), { required_error: message, invalid_type_error: message })
    .parse(raw, { path: [field] });
}

function reference(value: unknown, models: Array<DiagramModelSpec | DesignDiagramModelSpec>) {
  if (!isPlainRecord(value)) return value;
  // Fill display metadata only for an exact, unambiguous identity; never choose a source.
  const matches = collectModelRefs(models).refs.filter(ref => ref.diagramKind === value.diagramKind && ref.elementId === value.elementId && (!value.modelId || ref.modelId === value.modelId));
  return matches.length === 1 ? { ...matches[0], ...value } : value;
}

export function readGeneratedRequirementSources(raw: unknown, models: DiagramModelSpec[]) {
  const entries = sourceEntries(raw, "requirementModelTraceability");
  return z.array(requirementModelTraceabilityEntrySchema).parse(entries.map(entry => isPlainRecord(entry)
    ? { ...entry, target: reference(entry.target, models), mappingSource: "llm" } : entry), { path: ["requirementModelTraceability"] });
}

export function readGeneratedDesignSources(raw: unknown, models: DesignDiagramModelSpec[], upstream: DiagramModelSpec[]) {
  const entries = sourceEntries(raw, "designModelTraceability");
  return z.array(designModelTraceabilityEntrySchema).parse(entries.map(entry => isPlainRecord(entry)
    ? { ...entry, source: reference(entry.source, models), targets: Array.isArray(entry.targets) ? entry.targets.map(target => reference(target, upstream)) : entry.targets, mappingSource: "llm" } : entry), { path: ["designModelTraceability"] });
}
