// Restores Pi's append-only session tree from project storage without using shared host files or credentials.
import { SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import type { StandardProjectState } from "@uml-platform/contracts";

export function restoreStandardSession(projectId: string, saved?: StandardProjectState["piSession"]) {
  const manager = SessionManager.inMemory(`/uml-projects/${projectId}`);
  const ids = new Map<string, string>();
  for (const entry of (saved?.entries ?? []) as SessionEntry[]) {
    if (entry.parentId && ids.has(entry.parentId)) manager.branch(ids.get(entry.parentId)!);
    else if (!entry.parentId) manager.resetLeaf();
    let id: string | undefined;
    // SDK 1.x persists prompt/tool declarations as system messages; replay them before context edits and compaction.
    if (entry.type === "message" && ["system", "user", "assistant", "toolResult", "custom", "bashExecution"].includes(entry.message.role)) id = manager.appendMessage(entry.message as Parameters<SessionManager["appendMessage"]>[0]);
    else if (entry.type === "compaction") {
      const kept = ids.get(entry.firstKeptEntryId);
      if (!kept) throw new Error("项目会话压缩记录缺少保留边界，请联系管理员");
      id = manager.appendCompaction(entry.summary, kept, entry.tokensBefore, entry.details, entry.fromHook, entry.usage);
    } else if (entry.type === "context_edit") {
      const target = ids.get(entry.targetId);
      if (!target) throw new Error("项目会话编辑记录缺少目标消息，请联系管理员");
      id = manager.appendContextEdit(target, entry.replacement);
    } else if (entry.type === "usage") {
      id = manager.appendUsage(entry.kind, entry.provider, entry.model, entry.usage, entry.note).id;
    } else if (entry.type === "custom_message") id = manager.appendCustomMessageEntry(entry.customType, entry.content, entry.display, entry.details);
    else if (entry.type === "model_change") id = manager.appendModelChange(entry.provider, entry.modelId);
    else if (entry.type === "thinking_level_change") id = manager.appendThinkingLevelChange(entry.thinkingLevel);
    else if (entry.type === "custom") id = manager.appendCustomEntry(entry.customType, entry.data);
    else if (entry.type === "session_info" && entry.name) id = manager.appendSessionInfo(entry.name);
    if (id) ids.set(entry.id, id);
  }
  if (saved?.leafId && ids.has(saved.leafId)) manager.branch(ids.get(saved.leafId)!);
  else if (saved?.leafId === null) manager.resetLeaf();
  // A crashed process must never repeat a mutating tool blindly. Complete dangling calls with an interrupted result.
  const pending = new Map<string, string>();
  for (const entry of manager.getBranch()) if (entry.type === "message") {
    const message = entry.message;
    if (message.role === "assistant") for (const content of message.content) if (content.type === "toolCall") pending.set(content.id, content.name);
    if (message.role === "toolResult") pending.delete(message.toolCallId);
  }
  for (const [toolCallId, toolName] of pending) manager.appendMessage({ role: "toolResult", toolCallId, toolName,
    content: [{ type: "text", text: "上轮执行被中断，结果未知。请先读取项目实际状态，不能假定未执行或直接重复写入。" }], isError: true, timestamp: Date.now() });
  return manager;
}
