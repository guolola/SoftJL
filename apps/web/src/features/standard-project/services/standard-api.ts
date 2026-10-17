// Uses the authenticated project scope for ordinary generation, edits and exports.
import { i18n } from "../../../shared/i18n";
import { modelContextSettingsSchema, type DocumentStyleSettings, type StandardAnswer, type StandardModel, type StandardProjectState, type StandardAttachment } from "@uml-platform/contracts";
import { requestJson, postJson, buildApiUrl } from "../../../services/api-client";
import { createProviderSettingsInput } from "../../../services/workspace-repository/start-inputs";

export type StandardOperation = "chat" | "edit" | "regenerate" | "prepare" | "generate" | "retry" | "resume" | "tests" | "requirementsSpec" | "softwareDesignSpec";
export type StandardCommand = { operation: StandardOperation; requestId?: string; resumeRunId?: string; description?: string; answers?: StandardAnswer[]; useRecommendations?: boolean; diagramId?: string; message?: string; documentStyle?: DocumentStyleSettings;
  reasoning?: boolean; attachments?: StandardAttachment[]; quote?: { text: string; messageId?: string };
  messageId?: string; expectedHeadId?: string; language?: "zh-CN" | "en" };
const path = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/standard`;
type Response = { state: StandardProjectState };
export const standardApi = {
  modelContext: async (projectId: string, providerConfigId: string, model: string) => modelContextSettingsSchema.parse(await requestJson(`${path(projectId)}/model-context?${new URLSearchParams({ providerConfigId, model })}`)),
  read: (projectId: string) => requestJson<Response>(path(projectId)),
  start: (projectId: string, command: StandardCommand) => postJson<Response>(path(projectId), { ...command, providerSettings: createProviderSettingsInput() }),
  cancel: (projectId: string) => requestJson<Response>(`${path(projectId)}/cancel`, { method: "POST" }),
  feedback: (projectId: string, messageId: string, type: "positive" | "negative") => postJson<Response>(`${path(projectId)}/messages/${encodeURIComponent(messageId)}/feedback`, { type }),
  publishDocument: (projectId: string, kind: "requirementsSpec" | "softwareDesignSpec") => requestJson<Response>(`${path(projectId)}/documents/${kind}/publish`, { method: "POST" }),
  // requestJson preserves caller headers; every JSON body must explicitly declare its media type.
  saveDescription: (projectId: string, description: string) => requestJson<Response>(path(projectId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }) }),
  saveModel: (projectId: string, diagramId: string, model: StandardModel) => requestJson<Response>(`${path(projectId)}/diagrams/${encodeURIComponent(diagramId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(model) }),
  documentUrl: (projectId: string, kind: "requirementsSpec" | "softwareDesignSpec") => buildApiUrl(`${path(projectId)}/documents/${kind}/download`),
};

// Document actions wait for the persisted terminal state before refreshing the shared document library.
export async function waitForStandardRun(projectId: string, runId: string, signal: AbortSignal) {
  while (!signal.aborted) {
    const { state } = await standardApi.read(projectId);
    signal.throwIfAborted();
    if (state.run?.id !== runId) throw new Error(i18n.t("standardProject.runReplaced"));
    if (state.run.status === "failed" || state.run.status === "stopped") throw new Error(state.run.error || i18n.t("standardProject.interrupted"));
    if (state.run.status === "completed") return state;
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException(i18n.t("standardProject.pageClosed"), "AbortError")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1500);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  throw new DOMException(i18n.t("standardProject.pageClosed"), "AbortError");
}
