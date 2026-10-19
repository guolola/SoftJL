// Derives calendar boundaries and groups one turn's continuous Agent activity without changing message identities.
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
  if (messages[index]?.role !== "assistant") return undefined;
  const day = conversationDay(messages[index]!.createdAt);
  let start = index;
  let end = index + 1;
  // User messages and calendar days bound the displayed chain; persisted messages remain separate.
  while (start > 0 && messages[start - 1]?.role === "assistant" && conversationDay(messages[start - 1]!.createdAt) === day) start--;
  while (end < messages.length && messages[end]?.role === "assistant" && conversationDay(messages[end]!.createdAt) === day) end++;
  const group = messages.slice(start, end);
  // Start the same presentation at the first reply; later model calls must not
  // replace the disclosure and reset the reader's expansion choice.
  return { start, messages: group };
}
