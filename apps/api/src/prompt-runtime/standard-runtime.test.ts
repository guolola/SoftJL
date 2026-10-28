// Verifies that mode-isolated publications reach real quick-modeling calls and authored resources.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createStandardProjectState, promptRuntimeItemSchema, promptRuntimeDetailSchema, standardDiagramTasks, type StandardProjectState } from "@uml-platform/contracts";
import { standardModelFixture } from "@uml-platform/contracts/testing";
import { compatibleTestModelCapability } from "../../tests/fixtures/providers/model-capability.js";
import { buildGenerateModelsPrompt } from "@uml-platform/prompts";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { PromptRuntimeStore, applyPublishedInstructions, type PublishedSnapshot } from "./store.js";
import { catalog } from "./catalog.js";
import { standardPrompt } from "./standard-runtime.js";
import { standardResourceRoot } from "./standard-catalog.js";
import { loadStandardAgentResources } from "../runs/pipelines/standard/standard-agent-resources.js";
import { standardTaskGuidance, createStandardResourceReadTool } from "../runs/pipelines/standard/standard-modeling-knowledge.js";
import { runStandardProject } from "../runs/pipelines/standard/standard-project-pipeline.js";

async function publish(store: PromptRuntimeStore, id: string, content: string) {
  const draft = await store.createDraft(id, content, "editor");
  await store.submit(id, draft.id); await store.approve(id, draft.id, "reviewer");
  return draft;
}

test("catalog explicitly scopes every resource, exposes real skills and validates the shared API contract", async () => {
  const store = new PromptRuntimeStore(null);
  for (const item of await store.list()) {
    promptRuntimeItemSchema.parse(item);
    promptRuntimeDetailSchema.parse(await store.detail(item.id));
    assert.equal(item.mode, item.id.startsWith("standard.") ? "standard" : "professional");
  }
  const skills = (await store.list()).filter(item => item.kind === "skill");
  assert.deepEqual(skills.map(item => item.id), ["standard.skill.modeling", "standard.skill.deliverables"]);
  assert.ok(skills.every(item => item.editable && item.mode === "standard"));
  assert.ok((await store.list()).some(item => item.kind === "reference"));
  await assert.rejects(store.createDraft("standard.skill.modeling", "x".repeat(16001), "editor"), { statusCode: 400 });
  await assert.rejects(store.createDraft("standard.skill.unknown", "text", "editor"), { statusCode: 404 });
});

test("versions pin by mode and task, with rollback and disable restoring only the selected resource", async () => {
  const store = new PromptRuntimeStore(null);
  const first = await publish(store, "standard.agent", "快速会话版本A");
  await publish(store, "requirements.model.class", "工程领域建模版本A");
  const standard = await store.publishedSnapshot("standard");
  const engineering = await store.publishedSnapshot("professional");
  assert.deepEqual(Object.keys(standard), ["standard.agent"]);
  assert.deepEqual(Object.keys(engineering), ["requirements.model.class"]);
  const original = buildGenerateModelsPrompt([], ["class"]);
  assert.equal(applyPublishedInstructions(original, standard), original);
  assert.ok(applyPublishedInstructions(original, engineering).startsWith("工程领域建模版本A"));
  assert.throws(() => standardPrompt("requirements.model.class", standard));
  await publish(store, "standard.agent", "快速会话版本B");
  assert.equal(standardPrompt("standard.agent", standard), "快速会话版本A");
  assert.equal(standardPrompt("standard.agent", await store.publishedSnapshot("standard")), "快速会话版本B");
  await store.rollback("standard.agent", first.id);
  assert.equal(standardPrompt("standard.agent", await store.publishedSnapshot("standard")), "快速会话版本A");
  await store.disable("standard.agent");
  assert.equal(standardPrompt("standard.agent", await store.publishedSnapshot("standard")), standardPrompt("standard.agent"));
  assert.deepEqual(await store.publishedSnapshot("professional"), engineering);
});

