// Verifies native image input, exact evidence, replay and atomic acceptance for engineering inputs.
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ModelingAttachment, ProviderSettings, RunSnapshot } from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "../../../adapters/llm/llm-transport.js";
import { createInMemoryLlmScheduler, createScheduledLlmTransport } from "../../../adapters/llm/llm-scheduler.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { cancelRunRecord, createQueuedRunFromSource } from "../../records/run-actions.js";
import { RunCancelledError } from "../../records/run-cancellation.js";
import { createRunRecordStore, type RunRecord } from "../../records/run-record-store.js";
import { createContextualLlmTransport } from "../shared/conversation-context.js";
import { getRunError } from "../shared/errors.js";
import { runStagePipeline } from "../requirements-pipeline.js";
import { prepareRequirementInput } from "./prepare-requirement-input.js";
import { emptyRequirementTokenUsage } from "../../records/requirement-token-usage.js";

const settings: ProviderSettings = { modelCapability: strictTestModelCapability("vision-model"), apiBaseUrl: "https://llm.test", apiKey: "test", model: "vision-model" };
const document: ModelingAttachment = { id: "scope", name: "scope.md", type: "document", contentType: "text/markdown", text: "用户可以提交维修预约。" };
const image: ModelingAttachment = { id: "image", name: "流程.png", type: "image", contentType: "image/png", data: "iVBORw0KGgo=" };
const imageText = "管理员最多审核10笔维修预约。";
const render = async (): Promise<never> => { throw new Error("unexpected render"); };
const textContent = (request: StreamChatCompletionInput) => {
  const content = request.messages[1]!.content;
  return typeof content === "string" ? content : content.filter(part => part.type === "text").map(part => part.text)[0]!;
};
const imagesIn = (request: StreamChatCompletionInput) => request.messages.flatMap(message => typeof message.content === "string" ? [] : message.content.filter(part => part.type === "image_url"));

function setup(options: { text?: string; attachments?: ModelingAttachment[]; rejectScreening?: boolean; failScreening?: boolean; cancelAfterScreening?: boolean; mutateAfterScreening?: boolean; reportUsage?: boolean; ignoreImage?: boolean; repair?: boolean } = {}) {
  const text = options.text ?? "维修预约系统。";
  const attachments = options.attachments ?? [document, image];
  const record: RunRecord = { snapshot: createEmptySnapshot("attachment-run", text, [], [], { attachments, submittedRequirementText: text, reasoning: true }), events: [], listeners: new Set(), terminal: false };
  const prepared = prepareRequirementInput(record.snapshot as RunSnapshot);
  const calls: StreamChatCompletionInput[] = [];
  let extractionCalls = 0;
  const providerTransport: LlmTransport = { async *streamChatCompletion(request) {
    calls.push(request);
    if (options.reportUsage) request.onTokenUsage?.({ inputTokens: calls.length * 100, outputTokens: 20, cachedInputTokens: 10, reasoningTokens: null, totalTokens: calls.length * 100 + 20 });
    assert.equal(request.reasoning, true);
    if (String(request.messages[0]?.content).includes("你是软件需求输入检查器")) {
      if (options.failScreening) throw new Error("vision provider failed");
      const units = JSON.parse(textContent(request)) as { id: string; text: string; sourceType?: string }[];
      assert.equal((record.snapshot as RunSnapshot).requirementText, text);
      yield JSON.stringify({ units: units.map(unit => ({ id: unit.id, category: options.rejectScreening ? "injection" : unit.sourceType === "image" ? options.ignoreImage ? "irrelevant" : "requirement" : /^(?:维修预约系统。|【文本附件：)/u.test(unit.text) ? "context" : "requirement" })) });
      if (options.cancelAfterScreening) cancelRunRecord(record, record.snapshot.runId);
      if (options.mutateAfterScreening) (record.snapshot as RunSnapshot).attachments = [{ ...image, data: "iVBORw0KGgoAAA==" }];
      return;
    }
    extractionCalls++;
    const rules = attachments.flatMap((attachment, index) => attachment.type === "document"
      ? [{ text: attachment.text, sourceFragment: attachment.text }]
      : options.ignoreImage ? [] : [{ text: imageText, sourceFragment: options.repair && extractionCalls === 1 ? "编造的图片原文" : prepared.images.find(item => item.sourceLabel.startsWith(`【图片附件 ${index + 1}：`))!.sourceLabel }]);
    yield JSON.stringify({ rules: rules.map((rule, index) => ({ id: `r${index + 1}`, type: "functional", ...rule })) });
  } };
  const conversation = createContextualLlmTransport(createScheduledLlmTransport({ transport: providerTransport,
    scheduler: createInMemoryLlmScheduler(), context: { runId: "attachment-run", model: settings.model, taskType: "requirements_to_uml" },
  }));
  return { record, calls, prepared, run: () => runStagePipeline(record, settings, conversation, render) };
}

