// Covers prompt catalog visibility, version transitions, and run-level pinning.
import assert from "node:assert/strict";
import test from "node:test";
import { catalog, findPromptForMessage } from "./catalog.js";
import { PromptRuntimeStore, applyPublishedInstructions, withPinnedPrompts } from "./store.js";
import type { LlmTransport } from "../llm.js";

test("catalog exposes active categories and keeps shared instructions read-only", async () => {
  const store = new PromptRuntimeStore(null);
  const items = await store.list();
  for (const category of ["需求建模", "可行性分析", "设计建模", "文档与渲染"]) {
    assert.ok(items.some((item) => item.path[0] === category));
  }
  assert.ok(items.some((item) => item.id === "feasibility.business-flow"));
  assert.equal(items.some((item) => item.id.startsWith("code.") || item.id === "skill.ui-ux-pro-max"), false);
  assert.equal(items.find((item) => item.id === "shared.json")?.editable, false);
  assert.ok(catalog.length > 10);
  await assert.rejects(() => store.createDraft("shared.json", "修改", "admin"), { statusCode: 403 });
});

test("published versions affect new snapshots only and can be rolled back or disabled", async () => {
  const store = new PromptRuntimeStore(null);
  const id = "requirements.extract";
  const defaultPrompt = catalog.find((item) => item.id === id)!.instruction + "\n固定输出契约";
  const original = await store.publishedSnapshot();
  assert.equal(applyPublishedInstructions(defaultPrompt, original), defaultPrompt);
  const draft = await store.createDraft(id, "新任务指令 A", "operator");
  await assert.rejects(() => store.updateDraft(id, draft.id, "冲突", 99, "operator"), { statusCode: 409 });
  const revised = await store.updateDraft(id, draft.id, "新任务指令 A", 1, "operator");
  assert.equal(revised.revision, 2);
  assert.equal(applyPublishedInstructions(defaultPrompt, await store.publishedSnapshot()), defaultPrompt);
  await store.submit(id, draft.id, "operator");
  await store.approve(id, draft.id, "operator");
  const pinnedA = await store.publishedSnapshot();
  assert.equal(applyPublishedInstructions(defaultPrompt, pinnedA), "新任务指令 A\n固定输出契约");

  const next = await store.createDraft(id, "新任务指令 B", "operator");
  await store.submit(id, next.id, "operator");
  await store.approve(id, next.id, "operator");
  const pinnedB = await store.publishedSnapshot();
  const transport: LlmTransport = {
    async *streamChatCompletion(input) {
      yield String(input.messages[1]?.content ?? "");
    },
  };
  async function result(snapshot: typeof pinnedA) {
    let value = "";
    for await (const part of withPinnedPrompts(transport, snapshot).streamChatCompletion({
      providerSettings: { model: "test", apiBaseUrl: "https://example.com", apiKey: "test" },
      messages: [{ role: "system", content: "只返回 JSON" }, { role: "user", content: defaultPrompt }],
    })) value += part;
    return value;
  }
  assert.match(await result(pinnedA), /新任务指令 A/);
  assert.match(await result(pinnedB), /新任务指令 B/);
  await store.rollback(id, draft.id);
  assert.match(applyPublishedInstructions(defaultPrompt, await store.publishedSnapshot()), /新任务指令 A/);
  await store.disable(id);
  assert.equal(applyPublishedInstructions(defaultPrompt, await store.publishedSnapshot()), defaultPrompt);
});

test("diagram-specific prompts select the matching leaf", () => {
  const prompt = "请根据已确认的需求规则和 RequirementBaseline 生成需求阶段 UML 结构化模型。\n只生成以下图类型：\nclass\n";
  assert.equal(findPromptForMessage(prompt)?.id, "requirements.model.class");
});
