// Keeps unsubmitted engineering text isolated by project and by its saved source revision.
type Draft = { text: string; baseText: string };
const key = (projectId: string) => `uml-engineering-draft:${projectId}`;

export function readRequirementComposerDraft(projectId: string, baseText: string): string | null {
  try {
    const draft: Draft | null = JSON.parse(sessionStorage.getItem(key(projectId)) ?? "null");
    // A newer saved revision wins over a draft from another tab or an earlier extraction.
    return draft?.baseText === baseText && typeof draft.text === "string" ? draft.text : null;
  } catch { return null; }
}

export function saveRequirementComposerDraft(projectId: string, text: string, baseText: string) {
  try {
    if (text === baseText) sessionStorage.removeItem(key(projectId));
    else sessionStorage.setItem(key(projectId), JSON.stringify({ text, baseText } satisfies Draft));
  } catch { /* Storage restrictions must not prevent editing or submitting requirements. */ }
}

export function clearRequirementComposerDraft(projectId: string) {
  try { sessionStorage.removeItem(key(projectId)); } catch { /* Draft cleanup is best effort when browser storage is unavailable. */ }
}
