// Verifies that interrupted tool-only replies stop looking live and always explain preserved and unfinished work.
import assert from "node:assert/strict";
import test from "node:test";
import { createStandardProjectState } from "@uml-platform/contracts";
import { appendStandardGenerationResult, interruptStandardRunMessages } from "./standard-run-messages.js";

test("terminal notices mark running tools failed and summarize results only once", () => {
  const state = createStandardProjectState();
  state.run = { id: "r", operation: "chat", status: "stopped", startedAt: "now", work: { ids: ["architecture", "usecase"] } };
  state.diagrams = { architecture: { id: "architecture", kind: "architecture", title: "总体架构图", status: "completed", svg: "<svg/>" },
    usecase: { id: "usecase", kind: "usecase", title: "用例图", status: "failed", error: "生成已停止" } };
  state.conversation = [{ id: "tool", role: "assistant", text: "", status: "completed", createdAt: "now", tools: [{ id: "t", name: "generate_diagrams", status: "running" }] }];
  interruptStandardRunMessages(state, "生成服务已重启。");
  interruptStandardRunMessages(state, "生成服务已重启。");
  assert.equal(state.conversation[0]!.tools![0]!.status, "failed");
  assert.equal(state.conversation[0]!.status, "failed");
  assert.equal(state.conversation.length, 2);
  assert.match(state.conversation.at(-1)!.text, /已完成 1 张，未完成 1 张/);
  appendStandardGenerationResult(state); appendStandardGenerationResult(state);
  assert.equal(state.conversation.length, 3);
  assert.match(state.conversation.at(-1)!.text, /成功 1 张，失败 1 张/);
  assert.match(state.conversation.at(-1)!.text, /用例图：生成已停止/);
});