test("screens and extracts directly from original images with no separate transcription request", async () => {
  const { record, calls, run } = setup();
  await run();
  const snapshot = record.snapshot as RunSnapshot;
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.submittedRequirementText, "维修预约系统。");
  assert.match(snapshot.requirementText, /文本附件："scope.md"/);
  assert.match(snapshot.requirementText, /图片附件 2："流程.png"/);
  assert.ok(!snapshot.requirementText.includes(imageText));
  assert.equal(snapshot.rules.length, 2);
  assert.equal(snapshot.rules[1]!.sourceFragment, '【图片附件 2："流程.png"】');
  assert.ok(snapshot.requirementBaseline?.sourceInputFingerprint);
  assert.equal(calls.length, 2);
  for (const request of calls) assert.deepEqual(imagesIn(request), [{ type: "image_url", image_url: { url: `data:image/png;base64,${image.data}` } }]);
  assert.ok(record.events.some(event => event.type === "run_activity" && event.inputImages?.some(item => item.url.includes(image.data))));
  assert.deepEqual(calls[1]!.messages.map(message => message.role), ["system", "user"]);
  const prompt = textContent(calls[1]!);
  assert.match(prompt, /原始需求文本及本次实际绑定的原图.*全部资料/);
  assert.match(prompt, /文本规则的 sourceFragment 必须逐字来自本次原文/);
  assert.match(prompt, /sourceFragment 必须完整引用对应的单个【图片附件 …】来源标记/);
  assert.match(prompt, /规则抽取自检/);
  assert.doesNotMatch(prompt, /每条规则.*sourceFragment 必须逐字来自原文/);
});

test("text-only and image-only attachment requests work without an input message", async () => {
  for (const attachment of [document, image]) {
    const { record, calls, run } = setup({ text: "", attachments: [attachment] });
    await run();
    assert.equal(record.snapshot.status, "completed");
    assert.equal(calls.length, 2);
    assert.equal(imagesIn(calls[1]!).length, attachment.type === "image" ? 1 : 0);
  }
});

test("screening rejection or provider failure preserves original source, attachments and baseline", async () => {
  for (const options of [{ rejectScreening: true }, { failScreening: true }]) {
    const { record, run } = setup(options);
    const baseline = record.snapshot.requirementBaseline;
    await assert.rejects(run, error => getRunError(error)?.code === (options.rejectScreening ? "RUN_REQUIREMENT_INPUT_UNSAFE" : "RUN_REQUIREMENT_SCREENING_FAILED"));
    assert.equal(record.snapshot.requirementText, "维修预约系统。");
    assert.deepEqual(record.snapshot.rules, []);
    assert.equal(record.snapshot.requirementBaseline, baseline);
    assert.deepEqual((record.snapshot as RunSnapshot).attachments, [document, image]);
  }
});

test("retry retains original attachments and reasoning without duplicating source labels", async () => {
  const { record, run } = setup();
  await run();
  record.snapshot.status = "failed";
  const runs = createRunRecordStore();
  createQueuedRunFromSource({ runs, source: record, action: "retry", sourceRunId: "attachment-run", runId: "retry" });
  const snapshot = runs.get("retry")!.snapshot as RunSnapshot;
  assert.equal(snapshot.submittedRequirementText, "维修预约系统。");
  assert.deepEqual(snapshot.attachments, [document, image]);
  assert.equal(snapshot.reasoning, true);
  assert.equal(prepareRequirementInput(snapshot).sourceText, record.snapshot.requirementText);
});

