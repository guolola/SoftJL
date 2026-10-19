// Selects explicitly configured demo projects without loading fixed artifacts into normal API startup.
import type { ProviderSettings } from "@uml-platform/contracts";
import type { LlmTransport } from "../../llm.js";

export const offlineDemoProviderSettings: ProviderSettings = {
  apiBaseUrl: "https://offline-demo.local",
  apiKey: "offline-demo",
  model: "offline-demo-fixed-artifacts",
  modelCapability: { category: "text_chat", strictJson: true, probeStatus: "strict", id: "offline-demo-fixed-artifacts", supportsJsonSchema: true, supportsJsonObject: true, structuredOutputMode: "strict_json", modeLabel: "离线固定数据" },
};

export const offlineDemoLlmTransport: LlmTransport = {
  async *streamChatCompletion() {
    throw new Error("Offline demo mode must not call an LLM provider.");
  },
};

function configuredOfflineDemoProjectIds() {
  return new Set(
    (process.env.UML_DEMO_OFFLINE_PROJECT_IDS ?? "")
      .split(",")
      .map((projectId) => projectId.trim())
      .filter(Boolean),
  );
}

function configuredOfflineDemoProjectNamePatterns() {
  return (process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS ?? "")
    .split(",")
    .map((pattern) => pattern.trim().toLocaleLowerCase())
    .filter(Boolean);
}

export function isOfflineDemoProject(
  projectId: string | null | undefined,
  projectName?: string | null,
) {
  if (projectId && configuredOfflineDemoProjectIds().has(projectId)) {
    return true;
  }
  const name = projectName?.trim().toLocaleLowerCase();
  if (!name) return false;
  return configuredOfflineDemoProjectNamePatterns().some((pattern) =>
    name.includes(pattern),
  );
}
