// Validates conversation revisions and moves model context to the selected turn without rolling back project artifacts.
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { StandardProjectState } from "@uml-platform/contracts";
import { restoreStandardSession } from "./standard-agent-session.js";
import type { StandardCommand } from "../pipelines/standard/standard-project-pipeline.js";

export const conversationTurnMarker = "uml-conversation-turn";
export function resolveConversationRevision(state: StandardProjectState, command: StandardCommand): StandardCommand & { revisionUserId?: string } {
  if (command.operation !== "edit" && command.operation !== "regenerate") return command;
  const history = state.conversation ?? [];
  if (!command.expectedHeadId || history.at(-1)?.id !== command.expectedHeadId) throw new Error("对话已变化，请刷新后重试");
  const target = history.findIndex(item => item.id === command.messageId);
  if (target < 0 || history[target]!.role !== (command.operation === "edit" ? "user" : "assistant")) throw new Error("未找到可编辑或重新生成的消息");
  const userIndex = command.operation === "edit" ? target : history.slice(0, target).map(item => item.role).lastIndexOf("user");
  const user = history[userIndex];
  if (!user) throw new Error("这条回复没有可重新提交的用户消息");
  return { ...command, ...(command.operation === "regenerate" ? { message: user.text, attachments: user.attachments, quote: user.quote } : {}), revisionUserId: user.id };
}

export function applyConversationRevision(state: StandardProjectState, command: StandardCommand) {
  if (command.operation !== "edit" && command.operation !== "regenerate") return;
  // Recheck inside the workspace CAS; a second browser may have changed the head after HTTP validation.
  const resolved = resolveConversationRevision(state, command);
  const history = state.conversation!;
  const index = history.findIndex(item => item.id === resolved.revisionUserId);
  if (command.operation === "edit" && index === 0 && state.description === history[0]!.text) state.description = command.message?.trim() || "请根据附件分析项目需求。";
  const checkpoint = (state.piSession?.entries as SessionEntry[] | undefined)?.find(entry => entry.type === "custom"
    && entry.customType === conversationTurnMarker && (entry.data as { messageId?: string } | undefined)?.messageId === resolved.revisionUserId);
  state.conversation = history.slice(0, index);
  state.contextStatus = "ready";
  if (checkpoint?.type === "custom") {
    state.piSession!.leafId = checkpoint.id;
    state.rounds = structuredClone((checkpoint.data as { rounds: StandardProjectState["rounds"] }).rounds);
    state.generationScope = structuredClone((checkpoint.data as { generationScope?: StandardProjectState["generationScope"] }).generationScope);
  } else {
    // Older sessions have no turn checkpoints. Carry only the visible prefix as labelled reference material;
    // never reuse a compacted summary or tool result that includes the replaced turn.
    const manager = restoreStandardSession("revision", state.piSession);
    manager.resetLeaf();
    const prefix = state.conversation.map(item => `${item.role}: ${item.text}\n${item.quote?.text ?? ""}\n${(item.attachments ?? []).filter(file => file.type === "document").map(file => file.text).join("\n")}`).join("\n\n");
    if (prefix) manager.appendCustomMessageEntry("uml-prior-conversation", `此前对话资料（已保存产物以当前项目状态为准）：\n${prefix}`, false);
    state.piSession = { entries: manager.getEntries(), leafId: manager.getLeafId() };
    state.rounds = [];
    if (!state.conversation.length) state.generationScope = undefined;
  }
  // Saved usage remains cumulative; a historical last-call/context estimate must not describe the revised prefix.
  if (state.tokenUsage) { state.tokenUsage.contextTokens = null; state.tokenUsage.lastCall = null; }
}
