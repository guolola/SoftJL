// Checks authorization mapping and durable receipt ownership separately from the official UI state machine.
import { expect, it } from "vitest";
import { createStandardProjectState } from "@uml-platform/contracts";
import { questionFlowAnswers, questionFlowReceipt, questionRoundForMessage, type QuestionRound } from "./conversation-question-flow";

const round: QuestionRound = { purpose: "generation_scope", questions: [{ id: "scope", title: "需要哪些图？", recommendation: "用例图", multiple: true,
  options: ["用例图", "不生成"], scopeChoices: [{ id: "cases", label: "用例图", kinds: ["usecase"], recommended: true }, { id: "skip", label: "不生成", kinds: [], recommended: false }] }], answers: [] };

it("retains scope IDs and rejects unknown choices, extra questions and mixed denial", () => {
  expect(questionFlowAnswers(round, { scope: ["cases"] })).toEqual([{ questionId: "scope", answer: "用例图", selectedOptionIds: ["cases"] }]);
  for (const value of [{ scope: [] }, { scope: ["cases", "skip"] }, { scope: ["cases", "cases"] }, { scope: ["unknown"] }, { scope: ["cases"], extra: ["cases"] }]) {
    expect(questionFlowAnswers(round, value)).toBeNull();
  }
  expect(questionFlowAnswers({ ...round, questions: [{ ...round.questions[0], multiple: false }] }, { scope: ["cases", "skip"] })).toBeNull();
  expect(questionFlowAnswers({ ...round, questions: [{ ...round.questions[0], scopeChoices: undefined }] }, { scope: ["option_0"] })).toBeNull();
});

it("uses option labels only for business answers and restores only recorded choices", () => {
  const business: QuestionRound = { questions: [{ id: "role", title: "谁使用？", options: ["学生", "教师"], recommendation: "学生", multiple: false }], answers: [] };
  const answers = questionFlowAnswers(business, { role: ["option_1"] })!;
  expect(answers).toEqual([{ questionId: "role", answer: "教师" }]);
  expect(questionFlowReceipt({ ...business, answers })).toEqual({ role: ["option_1"] });
  expect(questionFlowReceipt({ ...business, answers: [{ questionId: "role", answer: "其他人" }] })).toBeUndefined();
});

it("keeps a receipt on its original assistant message after a new round or reload", () => {
  const state = createStandardProjectState();
  const answers = questionFlowAnswers(round, { scope: ["cases"] })!;
  const completed = { ...round, answers };
  const pending: QuestionRound = { questions: [{ id: "role", title: "谁使用？", options: ["学生", "教师"], recommendation: "学生", multiple: false }], answers: [] };
  state.rounds = [completed, pending];
  state.conversation = [
    { id: "ask1", role: "assistant", text: "", status: "completed", createdAt: "now" },
    { id: "answer1", role: "user", text: "用例图", answers, status: "completed", createdAt: "now" },
    { id: "ask2", role: "assistant", text: "", status: "completed", createdAt: "now" },
  ];
  expect(questionRoundForMessage(structuredClone(state), "ask1")).toEqual(completed);
  expect(questionRoundForMessage(state, "ask2")).toBe(pending);
  expect(questionFlowReceipt(completed)).toEqual({ scope: ["cases"] });
  state.unsupportedDiagramRequest = { models: ["状态图"], messageId: "user", questionId: "replacement" };
  expect(questionRoundForMessage(state, "ask2")).toBeUndefined();
  expect(questionRoundForMessage(state, "ask1")).toEqual(completed);
});
