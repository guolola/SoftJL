// Validates conversation revisions and moves model context to the selected turn without rolling back project artifacts.
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { StandardProjectState } from "@uml-platform/contracts";
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
  requireRevisionCheckpoint(state, user.id);
  return { ...command, ...(command.operation === "regenerate" ? { message: user.text, attachments: user.attachments, quote: user.quote } : {}), revisionUserId: user.id };
}

function requireRevisionCheckpoint(state: StandardProjectState, messageId: string) {
  const checkpoint = (state.piSession?.entries as SessionEntry[] | undefined)?.find(entry => entry.type === "custom"
    && entry.customType === conversationTurnMarker && (entry.data as { messageId?: string } | undefined)?.messageId === messageId);
  if (checkpoint?.type !== "custom") throw new Error("这条对话缺少当前上下文检查点，请发起新一轮对话。");
  return checkpoint;
}

export function applyConversationRevision(state: StandardProjectState, command: StandardCommand) {
  if (command.operation !== "edit" && command.operation !== "regenerate") return;
  // Recheck inside the workspace CAS; a second browser may have changed the head after HTTP validation.
  const resolved = resolveConversationRevision(state, command);
  const history = state.conversation!;
  const index = history.findIndex(item => item.id === resolved.revisionUserId);
  const checkpoint = requireRevisionCheckpoint(state, resolved.revisionUserId!);
  if (command.operation === "edit" && index === 0 && state.description === history[0]!.text) state.description = command.message?.trim() || "请根据附件分析项目需求。";
  state.conversation = history.slice(0, index);
  state.contextStatus = "ready";
  state.piSession!.leafId = checkpoint.id;
  state.rounds = structuredClone((checkpoint.data as { rounds: StandardProjectState["rounds"] }).rounds);
  state.generationScope = structuredClone((checkpoint.data as { generationScope?: StandardProjectState["generationScope"] }).generationScope);
  // Saved usage remains cumulative; a historical last-call/context estimate must not describe the revised prefix.
  if (state.tokenUsage) { state.tokenUsage.contextTokens = null; state.tokenUsage.lastCall = null; }
}
