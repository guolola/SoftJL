// Verifies source provenance, actual vision calls, replay and atomic acceptance for engineering inputs.
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
const imageText = "管理员可以审核维修预约。";
const render = async (): Promise<never> => { throw new Error("unexpected render"); };

function setup(options: { text?: string; attachments?: ModelingAttachment[]; rejectScreening?: boolean; failVision?: boolean; cancelAfterVision?: boolean; reportUsage?: boolean } = {}) {
  const text = options.text ?? "维修预约系统。";
  const record: RunRecord = { snapshot: createEmptySnapshot("attachment-run", text, [], [], { attachments: options.attachments ?? [document, image], submittedRequirementText: text, reasoning: true }), events: [], listeners: new Set(), terminal: false };
  const calls: StreamChatCompletionInput[] = [];
  const providerTransport: LlmTransport = { async *streamChatCompletion(request) {
    calls.push(request);
    if (options.reportUsage) request.onTokenUsage?.({ inputTokens: calls.length * 100, outputTokens: 20, cachedInputTokens: 10, reasoningTokens: null, totalTokens: calls.length * 100 + 20 });
    assert.equal(request.reasoning, true);
    if (request.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === "image_url"))) {
      if (options.failVision) throw new Error("vision provider failed");
      yield imageText;
      if (options.cancelAfterVision) cancelRunRecord(record, record.snapshot.runId);
      return;
    }
    if (String(request.messages[0]?.content).includes("你是软件需求输入检查器")) {
      const units = JSON.parse(String(request.messages.at(-1)?.content)) as { id: string; text: string }[];
      assert.equal((record.snapshot as RunSnapshot).requirementText, text);
      yield JSON.stringify({ units: units.map(unit => ({ id: unit.id, category: options.rejectScreening ? "injection" : /^(?:维修预约系统。|【(?:文本附件|图片转录)：)/u.test(unit.text) ? "context" : "requirement" })) });
      return;
    }
    const facts = options.attachments?.every(item => item.type !== "image") ? [document.text] : [document.text, imageText];
    yield JSON.stringify({  rules: facts.map((text, index) => ({ id: `r${index + 1}`,  type: "functional" as const, text, sourceFragment: text,  })) });
  } };
  const conversation = createContextualLlmTransport(createScheduledLlmTransport({ transport: providerTransport,
    scheduler: createInMemoryLlmScheduler(), context: { runId: "attachment-run", model: settings.model, taskType: "requirements_to_uml" },
  }));
  return { record, calls, run: () => runStagePipeline(record, settings, conversation, render) };
}

test("reads real image bytes, screens named document and image sources, then accepts one coherent baseline", async () => {
  const { record, calls, run } = setup();
  await run();
  const snapshot = record.snapshot as RunSnapshot;
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.submittedRequirementText, "维修预约系统。");
  assert.match(snapshot.requirementText, /文本附件："scope.md"/);
  assert.match(snapshot.requirementText, /图片转录："流程.png"/);
  assert.equal(snapshot.rules.length, 2);
  assert.ok(snapshot.requirementBaseline?.sourceInputFingerprint);
  assert.equal(calls.length, 3);
  const vision = calls[0].messages.at(-1)?.content;
  assert.ok(Array.isArray(vision));
  assert.ok(vision.some(part => part.type === "image_url" && part.image_url.url === `data:image/png;base64,${image.data}`));
  assert.ok(record.events.some(event => event.type === "run_activity" && event.inputImages?.some(item => item.url.includes(image.data))));
  assert.deepEqual(calls[2].messages.map(message => message.role), ["system", "user"]);
});

test("text-only attachment requests work without an input message or vision call", async () => {
  const { record, calls, run } = setup({ text: "", attachments: [document] });
  await run();
  assert.equal(record.snapshot.status, "completed");
  assert.equal(calls.length, 2);
  assert.ok(record.snapshot.requirementText.includes(document.text));
});

test("screening rejection or vision failure preserves the original source and no rules are committed", async () => {
  for (const options of [{ rejectScreening: true }, { failVision: true }]) {
    const { record, run } = setup(options);
    await assert.rejects(run, error => options.rejectScreening ? getRunError(error)?.code === "RUN_REQUIREMENT_INPUT_UNSAFE" : error instanceof Error && error.message === "vision provider failed");
    assert.equal(record.snapshot.requirementText, "维修预约系统。");
    assert.deepEqual(record.snapshot.rules, []);
    assert.deepEqual((record.snapshot as RunSnapshot).attachments, [document, image]);
  }
});

test("retry preserves original attachments and reasoning without duplicating accepted source text", async () => {
  const { record, run } = setup();
  await run();
  record.snapshot.status = "failed";
  const runs = createRunRecordStore();
  createQueuedRunFromSource({ runs, source: record, action: "retry", sourceRunId: "attachment-run", runId: "retry" });
  const snapshot = runs.get("retry")!.snapshot as RunSnapshot;
  assert.equal(snapshot.submittedRequirementText, "维修预约系统。");
  assert.deepEqual(snapshot.attachments, [document, image]);
  assert.equal(snapshot.reasoning, true);
  const replayedSource = await prepareRequirementInput({ record: runs.get("retry")!, snapshot, providerSettings: settings,
    llmTransport: { async *streamChatCompletion() { yield imageText; } },
  });
  assert.equal(replayedSource, record.snapshot.requirementText);
});

