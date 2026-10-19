// Projects task progress without transferring provider text, image bodies, or generated artifacts.
import type { RunEvent } from "@uml-platform/contracts";
import type { RunRecord } from "./run-record-store.js";

export function compactRunProgressSnapshot(snapshot: RunRecord["snapshot"]): RunRecord["snapshot"] {
  const compact = { ...snapshot } as Record<string, unknown>;
  for (const key of ["rules", "models", "requirementModels", "plantUml", "svgArtifacts", "requirementTrace", "designTrace", "requirementModelTraceability", "designModelTraceability", "sections", "contextTraceability", "attachments"]) {
    if (key in compact) compact[key] = [];
  }
  for (const key of ["requirementBaseline", "coverageMatrix", "traceabilityMatrix", "contextModel", "contextPlantUml", "contextSvg", "businessFlow", "implementationPlan", "feasibilityImplementationPlan"]) {
    if (key in compact) compact[key] = null;
  }
  if ("requirementText" in compact) compact.requirementText = "";
  if ("submittedRequirementText" in compact) compact.submittedRequirementText = "";
  if ("visualReviews" in snapshot) compact.visualReviews = Object.fromEntries(Object.entries(snapshot.visualReviews ?? {}).map(([id, review]) =>
    [id, { ...review, issues: [], findings: [], repairHistory: [] }]));
  return compact as RunRecord["snapshot"];
}

export function projectRunProgressEvent(event: RunEvent): RunEvent | null {
  if (event.type === "llm_chunk") return null;
  if (event.type === "run_activity") {
    if (["reasoning", "summary", "output"].includes(event.phase)) return null;
    const { text: _text, inputImages: _images, ...progress } = event;
    return progress;
  }
  if (event.type === "completed") return { ...event,
    previewCount: event.previewCount ?? ("svgArtifacts" in event.snapshot ? event.snapshot.svgArtifacts.length : undefined),
    snapshot: compactRunProgressSnapshot(event.snapshot),
  };
  if (event.type === "artifact_ready") {
    const { coverageMatrix: _coverage, traceabilityMatrix: _trace, ...progress } = event;
    return progress;
  }
  return event;
}

export function projectRunProgressEvents(events: RunEvent[]): RunEvent[] {
  return events.flatMap((event) => { const progress = projectRunProgressEvent(event); return progress ? [progress] : []; });
}
