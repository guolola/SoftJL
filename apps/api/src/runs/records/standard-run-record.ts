// Records one accepted quick-modeling command and only outputs changed during that command.
import { createHash } from "node:crypto";
import type { StandardProjectState, RunSnapshot } from "@uml-platform/contracts";
import type { RunRecord, RunRecordStore } from "./run-record-store.js";
import { createEmptySnapshot } from "./snapshots.js";
import { createRunError } from "../pipelines/shared/errors.js";

type Artifact = NonNullable<RunSnapshot["standardRun"]>["artifacts"][number];
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function outputs(state: StandardProjectState) {
  const values: Array<{ key: string; fingerprint: string; item: Artifact }> = [];
  for (const diagram of Object.values(state.diagrams)) {
    if (diagram.status !== "completed" || !diagram.model || !diagram.svg) continue;
    values.push({ key: "diagram:" + diagram.id, fingerprint: hash([diagram.model, diagram.source, diagram.svg]),
      item: { id: diagram.id, modelId: diagram.id, type: "毕设图表", title: diagram.title,
        diagramKind: diagram.kind, sourceLength: diagram.source?.length, previewAvailable: true, svg: diagram.svg } });
  }
  for (const item of state.tests ?? []) values.push({ key: "test:" + item.id, fingerprint: hash(item),
    item: { id: item.id, type: "测试用例", title: item.title, previewAvailable: false } });
  for (const [kind, doc] of Object.entries(state.documents ?? {})) if (doc) values.push({
    key: "document:" + kind, fingerprint: hash(doc),
    item: { id: doc.documentId ?? kind, type: "DOCX", title: doc.title, previewAvailable: false },
  });
  return values;
}

// Flush before acknowledgement and after saves so history survives API restarts.
async function persist(runs: RunRecordStore, record: RunRecord) {
  runs.set(record.snapshot.runId, record);
  await runs.flushRun?.(record.snapshot.runId);
}

export async function startStandardRunRecord(input: { runs: RunRecordStore; state: StandardProjectState;
  previous: StandardProjectState; projectId: string; userId: string; providerConfigId: string; model: string }) {
  const run = input.state.run!;
  const snapshot = createEmptySnapshot(run.id, "", []);
  snapshot.operationType = "quick_modeling";
  snapshot.status = "running";
  snapshot.standardRun = { operation: run.operation, providerConfigId: input.providerConfigId, model: input.model,
    baseline: Object.fromEntries(outputs(input.previous).map(output => [output.key, output.fingerprint])), artifacts: [] };
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false,
    metadata: { projectId: input.projectId, userId: input.userId, model: input.model, createdAt: run.startedAt } };
  await persist(input.runs, record);
}

export async function syncStandardRunRecord(runs: RunRecordStore, state: StandardProjectState) {
  if (!state.run) return;
  const record = runs.get(state.run.id) ?? await runs.refreshRun?.(state.run.id, { events: "none" });
  if (!record || !("standardRun" in record.snapshot) || !record.snapshot.standardRun) return;
  // A save already in flight cannot revert a cancellation committed by the project controller.
  if (record.terminal && state.run.status === "running") return;
  const data = record.snapshot.standardRun;
  // A regenerated diagram may be byte-identical; its explicit running transition still proves ownership.
  for (const diagram of Object.values(state.diagrams)) if (diagram.status === "running" || diagram.status === "pending") delete data.baseline["diagram:" + diagram.id];
  data.artifacts = outputs(state).filter(output => data.baseline[output.key] !== output.fingerprint)
    .map(output => ({ ...output.item, id: state.run!.id + ":" + output.key }));
  record.snapshot.outputManifest = data.artifacts.map(item => ({
    kind: item.type === "毕设图表" ? "model" : item.type === "测试用例" ? "test" : "document",
    id: item.id, diagramKind: item.diagramKind,
  }));
  record.snapshot.status = state.run.status === "stopped" ? "cancelled" : state.run.status;
  record.snapshot.error = state.run.status === "failed" ? createRunError("RUN_INTERNAL_ERROR", state.run.error ?? "生成失败") : null;
  record.terminal = state.run.status !== "running";
  if (state.run.finishedAt) record.metadata!.completedAt = state.run.finishedAt;
  await persist(runs, record);
}