test("source budget counts escaped titles and separators while leaving images as native content", () => {
  const first = { ...document, name: 'scope "quoted"\n.md', text: "" };
  const original = "业务需求。";
  const firstPrefix = `\n\n【文本附件：${JSON.stringify(first.name)}】\n`;
  const imageSuffix = `\n\n【图片附件 2：${JSON.stringify(image.name)}】`;
  first.text = "x".repeat(60000 - original.length - firstPrefix.length - imageSuffix.length);
  const snapshot = createEmptySnapshot("budget", original, [], [], { attachments: [first, image] });
  const prepared = prepareRequirementInput(snapshot);
  assert.equal(prepared.sourceText.length, 60000);
  assert.equal(prepared.sourceText, original + firstPrefix + first.text + imageSuffix);
  assert.equal(prepared.images.length, 1);
  first.text += "x";
  snapshot.attachments = [first, image];
  assert.throws(() => prepareRequirementInput(snapshot), /来源标题.*60,000/);
  assert.equal(snapshot.requirementText, original);
});

test("a cancellation after screening prevents extraction and partial acceptance", async () => {
  const { record, calls, run } = setup({ attachments: [image], cancelAfterScreening: true });
  const baseline = record.snapshot.requirementBaseline;
  await assert.rejects(run, error => error instanceof RunCancelledError);
  assert.equal(calls.length, 1);
  assert.equal(record.snapshot.status, "cancelled");
  assert.equal(record.snapshot.requirementText, "维修预约系统。");
  assert.deepEqual(record.snapshot.rules, []);
  assert.equal(record.snapshot.requirementBaseline, baseline);
  assert.equal(record.terminal, true);
  assert.equal(record.events.at(-1)?.type, "cancelled");
});

test("usage includes just screening and extraction calls", async () => {
  const { record, run } = setup({ reportUsage: true });
  const snapshot = record.snapshot as RunSnapshot;
  snapshot.tokenUsage = emptyRequirementTokenUsage(settings.model, { context: 1000000, output: 8192, source: "models.dev", matchedId: settings.model, updatedAt: null });
  await run();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.tokenUsage.contextTokens, 220);
  assert.equal(snapshot.tokenUsage.contextBudget, 1000000);
  assert.deepEqual(snapshot.tokenUsage.cumulative, { total: 340, calls: 2, unreportedCalls: 0 });
});

test("a changed image after screening cannot be accepted as the screened source", async () => {
  const { record, calls, run } = setup({ mutateAfterScreening: true });
  await assert.rejects(run, /需求来源已变化/);
  assert.equal(calls.length, 1);
  assert.deepEqual(record.snapshot.rules, []);
  assert.equal(record.snapshot.requirementText, "维修预约系统。");
});

test("repeated IDs and punctuation in names remain distinct atomic image sources", async () => {
  const attachments = [image, { ...image, name: "另一个；流程！.png" }];
  const { record, calls, prepared, run } = setup({ text: "", attachments });
  assert.equal(prepared.sourceUnits.length, 2);
  assert.notEqual(prepared.images[0]!.sourceLabel, prepared.images[1]!.sourceLabel);
  await run();
  assert.equal(record.snapshot.rules.length, 2);
  assert.equal(imagesIn(calls[1]!).length, 2);
});

test("excluded images are not forwarded to extraction", async () => {
  const { record, calls, run } = setup({ ignoreImage: true });
  await run();
  assert.equal(record.snapshot.rules.length, 1);
  assert.equal(imagesIn(calls[0]!).length, 1);
  assert.equal(imagesIn(calls[1]!).length, 0);
});

test("repair retains original image bytes and rejects invented image transcription as evidence", async () => {
  const { record, calls, run } = setup({ repair: true });
  await run();
  assert.equal(calls.length, 3);
  assert.equal(record.snapshot.rules.length, 2);
  assert.deepEqual(calls[2]!.messages.slice(0, 2), calls[1]!.messages);
  assert.equal(imagesIn(calls[2]!).length, 1);
  assert.match(String(calls[2]!.messages.at(-1)!.content), /source-fragment-invalid/);
});
