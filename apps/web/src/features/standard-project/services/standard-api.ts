// Uses the authenticated project scope for ordinary generation, edits and exports.
import { modelContextSettingsSchema, standardModelSchema, standardProjectStateSchema, type DocumentStyleSettings, type StandardAnswer, type StandardModel, type StandardProjectState, type StandardAttachment, type StandardOperation } from "@uml-platform/contracts";
import { requestJson, postJson, buildApiUrl } from "../../../services/api-client/index";
import { createProviderSettingsInput } from "../../../services/workspace-repository/start-inputs";

export type StandardCommand = { operation: StandardOperation; requestId?: string; resumeRunId?: string; answers?: StandardAnswer[]; useRecommendations?: boolean; diagramId?: string; message?: string; documentStyle?: DocumentStyleSettings;
  reasoning?: boolean; attachments?: StandardAttachment[]; quote?: { text: string; messageId?: string };
  messageId?: string; expectedHeadId?: string; language?: "zh-CN" | "en" };
const path = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/standard`;
type Response = { state: StandardProjectState };
// Every response is checked before reaching the UI; obsolete models never become editable drafts.
const currentResponse = async (request: Promise<unknown>): Promise<Response> => {
  const response = await request as { state?: unknown } | null;
  return { state: standardProjectStateSchema.parse(response?.state) };
};
export const standardApi = {
  modelContext: async (projectId: string, providerConfigId: string, model: string) => modelContextSettingsSchema.parse(await requestJson(`/api/projects/${encodeURIComponent(projectId)}/model-context?${new URLSearchParams({ providerConfigId, model })}`)),
  read: (projectId: string) => currentResponse(requestJson(path(projectId))),
  start: (projectId: string, command: StandardCommand) => currentResponse(postJson(path(projectId), { ...command, providerSettings: createProviderSettingsInput() })),
  cancel: (projectId: string) => currentResponse(requestJson(`${path(projectId)}/cancel`, { method: "POST" })),
  feedback: (projectId: string, messageId: string, type: "positive" | "negative") => currentResponse(postJson(`${path(projectId)}/messages/${encodeURIComponent(messageId)}/feedback`, { type })),
  // requestJson preserves caller headers; every JSON body must explicitly declare its media type.
  saveDescription: (projectId: string, description: string) => currentResponse(requestJson(path(projectId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }) })),
  saveModel: (projectId: string, diagramId: string, model: StandardModel) => currentResponse(requestJson(`${path(projectId)}/diagrams/${encodeURIComponent(diagramId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(standardModelSchema.parse(model)) })),
  documentUrl: (projectId: string, kind: "requirementsSpec" | "softwareDesignSpec") => buildApiUrl(`${path(projectId)}/documents/${kind}/download`),
};
