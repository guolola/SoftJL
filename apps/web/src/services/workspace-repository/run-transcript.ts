// Reads the authorized project run transcript and tails the existing SSE endpoint.
import { runEventSchema, type RunEvent } from "@uml-platform/contracts";
import { requestJson } from "../api-client";
import { streamProjectRunEvents } from "./run-subscriptions";

const endpoints: Record<string, string> = {
  requirements: "runs", design: "design-runs",
  document: "document-runs", feasibility: "feasibility-runs",
};

export async function readRunTranscript(projectId: string, runId: string, signal: AbortSignal, afterSequence = 0) {
  const result = await requestJson<{ events?: unknown[]; cursor?: number; run: { status: string; runKind?: string | null; model?: string | null } }>(
    `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}?includeEvents=true&view=progress${afterSequence ? `&afterSequence=${afterSequence}` : ""}`, { signal },
  );
  const events = (result.events ?? []).map(item => runEventSchema.parse(item));
  return { ...result, events };
}

export function streamRunTranscript(projectId: string, runId: string, kind: string, onEvent: (event: RunEvent) => void, signal: AbortSignal, afterSequence = 0) {
  const endpoint = endpoints[kind];
  if (!endpoint) return Promise.reject(new Error("Unsupported run kind"));
  return streamProjectRunEvents(`/api/${endpoint}/${encodeURIComponent(runId)}/events?view=progress${afterSequence ? `&afterSequence=${afterSequence}` : ""}`, projectId, onEvent, signal);
}
