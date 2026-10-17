// Checks that acknowledgement and model execution share one user message and one pre-turn checkpoint.
import assert from "node:assert/strict";
import test from "node:test";
import { createStandardProjectState } from "@uml-platform/contracts";
import { prepareStandardAgentTurn } from "./standard-agent-turn.js";

test("prepares a request-scoped turn only once and checkpoints clarification before answering", () => {
  const state = createStandardProjectState();
  state.rounds = [{ questions: [{ id: "role", title: "谁借阅？", options: ["学生"], recommendation: "学生", multiple: false }], answers: [] }];
  const command = { operation: "chat" as const, requestId: "request", message: "学生", quote: { text: "引用" } };
  const message = prepareStandardAgentTurn("p", command, state);
  assert.equal(message.id, "user:request");
  assert.equal(state.conversation?.length, 1);
  assert.equal(state.description, "学生");
  assert.deepEqual(state.rounds[0]!.answers, [{ questionId: "role", answer: "学生" }]);
  const checkpoint = state.piSession!.entries.at(-1) as { data: { messageId: string; rounds: typeof state.rounds } };
  assert.equal(checkpoint.data.messageId, message.id);
  assert.deepEqual(checkpoint.data.rounds[0]!.answers, []);
  const entryCount = state.piSession!.entries.length;
  assert.equal(prepareStandardAgentTurn("p", command, state), message);
  assert.equal(state.conversation?.length, 1);
  assert.equal(state.piSession!.entries.length, entryCount);
});

for (const mode of ["answers-only", "legacy-client", "recommendation"] as const) {
  test(`keeps assistant question text out of the durable user reply (${mode})`, () => {
    const title = "你目前只发来了问候，请先选择本次希望生成的模型（可多选）：";
    const answer = "功能结构图：展示系统模块及功能划分";
    const state = createStandardProjectState();
    state.rounds = [{ questions: [{ id: "scope", title, options: [answer, "用例图"], recommendation: answer, multiple: true }], answers: [] }];
    state.conversation = [{ id: "agent", role: "assistant", text: title, status: "completed", createdAt: "now" }];
    const command = { operation: "chat" as const, requestId: "reply", ...(mode === "recommendation" ? { useRecommendations: true }
      : { answers: [{ questionId: "scope", answer }], ...(mode === "legacy-client" ? { message: `${title}：${answer}` } : {}) }) };
    const reply = prepareStandardAgentTurn("p", command, state);
    assert.equal(reply.role, "user");
    assert.equal(reply.text, answer);
    assert.equal(state.conversation[0]!.role, "assistant");
    assert.equal(state.conversation[0]!.text, title);
    assert.deepEqual(state.rounds[0]!.answers, [{ questionId: "scope", answer }]);
  });
}

test("preserves user-authored text alongside structured answers", () => {
  const state = createStandardProjectState();
  state.rounds = [{ questions: [{ id: "role", title: "谁借阅？", options: ["学生", "教师"], recommendation: "学生", multiple: false }], answers: [] }];
  const text = "学生，并且需要管理员审批。";
  const reply = prepareStandardAgentTurn("p", { operation: "chat", message: text, answers: [{ questionId: "role", answer: "学生" }] }, state);
  assert.equal(reply.text, text);
});
