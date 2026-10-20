// Retains one model task's exact messages while validation feedback requests complete replacements.
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "@uml-platform/contracts";
import { buildModelRepairPrompt } from "@uml-platform/prompts";
import type { ChatMessage } from "../../../llm.js";
import { parseJson } from "../../../normalizers/json/parse-json.js";
import { repairDiagnostics } from "../../../normalizers/structured-output/repair-diagnostics.js";
import { restoreJsonPunctuation } from "../../../normalizers/structured-output/repair-patch.js";

export class ModelGenerationConversation {
  private readonly history: ChatMessage[];
  private used = 0;

  constructor(readonly targetId: string, messages: ChatMessage[], private readonly limit = MAX_GENERATION_REPAIR_ATTEMPTS) {
    this.history = structuredClone(messages);
  }

  get messages(): ChatMessage[] { return structuredClone(this.history); }
  get attempts() { return this.used; }

  accept(raw: string): string {
    // Keep the provider's exact output in history, including invalid JSON, so the next
    // request extends the previous prefix instead of reconstructing a different draft.
    this.history.push({ role: "assistant", content: raw });
    const value = parseJson<unknown>(restoreJsonPunctuation(raw));
    if (!value || typeof value !== "object" || Array.isArray(value) || "changes" in value || "patch" in value) {
      throw new Error("模型修复必须返回与首次生成相同结构的完整 JSON 对象，不能返回字段补丁");
    }
    return JSON.stringify(value);
  }

  prepare(error: unknown) {
    if (this.used >= this.limit) throw new Error(`${this.targetId} 已达到共享 ${this.limit} 次修复调用上限`);
    this.used++;
    this.history.push({ role: "user", content: buildModelRepairPrompt({
      error: error instanceof Error ? error.message : String(error), diagnostics: repairDiagnostics(error),
    }) });
  }
}
