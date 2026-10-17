// Checks calendar and user-turn boundaries for the presentation-only assistant activity groups.
import { expect, it } from "vitest";
import type { StandardConversationMessage } from "@uml-platform/contracts";
import { assistantActivityGroup, conversationDate, conversationDay } from "./conversation-presentation";

const message = (id: string, values: Partial<StandardConversationMessage> = {}): StandardConversationMessage => ({
  id, role: "assistant", text: "", status: "completed", createdAt: "2026-10-15T09:00:00", ...values,
});

it("uses real calendar dates and leaves missing or invalid legacy dates unknown", () => {
  expect(conversationDate("")).toBeUndefined();
  expect(conversationDate("now")).toBeUndefined();
  expect(conversationDay("2026-10-15T09:00:00")).toBe("2026-10-15");
});

it("groups activity-only responses and preserves every original message", () => {
  const messages = [message("user", { role: "user", text: "生成图表" }), message("read", { reasoning: "查看已有资料" }),
    message("generate", { tools: [{ id: "generate-tool", name: "generate_diagrams", status: "completed" }] }), message("answer", { text: "已完成。" })];
  expect(assistantActivityGroup(messages, 2)).toEqual({ start: 1, end: 4, messages: messages.slice(1) });
  expect(assistantActivityGroup(messages, 0)).toBeUndefined();
  expect(messages.map(item => item.id)).toEqual(["user", "read", "generate", "answer"]);
});

it("keeps user turns, day changes and ordinary textual replies separate", () => {
  const messages = [message("a", { reasoning: "分析" }), message("b", { text: "回复" }), message("user", { role: "user" }),
    message("c", { reasoning: "继续分析" }), message("d", { text: "第二轮回复" }),
    message("e", { text: "次日回复", createdAt: "2026-10-16T09:00:00" })];
  expect(assistantActivityGroup(messages, 0)?.messages.map(item => item.id)).toEqual(["a", "b"]);
  expect(assistantActivityGroup(messages, 4)?.messages.map(item => item.id)).toEqual(["c", "d"]);
  expect(assistantActivityGroup(messages, 5)).toBeUndefined();
  expect(assistantActivityGroup([message("a", { text: "第一段" }), message("b", { text: "第二段" })], 0)).toBeUndefined();
});