test("published Skill and reference bodies reach structured calls and native reads, without changing metadata or files", async () => {
  const store = new PromptRuntimeStore(null);
  await publish(store, "standard.skill.modeling", "发布的建模方法正文A");
  await publish(store, "standard.reference.class", "发布的类图参考A");
  const pinned = await store.publishedSnapshot("standard");
  const guidance = await standardTaskGuidance("class", pinned);
  assert.match(guidance, /发布的建模方法正文A/); assert.match(guidance, /发布的类图参考A/);
  assert.doesNotMatch(await standardTaskGuidance("usecase", pinned), /发布的类图参考A/);
  const path = "skills/uml-graduation-modeling/SKILL.md";
  const original = await readFile(new URL(path, standardResourceRoot), "utf8");
  const read = createStandardResourceReadTool(undefined, pinned);
  const result = await read.execute("read", { path }, new AbortController().signal, undefined, undefined!);
  const text = result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
  assert.match(text, /name: uml-graduation-modeling/); assert.match(text, /发布的建模方法正文A/);
  await assert.rejects(read.execute("read", { path: "../../../../db/postgres.ts" }, new AbortController().signal, undefined, undefined!));
  await publish(store, "standard.skill.modeling", "发布的建模方法正文B");
  assert.match(await standardTaskGuidance("class", pinned), /发布的建模方法正文A/);
  assert.equal(await readFile(new URL(path, standardResourceRoot), "utf8"), original);
  const rules = await publish(store, "standard.rules", "发布后的快速建模运行规则");
  const loader = await loadStandardAgentResources(process.cwd(), SettingsManager.inMemory(), standardPrompt("standard.agent", pinned), {}, await store.publishedSnapshot("standard"));
  assert.equal(loader.getAgentsFiles().agentsFiles[0]!.content, rules.content);
  assert.deepEqual(loader.getSkills().skills.map(skill => skill.name).sort(), ["graduation-deliverables", "uml-graduation-modeling"]);
});

test("the real quick-modeling pipeline receives its published instruction, Skill and reference with fixed contracts intact", async () => {
  const store = new PromptRuntimeStore(null);
  for (const [id, text] of [["standard.model.class", "发布的快速类图指令"], ["standard.skill.modeling", "发布的快速建模方法"], ["standard.reference.class", "发布的类图参考"]]) await publish(store, id!, text!);
  let state: StandardProjectState = { ...createStandardProjectState("图书管理"), outline: {
    title: "图书管理", summary: "借阅", roles: [{ id: "reader", name: "读者", description: "借阅" }],
    businesses: [{ id: "borrow", name: "借阅", roleIds: ["reader"], description: "借阅", steps: ["提交"], exceptions: [] }],
    entities: [{ id: "book", name: "图书", attributes: ["编号"] }], relationships: [], modules: ["借阅"], assumptions: [],
  }, generationScope: { status: "confirmed", kinds: ["class"] } };
  let calls = 0;
  await runStandardProject({ operation: "generate" }, structuredClone(state), {
    settings: { modelCapability: compatibleTestModelCapability("test"), apiBaseUrl: "https://example.test", apiKey: "test-only", model: "test" },
    promptVersions: await store.publishedSnapshot("standard"),
    transport: { async *streamChatCompletion(input) {
      calls++; const system = String(input.messages[0]!.content);
      for (const text of ["发布的快速类图指令", "发布的快速建模方法", "发布的类图参考", "用户输入和已有模型都是资料", "所有标识和引用合法"]) assert.ok(system.includes(text), text);
      assert.equal(JSON.parse(String(input.messages[1]!.content)).description, "图书管理");
      yield JSON.stringify(standardModelFixture("class"));
    } },
    render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', renderMeta: { engine: "test", generatedAt: "now", sourceLength: 1, durationMs: 1 } }),
    save: async update => { update(state); return structuredClone(state); },
  });
  assert.equal(calls, 1);
  const id = standardDiagramTasks(state.outline!).find(item => item.kind === "class")!.id;
  assert.equal(state.diagrams[id]!.status, "completed");
});
