// Owns run trace mutation helpers shared by API pipelines and repair flows.
import {
  
  designDiagramKindSchema,
  designTraceEntrySchema,
  diagramKindSchema,
  requirementTraceEntrySchema,
  
  
  type DesignDiagramKind,
  type DesignRunSnapshot,
  type DesignTraceEntry,
  type DiagramKind,
  type RequirementTraceEntry,
  type RunSnapshot,
} from "@uml-platform/contracts";
import { type AnyPlantUmlArtifact } from "../../../adapters/render/render-client.js";
import { type RunRecord } from "../../records/run-record-store.js";

const DEFAULT_TRACE_RAW_OUTPUT_MAX_CHARS = 8000;
const DEFAULT_TRACE_RAW_OUTPUT_HEAD_CHARS = 6000;
const DEFAULT_TRACE_RAW_OUTPUT_TAIL_CHARS = 2000;

interface TraceRawOutputFields {
  rawOutput?: string;
  rawOutputTruncated?: boolean;
  rawOutputOriginalLength?: number;
}

function readTraceRawOutputMaxChars() {
  const parsed = Number.parseInt(process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TRACE_RAW_OUTPUT_MAX_CHARS;
  }
  return parsed;
}

function truncateRawOutput(rawOutput: string, maxChars: number) {
  if (rawOutput.length <= maxChars) {
    return rawOutput;
  }

  const marker = `\n...[rawOutput truncated from ${rawOutput.length} to ${maxChars} chars]...\n`;
  if (marker.length >= maxChars) {
    return marker.slice(0, maxChars);
  }

  const contentBudget = Math.max(1, maxChars - marker.length);
  const tailChars = Math.min(DEFAULT_TRACE_RAW_OUTPUT_TAIL_CHARS, Math.floor(contentBudget / 4));
  const headChars = Math.min(
    DEFAULT_TRACE_RAW_OUTPUT_HEAD_CHARS,
    Math.max(1, contentBudget - tailChars),
  );
  const remainingBudget = Math.max(0, contentBudget - headChars);
  const finalTailChars = Math.min(tailChars, remainingBudget);

  return `${rawOutput.slice(0, headChars)}${marker}${rawOutput.slice(
    rawOutput.length - finalTailChars,
  )}`;
}

function compactTraceRawOutput<T extends TraceRawOutputFields>(entry: T): T {
  if (typeof entry.rawOutput !== "string") {
    return entry;
  }

  const maxChars = readTraceRawOutputMaxChars();
  if (entry.rawOutput.length <= maxChars) {
    return entry;
  }

  // Trace payloads are persisted in snapshots; cap raw LLM output before any record upsert.
  return {
    ...entry,
    rawOutput: truncateRawOutput(entry.rawOutput, maxChars),
    rawOutputTruncated: true,
    rawOutputOriginalLength: entry.rawOutput.length,
  };
}

function isRequirementRunRecord(record: RunRecord): record is RunRecord & {
  snapshot: RunSnapshot;
} {
  return (
    "models" in record.snapshot &&
    "plantUml" in record.snapshot &&
    "svgArtifacts" in record.snapshot &&
    Array.isArray((record.snapshot as RunSnapshot).requirementTrace) &&
    !("requirementModels" in record.snapshot) &&
    !("files" in record.snapshot)
  );
}

export function appendRequirementTrace(
  record: RunRecord,
  entry: Omit<RequirementTraceEntry, "createdAt">,
) {
  if (!isRequirementRunRecord(record)) {
    return;
  }

  record.snapshot.requirementTrace = [
    ...record.snapshot.requirementTrace,
    requirementTraceEntrySchema.parse(
      compactTraceRawOutput({
        ...entry,
        createdAt: new Date().toISOString(),
      }),
    ),
  ];
}

function isDesignRunRecord(record: RunRecord): record is RunRecord & {
  snapshot: DesignRunSnapshot;
} {
  return (
    "requirementModels" in record.snapshot &&
    "selectedDiagrams" in record.snapshot &&
    Array.isArray((record.snapshot as DesignRunSnapshot).designTrace)
  );
}

export function appendDesignTrace(
  record: RunRecord,
  entry: Omit<DesignTraceEntry, "createdAt">,
) {
  if (!isDesignRunRecord(record)) {
    return;
  }

  record.snapshot.designTrace = [
    ...record.snapshot.designTrace,
    designTraceEntrySchema.parse(
      compactTraceRawOutput({
        ...entry,
        createdAt: new Date().toISOString(),
      }),
    ),
  ];
}





export function designDiagramKindFromArtifact(
  artifact: AnyPlantUmlArtifact,
): DesignDiagramKind | undefined {
  const parsed = designDiagramKindSchema.safeParse(artifact.diagramKind);
  return parsed.success ? parsed.data : undefined;
}

export function requirementDiagramKindFromArtifact(
  artifact: AnyPlantUmlArtifact,
): DiagramKind | undefined {
  const parsed = diagramKindSchema.safeParse(artifact.diagramKind);
  return parsed.success ? parsed.data : undefined;
}
