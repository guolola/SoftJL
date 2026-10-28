// Covers prompt catalog visibility, version transitions, and run-level pinning.
import { strictTestModelCapability } from "../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { catalog, findPromptForMessage } from "./catalog.js";
import { PromptRuntimeStore, applyPublishedInstructions, withPinnedPrompts } from "./store.js";
import type { LlmTransport } from "../adapters/llm/llm-transport.js";
import { feasibilityInputsSchema, type DiagramModelSpec, type ContextDiagramSpec, type ActivityDiagramSpec } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { buildExtractRulesPrompt, buildGenerateModelsPrompt, buildGenerateRequirementAnalysisPrompt,
  buildGenerateDesignSequencePrompt, buildGenerateFeasibilityContextPrompt, buildGenerateFeasibilityBusinessFlowPrompt,
  buildGenerateFeasibilityImplementationPrompt, buildGenerateDocumentContentPrompt,
  buildFocusedRepairPrompt, buildGenerateDesignModelsPrompt, buildModelRepairPrompt } from "@uml-platform/prompts";

for (const kind of ["architecture", "class", "navigation", "component", "deployment", "table"] as const) {
  test(`published instructions reach the actual ${kind} generation prompt`, async () => {
    const store = new PromptRuntimeStore(null);
    const prompt = buildGenerateDesignModelsPrompt([], [], [kind]);
    const id = `design.model.${kind}`;
    assert.equal(findPromptForMessage(prompt)?.id, id);
    const version = await store.createDraft(id, `已发布的 ${kind} 约束`, "operator");
    await store.submit(id, version.id);
    await store.approve(id, version.id, "operator");
    const applied = applyPublishedInstructions(prompt, await store.publishedSnapshot());
    assert.equal(applied.split("\n")[0], `已发布的 ${kind} 约束`);
    assert.equal(applied.slice(applied.indexOf("\n")), prompt.slice(prompt.indexOf("\n")), "schemas and source facts stay intact");
  });
}

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
  await store.submit(id, draft.id);
  await store.approve(id, draft.id, "operator");
  const pinnedA = await store.publishedSnapshot();
  assert.equal(applyPublishedInstructions(defaultPrompt, pinnedA), "新任务指令 A\n固定输出契约");

  const next = await store.createDraft(id, "新任务指令 B", "operator");
  await store.submit(id, next.id);
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
      providerSettings: { modelCapability: strictTestModelCapability("test"), model: "test", apiBaseUrl: "https://example.com", apiKey: "test" },
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
  const prompt = buildGenerateModelsPrompt([], ["class"]);
  assert.equal(findPromptForMessage(prompt)?.id, "requirements.model.class");
});

test("only current repair workflows are configurable and published instructions reach their prompts", async () => {
  const store = new PromptRuntimeStore(null);
  for (const id of ["requirements.extract-repair", "requirements.repair", "requirements.trace", "requirements.trace-repair", "design.repair", "design.trace", "design.trace-repair", "feasibility.json-repair", "feasibility.plan-repair", "feasibility.section-repair", "documents.repair"]) {
    await assert.rejects(() => store.detail(id), { statusCode: 404 });
    await assert.rejects(() => store.createDraft(id, "obsolete instruction", "operator"), { statusCode: 404 });
  }
  const prompts = [
    { id: "shared.model-repair", source: "model-repair-prompts.ts", prompt: buildModelRepairPrompt({ error: "invalid reference", diagnostics: [] }) },
    { id: "shared.field-repair", source: "generation-repair-prompts.ts", prompt: buildFocusedRepairPrompt({
      targetId: "document", mode: "field-patch", baseFingerprint: "current", paths: ["sections.0.body"], round: 1,
      error: "invalid body", current: {}, references: [],
    }) },
  ];
  for (const { id, source, prompt } of prompts) {
    assert.equal(findPromptForMessage(prompt)?.id, id);
    assert.equal((await store.detail(id)).source, source);
    const draft = await store.createDraft(id, "当前修复指令", "operator");
    await store.submit(id, draft.id);
    await store.approve(id, draft.id, "operator");
    assert.equal(applyPublishedInstructions(prompt, await store.publishedSnapshot()), "当前修复指令" + prompt.slice(prompt.indexOf("\n")));
  }
});

test("persisted published instructions reject removed catalog entries without adapting them", async () => {
  const pool = { query: async () => ({ rows: [{ prompt_id: "requirements.trace" }] }) } as unknown as Pool;
  await assert.rejects(() => new PromptRuntimeStore(pool).publishedSnapshot(), { statusCode: 409 });
});

