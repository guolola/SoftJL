// Projects individual artifact timing from lifecycle events without dividing whole-run duration.
import type { DashboardArtifactTiming } from "@uml-platform/contracts";

export type DashboardTimingEvent = {
  type: string; stage?: string; subtaskId?: string; subtaskStatus?: string;
  diagramKind?: string; modelId?: string; artifactKind?: string;
  phase?: string; callId?: string; operation?: string;
};
export type DashboardTimingSnapshot = {
  runKind: string; documentId?: string | null; documentKind?: string; fileName?: string | null;
  status?: string;
  models?: { modelId?: string; diagramKind: string; title?: string }[];
};
function timestamp(value: string | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function dashboardArtifactTimings(snapshot: DashboardTimingSnapshot, events: DashboardTimingEvent[], dates: string[]): DashboardArtifactTiming[] {
  const starts = new Map<string, string | null>();
  const stages = new Map<string, string | null>();
  const results = new Map<string, DashboardArtifactTiming>();
  const calls = new Map<string, { stage: string; task: string; startedAt: string | null; completedAt: string | null }>();
  let unscopedModelReady = false;
  const feasibilityStages: Record<string, string> = {
    feasibilityContext: "generate_context", feasibilityBusinessFlow: "generate_business_flow", feasibilityImplementation: "generate_implementation",
  };
  events.forEach((event, index) => {
    const at = timestamp(dates[index]);
    const task = event.subtaskId ?? event.modelId ?? event.diagramKind;
    const taskKey = `${event.stage}:${task}`;
    if (event.type === "run_activity" && event.callId && event.stage && task && !event.operation &&
      ["generate_models", "generate_design_models", "generate_design_sequence"].includes(event.stage)) {
      if (event.phase === "started") calls.set(event.callId, { stage: event.stage, task, startedAt: at, completedAt: null });
      const call = calls.get(event.callId);
      if (call && event.phase === "completed") call.completedAt = at;
      if (event.phase === "failed") calls.delete(event.callId);
    }
    if (event.type === "stage_started" && event.stage) stages.set(event.stage, at);
    if (event.type === "stage_progress" && task) {
      if (event.subtaskStatus === "running" && !starts.has(taskKey)) starts.set(taskKey, at);
      if (event.subtaskStatus === "failed") starts.delete(taskKey);
    }
    if (event.type !== "artifact_ready") return;
    if (event.artifactKind === "model" && !task) unscopedModelReady = true;
    let result: DashboardArtifactTiming | undefined;
    if (event.artifactKind === "document" && snapshot.runKind === "document") {
      result = { artifactId: snapshot.documentId || `document:${snapshot.documentKind}`, artifactType: `document:${snapshot.documentKind}`,
        name: snapshot.fileName || null, startedAt: stages.get("generate_document_text") ?? null, completedAt: at };
    } else if (event.artifactKind && feasibilityStages[event.artifactKind]) {
      const type = { feasibilityContext: "context", feasibilityBusinessFlow: "business-flow", feasibilityImplementation: "implementation" }[event.artifactKind]!;
      result = { artifactId: type, artifactType: `feasibility:${type}`, name: null,
        startedAt: stages.get(feasibilityStages[event.artifactKind]) ?? null, completedAt: at };
    } else if (event.artifactKind === "model" && (!event.subtaskStatus || event.subtaskStatus === "completed") && task) {
      const identified = (snapshot.models ?? []).filter(model => model.modelId === (event.modelId ?? task));
      const candidates = identified.length ? identified : (snapshot.models ?? []).filter(model => model.diagramKind === event.diagramKind);
      // A shared diagram task may produce several models: keep the task as one sample when
      // events cannot identify a separate start for each model. Never invent per-model timing.
      const model = candidates.length === 1 ? candidates[0] : undefined;
      const diagram = event.diagramKind ?? model?.diagramKind ?? task;
      const startedAt = starts.get(taskKey);
      // Aggregate completion notifications have no own start and must not duplicate models.
      if (startedAt === undefined && task === diagram && !event.modelId && [...results.values()].some(item => item.artifactType === `${snapshot.runKind}:${diagram}`)) return;
      result = { artifactId: model?.modelId ?? event.modelId ?? `${snapshot.runKind}:${diagram}`,
        artifactType: `${snapshot.runKind}:${diagram}`, name: model?.title || null, startedAt: startedAt ?? null, completedAt: at };
    }
    if (result) results.set(result.artifactId, result);
  });
  // Older runs publish one model-ready event for the batch, while retaining exact
  // per-model generation calls. Use those boundaries only for completed batches;
  // a batch duration must never be copied onto every parallel model.
  if (unscopedModelReady && snapshot.status === "completed") for (const call of calls.values()) {
    if (!call.completedAt) continue;
    const exact = (snapshot.models ?? []).filter(model => model.modelId === call.task);
    const candidates = exact.length ? exact : (snapshot.models ?? []).filter(model => model.diagramKind === call.task);
    if (candidates.length !== 1) continue;
    const model = candidates[0]; const id = model.modelId ?? `${snapshot.runKind}:${model.diagramKind}`;
    if (results.has(id)) continue;
    results.set(id, { artifactId: id, artifactType: `${snapshot.runKind}:${model.diagramKind}`, name: model.title || null,
      startedAt: call.startedAt, completedAt: call.completedAt });
  }
  return [...results.values()];
}