test("the accepted source budget includes escaped file names, source titles and every separator", async () => {
  const first = { ...document, name: 'scope "quoted"\n.md', text: "" };
  const second = { ...document, id: "second", name: "补充.md", text: "补充需求。" };
  const original = "业务需求。";
  const firstPrefix = `\n\n【文本附件：${JSON.stringify(first.name)}】\n`;
  const secondPrefix = `\n\n【文本附件：${JSON.stringify(second.name)}】\n`;
  first.text = "x".repeat(60000 - original.length - firstPrefix.length - secondPrefix.length - second.text.length);
  const { record } = setup({ text: original, attachments: [first, second] });
  const snapshot = record.snapshot as RunSnapshot;
  const prepared = await prepareRequirementInput({ record, snapshot, providerSettings: settings,
    llmTransport: { async *streamChatCompletion() { throw new Error("unexpected model call"); } },
  });
  assert.equal(prepared.length, 60000);
  assert.equal(prepared, original + firstPrefix + first.text + secondPrefix + second.text);
  assert.equal(snapshot.requirementText, original);
});

test("source titles pushing raw attachments past the canonical limit fail before calls or partial acceptance", async () => {
  const original = "业务需求。";
  const attachment = { ...document, text: "x".repeat(60000 - original.length) };
  const { record, calls, run } = setup({ text: original, attachments: [attachment] });
  const previousBaseline = record.snapshot.requirementBaseline;
  await assert.rejects(run, /来源标题.*60,000/);
  assert.equal(calls.length, 0);
  assert.equal(record.snapshot.requirementText, original);
  assert.deepEqual(record.snapshot.rules, []);
  assert.equal(record.snapshot.requirementBaseline, previousBaseline);
});

test("image transcription reserves later document sources and fails atomically when canonical text overflows", async () => {
  const imagePrefix = `\n\n【图片转录：${JSON.stringify(image.name)}】\n`;
  const documentPrefix = `\n\n【文本附件：${JSON.stringify(document.name)}】\n`;
  const original = "x".repeat(60000 - imagePrefix.length - documentPrefix.length - document.text.length - 5);
  const { record, calls, run } = setup({ text: original, attachments: [image, document] });
  const previousBaseline = record.snapshot.requirementBaseline;
  await assert.rejects(run, /来源标题.*60,000/);
  assert.equal(calls.length, 1);
  assert.equal(record.snapshot.requirementText, original);
  assert.deepEqual(record.snapshot.rules, []);
  assert.equal(record.snapshot.requirementBaseline, previousBaseline);
});

test("blank transcription chunks consume the canonical source budget too", async () => {
  const prefix = `【图片转录：${JSON.stringify(image.name)}】\n`;
  const { record } = setup({ text: "", attachments: [image] });
  await assert.rejects(() => prepareRequirementInput({ record, snapshot: record.snapshot as RunSnapshot, providerSettings: settings,
    llmTransport: { async *streamChatCompletion() { yield " ".repeat(60001 - prefix.length); } },
  }), /来源标题.*60,000/);
  assert.equal(record.snapshot.requirementText, "");
  assert.deepEqual(record.snapshot.rules, []);
});

test("a cancellation as the vision call finishes prevents the following screening call and source acceptance", async () => {
  const { record, calls, run } = setup({ attachments: [image], cancelAfterVision: true });
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

test("the complete engineering pipeline captures vision, screening and extraction usage from scheduled responses", async () => {
  const { record, run } = setup({ reportUsage: true });
  const snapshot = record.snapshot as RunSnapshot;
  snapshot.tokenUsage = emptyRequirementTokenUsage(settings.model, { context: 1000000, output: 8192, source: "modelpedia", matchedId: settings.model, updatedAt: null });
  await run();
  assert.equal(snapshot.status, "completed");
  // Backend acceptance adds no extra provider request after the extraction response.
  assert.equal(snapshot.tokenUsage.contextTokens, 320);
  assert.equal(snapshot.tokenUsage.contextBudget, 1000000);
  assert.ok(snapshot.tokenUsage.lastCall);
  assert.deepEqual(snapshot.tokenUsage.cumulative, { total: 660, calls: 3, unreportedCalls: 0 });
});

test("duplicate attachment identifiers cannot share vision transcription history between sources", async () => {
  const attachments = [image, { ...image, name: "另一个流程.png" }];
  const { record } = setup({ text: "", attachments });
  let calls = 0;
  const conversation = createContextualLlmTransport({ async *streamChatCompletion(request) {
    calls++;
    assert.deepEqual(request.messages.map(message => message.role), ["system", "user"]);
    yield calls === 1 ? "用户可以预约。" : "管理员可以审核。";
  } });
  const source = await prepareRequirementInput({ record, snapshot: record.snapshot as RunSnapshot, providerSettings: settings, llmTransport: conversation });
  assert.equal(calls, 2);
  assert.equal(source, '【图片转录："流程.png"】\n用户可以预约。\n\n【图片转录："另一个流程.png"】\n管理员可以审核。');
});
