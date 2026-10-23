// Carries mode-specific introduction requests from successful creation to a visible project workspace.
type ProjectMode = "standard" | "professional";
const key = (projectId: string, mode: ProjectMode) => `uml-project-introduction:${mode}:${projectId}`;

export function queueProjectIntroduction(projectId: string, mode: ProjectMode) {
  try { sessionStorage.setItem(key(projectId, mode), "pending"); } catch {
    // Restricted storage must not prevent successful project creation.
  }
}

export function hasPendingProjectIntroduction(projectId: string, mode: ProjectMode): boolean {
  try { return sessionStorage.getItem(key(projectId, mode)) === "pending"; } catch { return false; }
}

export function consumeProjectIntroduction(projectId: string, mode: ProjectMode): boolean {
  try {
    if (!hasPendingProjectIntroduction(projectId, mode)) return false;
    // Consume on display so reloading, revisiting or remounting cannot reopen the introduction.
    sessionStorage.removeItem(key(projectId, mode));
    return true;
  } catch { return false; }
}
