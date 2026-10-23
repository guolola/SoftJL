// Restores one selected task and reconnects without restarting generation or mixing tasks.
import { useEffect, useState } from "react";
import type { RunEvent } from "@uml-platform/contracts";
import { ApiClientError } from "../../../services/api-client/index";
import { readRunTranscript, streamRunTranscript } from "../../../services/workspace-repository/run-transcript";
import { createProgressTranscriptAccumulator } from "../../workspace-session/lib/run-transcript";

export function useRunTranscript(projectId?: string | null, runId?: string | null) {
  const key = `${projectId ?? ""}:${runId ?? ""}`;
  const [state, setState] = useState<{ key: string; events: RunEvent[]; status?: string; model?: string | null; loading: boolean; disconnected: boolean; unavailable: boolean }>({ key, events: [], loading: false, disconnected: false, unavailable: false });
  useEffect(() => {
    if (!projectId || !runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let terminal = false;
    let cursor = 0;
    const accumulate = createProgressTranscriptAccumulator<RunEvent>();
    let pending: RunEvent[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    setState({ key, events: [], loading: true, disconnected: false, unavailable: false });
    const update = (events: RunEvent[]) => {
      terminal ||= events.some((event) => ["completed", "failed", "cancelled"].includes(event.type));
      const merged = accumulate(events);
      if (!controller.signal.aborted && merged) setState((current) => ({ ...current, events: merged, loading: false, disconnected: false }));
    };
    const flush = () => { clearTimeout(flushTimer); flushTimer = undefined; const batch = pending; pending = []; if (batch.length) update(batch); };
    const receive = (event: RunEvent) => {
      cursor = Math.max(cursor, event.sequence ?? 0);
      pending.push(event);
      if (["completed", "failed", "cancelled"].includes(event.type)) flush();
      else flushTimer ??= setTimeout(flush, 100);
    };
    const connect = async () => {
      try {
        flush();
        const result = await readRunTranscript(projectId, runId, controller.signal, cursor);
        if (controller.signal.aborted) return;
        update(result.events);
        cursor = Math.max(cursor, result.cursor ?? 0);
        setState((current) => ({ ...current, status: result.run.status, model: result.run.model }));
        if (!["queued", "running"].includes(result.run.status)) return;
        await streamRunTranscript(projectId, runId, result.run.runKind, (event) => { delay = 1000; receive(event); }, controller.signal, cursor);
      } catch (error) {
        flush();
        if (controller.signal.aborted || terminal) return;
        const unavailable = error instanceof ApiClientError && [401, 403, 404].includes(error.status) ||
          error instanceof SyntaxError || error instanceof Error && error.name === "ZodError";
        setState((current) => ({ ...current, loading: false, disconnected: !unavailable, unavailable }));
        if (!unavailable) {
          timer = setTimeout(() => void connect(), delay);
          delay = Math.min(delay * 2, 10000);
        }
      }
    };
    void connect();
    return () => { controller.abort(); clearTimeout(timer); clearTimeout(flushTimer); };
  }, [key, projectId, runId]);
  return state.key === key ? state : { key, events: [], loading: Boolean(projectId && runId), disconnected: false, unavailable: false };
}
