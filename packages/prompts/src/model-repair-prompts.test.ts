// Ensures model correction requests locate errors while requiring a complete result in the same conversation.
import assert from "node:assert/strict";
import test from "node:test";
import { buildModelRepairPrompt } from "./model-repair-prompts.js";

test("model feedback allows linked changes and requires the complete original output contract", () => {
  const prompt = buildModelRepairPrompt({ error: "tree-parent: 多个父节点", diagnostics: [{ path: "models.0.relationships" }] });
  assert.match(prompt, /完整 JSON/);
  assert.match(prompt, /节点、关系、引用和来源映射/);
  assert.match(prompt, /tree-parent/);
  assert.match(prompt, /models\.0\.relationships/);
  assert.match(prompt, /不得通过删除需求要求的业务内容/);
  assert.doesNotMatch(prompt, /允许修改路径|"changes":\[|修复上下文|targetId|baseFingerprint|full-output|"paths"|"round"|可选|额外修复说明/);
});

test("syntax errors without structured diagnostics omit the empty diagnostic section", () => {
  const prompt = buildModelRepairPrompt({ error: "JSON 字符串未闭合", diagnostics: [] });
  assert.match(prompt, /JSON 字符串未闭合/);
  assert.doesNotMatch(prompt, /完整校验诊断|\[\]|可选|修复上下文/);
});
