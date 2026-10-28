// Announces persisted run changes so history refreshes for every terminal outcome and retry.
export const PROJECT_RUNS_CHANGED_EVENT = "uml-project-runs-changed";

export function notifyProjectRunsChanged(projectId: string, runId: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROJECT_RUNS_CHANGED_EVENT, { detail: { projectId, runId } }));
  }
}
