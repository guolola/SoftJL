// Verifies unsupported-model detection, explicit notices and the non-bypassable alternative-consent boundary.
import assert from "node:assert/strict";
import test from "node:test";
import { createStandardProjectState, type StandardQuestion } from "@uml-platform/contracts";
import { detectUnsupportedStandardDiagrams, recordUnsupportedDiagramRequest, prepareStandardAlternativeQuestion, unsupportedDiagramNotice, assertStandardDiagramSubstitutionAllowed } from "./standard-diagram-support.js";
import { resolveStandardScopeAnswers } from "./standard-generation-scope.js";

test("detects requests for unsupported UML and chart types without treating explanations or exclusions as consent", () => {
  assert.deepEqual(detectUnsupportedStandardDiagrams("为座位状态流转补充UML状态图"), ["UML 状态图"]);
  assert.deepEqual(detectUnsupportedStandardDiagrams("状态图"), ["UML 状态图"]);
  assert.deepEqual(detectUnsupportedStandardDiagrams("Please draw a state machine diagram and a deployment diagram"), ["UML 状态图", "UML 部署图"]);
  assert.deepEqual(detectUnsupportedStandardDiagrams("生成对象图、包图"), ["UML 对象图", "UML 包图"]);
  assert.deepEqual(detectUnsupportedStandardDiagrams("请生成热力图"), ["热力图"]);
  assert.deepEqual(detectUnsupportedStandardDiagrams("Draw a reliability diagram"), ["reliability diagram"]);
  for (const value of ["状态图有什么作用？", "请解释状态图与业务流程图的区别", "不要生成状态图，只生成业务流程图", "生成总体架构图和概念 E-R 图"]) {
    assert.deepEqual(detectUnsupportedStandardDiagrams(value), [], value);
  }
});

test("recording unsupported requests revokes old consent and provides an idempotent user-visible notice", () => {
  const state = createStandardProjectState(); state.generationScope = { status: "confirmed", kinds: ["activity"] };
  recordUnsupportedDiagramRequest(state, ["UML 状态图"], "user:r");
  recordUnsupportedDiagramRequest(state, ["UML 状态图"], "user:r");
  assert.deepEqual(state.generationScope, { status: "confirmed", kinds: [] });
  assert.equal(state.conversation?.length, 1);
  assert.match(state.conversation![0]!.text, /不支持生成.*状态图.*不会擅自替换/);
  assert.match(unsupportedDiagramNotice(["state diagram"], "en"), /does not support.*No other diagram/);
  state.generationScope = { status: "confirmed", kinds: ["activity"] };
  assert.throws(() => assertStandardDiagramSubstitutionAllowed(state), /询问组件确认/);
});

test("alternative choices disclose actual supported types and require a decline option and matching Ask identity", () => {
  const question: StandardQuestion = { id: "scope_new", title: "生成状态图？", multiple: false,
    options: ["生成状态图", "否"], recommendation: "推荐生成", scopeChoices: [
      { id: "yes", label: "生成状态图", kinds: ["activity"], recommended: true },
      { id: "no", label: "否", kinds: [], recommended: false },
    ] };
  prepareStandardAlternativeQuestion(question, ["UML 状态图"]);
  assert.match(question.title, /当前不支持.*状态图/);
  assert.deepEqual(question.options, ["改为生成：业务流程图", "不生成替代图"]);
  assert.match(question.recommendation, /不是原模型的等价替代/);
  const pending = { models: ["UML 状态图"], messageId: "user:r", questionId: "scope_new" };
  const round = { purpose: "generation_scope" as const, questions: [question], answers: [] };
  assert.deepEqual(resolveStandardScopeAnswers(round, [{ questionId: question.id, answer: "改为生成：业务流程图", selectedOptionIds: ["yes"] }], pending), ["activity"]);
  assert.throws(() => resolveStandardScopeAnswers(round, [{ questionId: question.id, answer: "同意", selectedOptionIds: ["yes"] }], { ...pending, questionId: "scope_old" }), /本轮替代方案/);
  assert.throws(() => prepareStandardAlternativeQuestion({ ...question, scopeChoices: question.scopeChoices!.slice(0, 1) }, ["UML 状态图"]), /不生成选项/);
});