test("catalog instructions match real requirement, feasibility, design and document builders", async () => {
  const usecase = modelFixture("requirements", "usecase") as DiagramModelSpec;
  const inputs = feasibilityInputsSchema.parse({});
  const prompts: Array<[string, string]> = [
    ["requirements.extract", buildExtractRulesPrompt("本次真实需求")],
    ...(["context", "function", "usecase", "class", "activity", "deployment", "prototype"] as const)
      .map(kind => [`requirements.model.${kind}`, buildGenerateModelsPrompt([], [kind])] as [string, string]),
    ["requirements.analysis", buildGenerateRequirementAnalysisPrompt(usecase)],
    ["design.sequence", buildGenerateDesignSequencePrompt(usecase)],
    ["feasibility.context", buildGenerateFeasibilityContextPrompt({ rules: [], inputs })],
    ["feasibility.business-flow", buildGenerateFeasibilityBusinessFlowPrompt({ rules: [], inputs })],
    ["feasibility.implementation", buildGenerateFeasibilityImplementationPrompt({ rules: [], inputs,
      contextModel: modelFixture("feasibility", "context") as ContextDiagramSpec,
      businessFlow: { model: modelFixture("feasibility", "activity") as ActivityDiagramSpec, traceability: [] } })],
    ...(["requirementsSpec", "softwareDesignSpec", "feasibilityStudy"] as const)
      .map(kind => ["documents.generate", buildGenerateDocumentContentPrompt(kind, { title: "绑定的产物" })] as [string, string]),
  ];
  for (const [id, prompt] of prompts) {
    const store = new PromptRuntimeStore(null);
    const item = catalog.find(item => item.id === id)!;
    assert.equal(findPromptForMessage(prompt)?.id, id);
    assert.ok(prompt.includes(item.instruction), `${id} default instruction must occur in its real prompt`);
    const draft = await store.createDraft(id, "发布后的任务指令", "operator");
    await store.submit(id, draft.id);
    await store.approve(id, draft.id, "reviewer");
    const applied = applyPublishedInstructions(prompt, await store.publishedSnapshot());
    assert.equal(applied, prompt.replace(item.match, "发布后的任务指令"), `${id} preserves fixed contracts and bound facts`);
    assert.deepEqual((await store.detail(id)).path, (await store.list()).find(item => item.id === id)?.path);
  }
});

test("timeout retry catalog instructions occur in the running pipeline", async () => {
  const source = await readFile(new URL("../runs/pipelines/requirements-pipeline.ts", import.meta.url), "utf8");
  for (const id of ["requirements.activity-compact", "requirements.analysis-compact"]) {
    const item = catalog.find(item => item.id === id)!;
    assert.ok(source.includes(JSON.stringify(item.instruction)), id);
    const prompt = item.instruction + "\n固定字段及当前业务资料";
    assert.equal(findPromptForMessage(prompt)?.id, id);
    assert.equal(applyPublishedInstructions(prompt, { [id]: { id: "published", content: "重试指令" } }), "重试指令\n固定字段及当前业务资料");
  }
});

test("model paths use stage-specific Chinese terms and project facts cannot select instructions", () => {
  assert.equal(catalog.find(item => item.id === "requirements.model.class")?.path.at(-1), "领域概念模型");
  assert.equal(catalog.find(item => item.id === "design.model.class")?.path.at(-1), "设计类图");
  for (const item of catalog) {
    assert.match(item.path.at(-1)!, /[\u4e00-\u9fff]/u);
    if (item.match) assert.equal(findPromptForMessage("项目资料：\n" + item.match), null);
  }
});

test("pinned instructions reach multimodal extraction while preserving images and assistant output", async () => {
  const prompt = buildExtractRulesPrompt("图片中的需求");
  const image = { type: "image_url" as const, image_url: { url: "data:image/png;base64,test" } };
  const messages = [
    { role: "user" as const, content: [{ type: "text" as const, text: prompt }, image] },
    { role: "assistant" as const, content: prompt },
  ];
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    assert.deepEqual(input.messages, [
      { role: "user", content: [{ type: "text", text: prompt.replace(catalog.find(item => item.id === "requirements.extract")!.match, "图片抽取指令") }, image] },
      messages[1],
    ]);
    yield "ok";
  } };
  for await (const part of withPinnedPrompts(transport, { "requirements.extract": { id: "pinned", content: "图片抽取指令" } }).streamChatCompletion({
    providerSettings: { modelCapability: strictTestModelCapability("test"), model: "test", apiBaseUrl: "https://example.com", apiKey: "test" }, messages,
  })) assert.equal(part, "ok");
  assert.equal((messages[0].content as Array<{ text?: string }>)[0].text, prompt);
});
