// Keeps unsent text isolated by project and clears it only after the server accepts the message.
import { useEffect } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
const key = (projectId: string) => `uml-standard-draft:${projectId}`;
export function saveConversationDraft(projectId: string, text: string) {
  try { if (text) sessionStorage.setItem(key(projectId), JSON.stringify({ text, savedAt: new Date().toISOString() })); else sessionStorage.removeItem(key(projectId)); } catch { /* Optional browser storage or diagnostics must not block the active workflow. */ }
}
export function clearConversationDraft(projectId: string, text: string) {
  try { if (JSON.parse(sessionStorage.getItem(key(projectId)) ?? "null")?.text === text) sessionStorage.removeItem(key(projectId)); } catch { /* Optional browser storage or diagnostics must not block the active workflow. */ }
}
export function useConversationDraft(projectId: string) {
  const aui = useAui(); const text = useAuiState(s => s.composer.text);
  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(key(projectId)) ?? "null"); if (typeof saved?.text === "string") aui.composer().setText(saved.text); } catch { /* Optional browser storage or diagnostics must not block the active workflow. */ }
    // The parent is keyed by project, so polling cannot reseed the composer.
  }, [aui, projectId]);
  useEffect(() => {
    if (!text) return; // The runtime clears its field before awaiting the server acknowledgement.
    saveConversationDraft(projectId, text);
  }, [text, projectId]);
}
