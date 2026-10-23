// Shares project run-list requests between workspace history and project overview.
import type { ProjectRunSummary } from "../../entities/run-history/project-run";
import { requestJson } from "../api-client/index";
import { withProjectHeaders } from "./project-scope";

type ProjectRunsResponse = { projectId: string; generatedAt?: string; runs: ProjectRunSummary[] };
type Entry = { response?: ProjectRunsResponse; loadedAt: number; pending?: Promise<ProjectRunsResponse> };
const entries = new Map<string, Entry>();
export const PROJECT_RUNS_REUSE_MS = 5_000;

export function invalidateProjectRunReads(projectId?: string) {
  if (projectId) entries.delete(projectId);
  else entries.clear();
}

// A changed login must never reuse another account's project history.
if (typeof window !== "undefined") {
  window.addEventListener("uml-auth-session-changed", () => invalidateProjectRunReads());
  window.addEventListener("uml-generation-completed", () => invalidateProjectRunReads());
}

export function readProjectRuns(projectId: string, options: { maxAgeMs?: number } = {}): Promise<ProjectRunsResponse> {
  let entry = entries.get(projectId);
  if (entry?.pending) return entry.pending;
  if (entry?.response && Date.now() - entry.loadedAt < (options.maxAgeMs ?? 0)) {
    return Promise.resolve(entry.response);
  }
  if (!entry) {
    entry = { loadedAt: 0 };
    entries.set(projectId, entry);
    if (entries.size > 32) entries.delete(entries.keys().next().value!);
  }
  const current = entry;
  const pending = requestJson<ProjectRunsResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/runs`,
    withProjectHeaders(projectId, { errorKey: "errors.operations.loadHistory" }),
  ).then(response => {
    current.response = response;
    current.loadedAt = Date.now();
    return response;
  }).catch(error => {
    if (entries.get(projectId) === current) entries.delete(projectId);
    throw error;
  }).finally(() => { current.pending = undefined; });
  current.pending = pending;
  return pending;
}
