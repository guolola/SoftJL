// Derives date boundaries and assistant activity groups without merging persisted message identities.
import type { StandardConversationMessage } from "@uml-platform/contracts";

export function conversationDate(createdAt: string): Date | undefined {
  if (!createdAt.trim()) return undefined;
  const date = new Date(createdAt);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function conversationDay(createdAt: string): string | undefined {
  const date = conversationDate(createdAt);
  return date ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : undefined;
}

export function assistantActivityGroup(messages: readonly StandardConversationMessage[], index: number) {
  const message = messages[index];
  if (message?.role !== "assistant") return undefined;
  const day = conversationDay(message.createdAt);
  let start = index;
  let end = index + 1;
  // User turns and calendar days are explicit display boundaries; no answer classification is inferred.
  while (start > 0 && messages[start - 1]?.role === "assistant" && conversationDay(messages[start - 1]!.createdAt) === day) start--;
  while (end < messages.length && messages[end]?.role === "assistant" && conversationDay(messages[end]!.createdAt) === day) end++;
  const group = messages.slice(start, end);
  return group.length > 1 && group.some(item => !item.text.trim() && (item.reasoning?.trim() || item.tools?.length))
    ? { start, end, messages: group } : undefined;
}
