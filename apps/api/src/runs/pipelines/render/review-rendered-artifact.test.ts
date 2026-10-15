// Verifies visual review decisions, image input, and advisory review without source mutation.
import assert from "node:assert/strict";
import test from "node:test";
import { getStageModelSchemas, validateModelInput, type ModelingStage, type DiagramModelSpec, type ProviderSettings } from "@uml-platform/contracts";
import type { LlmTransport } from "../../../llm.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";
import { reviewRenderedArtifact } from "./review-rendered-artifact.js";
import { DiagramReviewRenderError } from "./review-rendered-artifact.js";
import { deriveTableModel, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../../packages/contracts/src/testing/model-fixtures.js";
import { generateDesignPlantUmlArtifacts } from "../../../plantuml.js";
import { RunCancelledError } from "../../records/run-cancellation.js";
import { createCallActivity } from "../shared/call-activity.js";

function repairTransport(candidate?: DesignDiagramModelSpec): LlmTransport {
  return { async *streamChatCompletion(input) {
    const prompt = input.messages.at(-1)?.content;
    input.onReasoningChunk?.("核对本模型的已确认约束"); input.onReasoningSummary?.("已完成依据核实");
    yield typeof prompt === "string" && prompt.includes('只返回 {"model"') ? JSON.stringify({ model: candidate }) : '{"passed":true,"issues":[],"findings":[]}';
  } };
}

const settings: ProviderSettings = { apiBaseUrl: "https://example.test", apiKey: "test", model: "vision-test" };
const model: DiagramModelSpec = { diagramKind: "usecase", title: "用例", summary: "用例", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] };
const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Unit cases supply explicit mapping evidence; real renderer capability is checked by the SVG matrix suite.
const renderClient: RenderClient = async (artifact) => {
  const aliases = new Map(artifact.renderMapping?.elements.map((element) => [element.elementId, element.alias]));
  const nodes = artifact.renderMapping?.elements.map((element) => `<g id="elem_${element.alias}"><text>${escapeXml(element.label ?? "")}</text></g>`).join("") ?? "";
  const links = artifact.renderMapping?.relationships.filter((edge) => edge.statement && !edge.statement.trimStart().startsWith("'")).map((edge) => `<g class="link" data-entity-1="${aliases.get(edge.sourceId)}" data-entity-2="${aliases.get(edge.targetId)}"><text>${escapeXml(edge.label ?? "")}</text></g>`).join("") ?? "";
  return { svg: `<svg>${nodes || '<g id="elem_empty"/>'}${links}</svg>`, renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } };
};
const pngRenderClient = async () => ({ png: Buffer.from("png"), renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: 1, durationMs: 1 } });

function record(): RunRecord {
  return { snapshot: createEmptySnapshot("visual-test", "需求", ["usecase"]), events: [], listeners: new Set(), terminal: false };
}

test("only passed identical checks are reused within a run; changed input or another run is checked again", async () => {
  let calls = 0;
  const run = record();
  const llmTransport: LlmTransport = { async *streamChatCompletion() { calls++; yield '{"passed":true,"issues":[],"findings":[]}'; } };
  const input = { record: run, providerSettings: settings, model, basis: { stage: "requirements" as const }, mutable: true, renderClient, pngRenderClient, llmTransport };
  await reviewRenderedArtifact(input); assert.equal(calls, 2);
  await reviewRenderedArtifact(input); assert.equal(calls, 2);
  await reviewRenderedArtifact({ ...input, model: { ...model, summary: "不同输入" } }); assert.equal(calls, 4);
  await reviewRenderedArtifact({ ...input, record: record() }); assert.equal(calls, 6);
});

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`production review dispatches ${stage}/${kind} to its structural and image instructions`, async () => {
    const candidate = modelFixture(stage, kind);
    const prompts: Array<{ image: boolean; text: string }> = [];
    const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model: candidate, basis: { stage }, mutable: true, renderClient, pngRenderClient,
      llmTransport: { async *streamChatCompletion(input) {
        const content = input.messages.at(-1)!.content;
        prompts.push({ image: Array.isArray(content), text: typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("\n") });
        yield '{"passed":true,"issues":[],"findings":[]}';
      } },
    });
    assert.equal(checked.review.status, "passed");
    assert.ok(prompts.some((item) => !item.image && item.text.startsWith(`核对 ${stage}.${kind} 的结构与业务内容。`)));
    assert.ok(prompts.some((item) => item.image && item.text.startsWith(`核对 ${stage}.${kind} 的图片与模型。`)));
  });
}

test("missing declared actor links are repaired by rules and published with reconciled trace and latest image", async () => {
  const candidate = modelFixture("requirements", "usecase"); if (candidate.diagramKind !== "usecase") throw new Error("fixture");
  candidate.useCases[0].primaryActorId = "actor"; candidate.relationships = [];
  let reconciliationCount = 0;
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model: candidate, basis: { stage: "requirements" }, mutable: true, renderClient, pngRenderClient,
    reconcileTraceability: (corrected) => { reconciliationCount++; assert.deepEqual(validateModelInput(corrected, "requirements"), []); return [{ corrected: true }]; },
    llmTransport: { async *streamChatCompletion(input) {
      assert.doesNotMatch(JSON.stringify(input.messages), /只返回 \{\\?"model/);
      yield '{"passed":true,"issues":[],"findings":[]}';
    } },
  });
  assert.equal(reconciliationCount, 1); assert.equal(checked.review.repairAttempts, 1); assert.equal(checked.review.repairHistory?.[0].method, "hard_rule");
  assert.ok(checked.rendered.artifact.renderMapping?.relationships.some((edge) => edge.type === "association"));
  assert.deepEqual(checked.traceability, [{ corrected: true }]); assert.deepEqual(candidate.relationships, []);
});

test("generation repairs exhaust the same two-round budget in requirements, design and feasibility", async () => {
  for (const [stage, kind, generationStage] of [["requirements", "usecase", "generate_models"], ["design", "table", "generate_design_models"], ["feasibility", "context", "generate_context"]] as const) {
    const run = record(), candidate = modelFixture(stage, kind);
    if (candidate.diagramKind === "usecase") { candidate.useCases[0].primaryActorId = "actor"; candidate.relationships = []; }
    if (candidate.diagramKind === "context") candidate.relationships[0].targetId = "unknown";
    for (let round = 1; round <= 2; round++) {
      const activity = createCallActivity({ record: run, stage: generationStage, subtaskId: kind, operation: "model_repair", round });
      activity.onStart(); activity.onComplete();
    }
    await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(), renderClient, pngRenderClient,
      model: candidate, basis: { stage }, mutable: true }), (error) => {
      assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 2); assert.equal(error.review.status, "failed"); return true;
    });
    assert.equal(run.events.filter((event) => event.type === "run_activity" && event.phase === "started" && event.operation === "model_repair").length, 2);
  }
});

test("business content questions remain visible and never launch a model repair", async () => {
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model, basis: { stage: "requirements" }, mutable: true, renderClient, pngRenderClient,
    llmTransport: { async *streamChatCompletion() { yield JSON.stringify({ passed: false, issues: [], findings: [{ id: "role", modelId: "usecase", layer: "model", code: "actor-choice", category: "business_content", observation: "传感器是否为合适参与者需要业务核实", evidence: [], verification: "unverified", repairable: false }] }); } },
  });
  assert.equal(checked.review.status, "pending_review"); assert.equal(checked.review.structureStatus, "passed"); assert.equal(checked.review.repairAttempts, 0);
  assert.ok(checked.review.findings?.every((item) => item.category === "business_content"));
});

test("diagram-specific LLM repairs can correct multiplicity notation, component direction and activation order without changing content", async () => {
  const classModel = modelFixture("design", "class"); if (classModel.diagramKind !== "class") throw new Error("fixture");
  classModel.relationships[0].targetMultiplicity = "0...*";
  const classCandidate = structuredClone(classModel); classCandidate.relationships[0].targetMultiplicity = "0..*";
  const component = modelFixture("design", "component"); if (component.diagramKind !== "component") throw new Error("fixture");
  const componentCandidate = structuredClone(component);
  component.relationships[0].sourceId = "i"; component.relationships[0].targetId = "c";
  const sequence = modelFixture("design", "sequence"); if (sequence.diagramKind !== "sequence") throw new Error("fixture");
  sequence.messages.push({ ...sequence.messages[0], id: "m2", name: "第二次调用" });
  sequence.activations = [{ id: "activation", participantId: "b", startMessageId: "m2", endMessageId: "m" }];
  const sequenceCandidate = structuredClone(sequence); sequenceCandidate.activations![0].startMessageId = "m"; sequenceCandidate.activations![0].endMessageId = "m2";
  for (const [before, candidate] of [[classModel, classCandidate], [component, componentCandidate], [sequence, sequenceCandidate]]) {
    const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model: before, basis: { stage: "design" }, mutable: true, renderClient, pngRenderClient, llmTransport: repairTransport(candidate) });
    assert.equal(checked.review.status, "passed"); assert.equal(checked.review.repairAttempts, 1); assert.equal(checked.review.repairHistory?.[0].method, "llm");
    assert.deepEqual(validateModelInput(checked.model, "design"), []); assert.equal(checked.model.title, before.title);
  }
});

async function rendered(input: RunRecord) {
  const unused: LlmTransport = { async *streamChatCompletion() { throw new Error("unexpected repair"); } };
  const value = await renderArtifactWithRepair(input, settings, unused, renderClient, model, { diagramKind: "usecase", source: "@startuml\n@enduml" });
  assert.equal(value.status, "success");
  if (value.status !== "success") throw new Error("render failed");
  return value;
}

test("passes latest PNG with model and source to the selected chat model", async () => {
  const run = record();
  let sawImage = false;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    const content = input.messages.at(-1)?.content;
    sawImage = Array.isArray(content) && content.some((part) => part.type === "image_url" && part.image_url.url.startsWith("data:image/png;base64,"));
    input.onReasoningChunk?.("核对环境图节点与连线。");
    yield '{"passed":true,"issues":[]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "passed");
  assert.equal(sawImage, true);
  assert.equal(run.events.some((event) => event.type === "stage_progress" && event.stage === "verify_diagram_visual" && event.subtaskStatus === "completed"), true);
  const activity = run.events.filter((event) => event.type === "run_activity");
  assert.equal(activity[0].inputImages?.[0].url, "data:image/png;base64,cG5n");
  assert.equal(activity.find((event) => event.phase === "reasoning")?.text, "核对环境图节点与连线。");
  assert.equal(activity.find((event) => event.phase === "output")?.text, '{"passed":true,"issues":[]}');
  assert.equal(new Set(activity.map((event) => event.callId)).size, 1);
});

test("unverified image differences remain incomplete without rebuilding or failing the valid model", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield calls === 1 ? '{"passed":false,"issues":["连线缺失"]}' : calls === 2 ? '{"source":"@startuml\\nA --> B\\n@enduml"}' : '{"passed":true,"issues":[]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run), mutable: true });
  assert.equal(result.review.status, "not_completed");
  assert.equal(calls, 1);
  assert.equal(result.review.repairAttempts, 0);
  assert.equal(result.review.findings?.[0].category, "check_execution");
  assert.equal(result.review.findings?.[0].verification, "inconclusive");
  assert.doesNotMatch(result.rendered.artifact.source, /A --> B/);
  assert.deepEqual(model.relationships, []);
});

test("skips image review when the provider rejects image input", async () => {
  const run = record();
  const transport: LlmTransport = { async *streamChatCompletion() { throw new Error("image input not supported"); } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "skipped");
  assert.equal(result.review.attempts, 1);
});

test("accepted repair is validated, rendered, rechecked and returned for downstream generation", async () => {
  const run = record(); const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  const accepted = deriveTableModel(table); let latestSource = "";
  const checked = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(accepted), renderClient: async (artifact) => { latestSource = artifact.source; return renderClient(artifact); }, pngRenderClient: async (artifact) => { assert.equal(artifact.source, latestSource); return pngRenderClient(); }, model: table, basis: { stage: "design" }, mutable: true });
  assert.deepEqual(checked.model, JSON.parse(JSON.stringify(accepted)));
  assert.deepEqual(table.relationships, []);
  assert.equal(checked.review.repairAttempts, 1); assert.equal(checked.review.structureAttempts, 2); assert.equal(checked.review.attempts, 1);
  assert.equal(checked.review.status, "passed"); assert.equal(checked.review.repairHistory?.[0]?.status, "accepted");
  assert.ok(checked.rendered.artifact.source.includes("FK"));
  const calls = run.events.filter((event) => event.type === "run_activity" && event.phase === "started");
  assert.deepEqual(calls.map((event) => event.operation), ["structure_check", "model_repair", "structure_check", "visual_check"]);
  assert.equal(new Set(calls.map((event) => event.callId)).size, 4);
  assert.ok(calls.every((event) => event.modelId === "table"));
  assert.ok(calls.at(-1)?.inputImages?.length);
});

test("out-of-scope and no-op candidates never overwrite a valid tuple; failed attempt counts", async () => {
  const valid = modelFixture("design", "class"); if (valid.diagramKind !== "class") throw new Error("fixture");
  const invalid = structuredClone(valid); invalid.relationships[0].sourceId = "missing";
  for (const candidate of [invalid, { ...valid, title: "未经授权的改写" }]) {
    const run = record(); const artifact = generateDesignPlantUmlArtifacts([valid])[0]!;
    const old = await renderClient(artifact);
    await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(candidate), renderClient, pngRenderClient, model: invalid, rendered: { status: "success", artifact, svgArtifact: { ...old, diagramKind: "class", modelId: "class" } }, basis: { stage: "design" }, mutable: true }), (error) => {
      assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.status, "failed");
      assert.equal(error.review.repairAttempts, 2); assert.ok(error.review.repairHistory?.every((item) => item.status === "rejected"));
      assert.match(error.review.stopReason!, /结构规则|越过结构修复范围|没有唯一结构依据/); return true;
    });
    assert.equal(valid.relationships[0].sourceId, "order"); assert.equal(old.svg, (await renderClient(artifact)).svg);
  }
});

test("manual structural defects fail without changing the model or launching a repair", async () => {
  const table = modelFixture("design", "table");
  await assert.rejects(reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: repairTransport(), renderClient, pngRenderClient, model: table as DesignDiagramModelSpec, basis: { stage: "design" } }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 0); assert.equal(error.review.status, "failed"); return true;
  });
  assert.deepEqual(table.relationships, []);
});

test("the same model cannot reset its shared repair budget when the run is replayed", async () => {
  const run = record(); const table = modelFixture("design", "table");
  const common = { providerSettings: settings, llmTransport: repairTransport(table), renderClient, pngRenderClient, model: table, basis: { stage: "design" as const }, mutable: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    const checked = await reviewRenderedArtifact({ ...common, record: run });
    assert.equal(checked.review.repairAttempts, attempt + 1);
    if ("visualReviews" in run.snapshot) run.snapshot.visualReviews[table.modelId!] = checked.review;
  }
  const restored = { ...run, snapshot: JSON.parse(JSON.stringify(run.snapshot)), events: JSON.parse(JSON.stringify(run.events)), listeners: new Set<RunRecord["listeners"] extends Set<infer T> ? T : never>() };
  await assert.rejects(reviewRenderedArtifact({ ...common, record: restored }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 2);
    assert.equal(error.review.repairHistory?.length, 2); assert.match(error.review.stopReason!, /两轮修复上限/); return true;
  });
});

test("missing PNG capability skips and failed checks retry once without a repair", async () => {
  const common = { providerSettings: settings, llmTransport: repairTransport(), renderClient, model };
  const skipped = await reviewRenderedArtifact({ ...common, record: record() });
  assert.equal(skipped.review.checkOutcome, "skipped"); assert.equal(skipped.review.attempts, 0);
  const noPng = await reviewRenderedArtifact({ ...common, record: record(), pngRenderClient: async () => { throw new Error("PNG unavailable"); } });
  assert.equal(noPng.review.checkOutcome, "not_completed"); assert.equal(noPng.review.attempts, 0);
  const bad = await reviewRenderedArtifact({ ...common, record: record(), pngRenderClient, llmTransport: { async *streamChatCompletion() { yield "invalid-json"; } } });
  assert.equal(bad.review.checkOutcome, "not_completed"); assert.equal(bad.review.attempts, 2); assert.equal(bad.review.repairAttempts, 0);
});

test("new structure check failure preserves its reason when image verification succeeds", async () => {
  let calls = 0;
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: { async *streamChatCompletion() { yield ++calls <= 2 ? "invalid-json" : '{"passed":true,"issues":[]}'; } }, renderClient, pngRenderClient, model, basis: { stage: "requirements" }, mutable: true });
  assert.equal(checked.review.checkOutcome, "not_completed"); assert.match(checked.review.issues.join(), /结构核对未完成/);
});

test("structure failure stays incomplete when the image provider is unsupported", async () => {
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: { async *streamChatCompletion(input) {
    if (Array.isArray(input.messages.at(-1)?.content)) throw new Error("image input not supported");
    yield "invalid-json";
  } }, renderClient, pngRenderClient, model, basis: { stage: "requirements" }, mutable: true });
  assert.equal(checked.review.checkOutcome, "not_completed");
  assert.equal(checked.review.attempts, 1);
  assert.match(checked.review.stopReason!, /拒绝图片/);
});

test("initial render failure records an incomplete review with zero image calls", async () => {
  await assert.rejects(reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: repairTransport(), renderClient: async () => { throw new Error("renderer offline"); }, pngRenderClient, model }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError);
    assert.equal(error.review.status, "failed"); assert.equal(error.review.renderStatus, "failed");
    assert.equal(error.review.attempts, 0); assert.match(error.review.issues.join(), /renderer offline/);
    return true;
  });
});

test("model and render fixes share two attempts and repeated proven rendering defects fail", async () => {
  const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  let renders = 0; const run = record();
  await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(deriveTableModel(table)), renderClient: async (artifact) => { renders += 1; return { ...await renderClient(artifact), svg: '<svg><g id="elem_unrelated"/></svg>' }; }, pngRenderClient, model: table, basis: { stage: "design" }, mutable: true }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 2); assert.match(error.message, /绘图器故障/); assert.equal(error.review.attempts, 0);
    assert.equal(error.review.repairHistory?.[1]?.status, "failed"); return true;
  });
  assert.equal(renders, 2);
});

test("timeout and cancellation propagate abort and never become a completed image verdict", async () => {
  const run = record(); let aborted = false;
  const waiting: LlmTransport = { async *streamChatCompletion(input) { await new Promise<void>((_resolve, reject) => input.abortSignal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true })); yield ""; } };
  const timedOut = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: waiting, renderClient, pngRenderClient, model, timeoutMs: 20 });
  assert.equal(aborted, true); assert.equal(timedOut.review.checkOutcome, "not_completed"); assert.equal(timedOut.review.attempts, 2);
  const cancelled = record();
  await assert.rejects(reviewRenderedArtifact({ record: cancelled, providerSettings: settings, llmTransport: waiting, renderClient, pngRenderClient: async () => { cancelled.snapshot.status = "cancelled"; return pngRenderClient(); }, model }), RunCancelledError);
});

test("parallel models retain independent input images, reasoning, operation and round on replay", async () => {
  const run = record(); const models = ["one", "two"].map((id) => ({ ...model, modelId: id }));
  await Promise.all(models.map((candidate) => reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(), renderClient, pngRenderClient: async () => ({ ...await pngRenderClient(), png: Buffer.from(candidate.modelId) }), model: candidate, basis: { stage: "requirements" }, mutable: true })));
  const replay = JSON.parse(JSON.stringify(run.events)) as typeof run.events;
  for (const id of ["one", "two"]) {
    const starts = replay.filter((event) => event.type === "run_activity" && event.modelId === id && event.phase === "started");
    assert.equal(starts.length, 2); assert.equal(starts[1]!.inputImages?.[0]?.url, `data:image/png;base64,${Buffer.from(id).toString("base64")}`);
    assert.ok(replay.filter((event) => event.type === "run_activity" && event.callId === starts[1]!.callId).every((event) => event.type !== "run_activity" || event.modelId === id));
  }
});

test("checks an image even when catalog capability is text chat", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() { calls += 1; yield '{"passed":true,"issues":[]}'; } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: { ...settings, modelCapability: { category: "text_chat" } as ProviderSettings["modelCapability"] }, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "passed");
  assert.equal(calls, 1);
});

test("keeps deterministic source and full issues after one advisory review", async () => {
  const run = record();
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls += 1;
    yield calls % 2 === 0
      ? `{"source":"@startuml\\nA --> B : ${calls}\\n@enduml"}`
      : '{"passed":false,"issues":["标签不可读"]}';
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, rendered: await rendered(run) });
  assert.equal(result.review.status, "not_completed");
  assert.equal(result.review.attempts, 1);
  assert.equal(result.review.repairAttempts, 0);
  assert.deepEqual(result.review.issues, ["标签不可读"]);
  assert.doesNotMatch(result.rendered.artifact.source, /A --> B/);
});

test("layout-only negative verdicts do not create pending problems or repair attempts", async () => {
  const run = record(); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion(input) {
    calls++;
    assert.match(JSON.stringify(input.messages), /不检查或报告位置、间距、交叉/);
    yield JSON.stringify({ passed: false, issues: ["连线交叉；字号太小", "节点位置需要调整"], findings: [{ id: "spacing", layer: "image", code: "layout", category: "other", modelId: "usecase", observation: "节点间距太大", evidence: [], verification: "verified", repairable: true }] });
  } };
  const checked = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport, renderClient, pngRenderClient, model, basis: { stage: "requirements" }, mutable: true });
  assert.equal(calls, 2); assert.equal(checked.review.status, "passed"); assert.equal(checked.review.repairAttempts, 0);
  assert.deepEqual(checked.review.issues, []); assert.deepEqual(checked.review.findings, []);
});

test("uncertain image evidence is categorized and cannot authorize removal", async () => {
  const run = record();
  const checked = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: { async *streamChatCompletion() {
    yield JSON.stringify({ passed: false, issues: ["图中关系端点无法核实"], findings: [{ id: "missing", layer: "image", code: "missing-node", category: "model_structure", modelId: "usecase", observation: "标签无法辨认，节点是否缺失无法核实", evidence: [], verification: "verified", repairable: true }] });
  } }, renderClient, pngRenderClient, model, mutable: true });
  assert.equal(checked.review.checkOutcome, "inconclusive"); assert.equal(checked.review.repairAttempts, 0);
  assert.equal(checked.review.findings?.[0].category, "check_execution");
  assert.equal(checked.review.findings?.[0].verification, "inconclusive"); assert.equal(checked.review.findings?.[0].repairable, false);
  assert.deepEqual(checked.model, model);
});

test("successful image review cannot promote absent SVG identity evidence to a passed mapping check", async () => {
  const candidate = modelFixture("requirements", "usecase");
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: repairTransport(), model: candidate, basis: { stage: "requirements" }, mutable: true,
    renderClient: async (artifact) => ({ ...await renderClient(artifact), svg: '<svg><g class="entity" id="ent0001"><ellipse cx="0" cy="0" rx="1" ry="1"/></g></svg>' }), pngRenderClient });
  assert.equal(checked.review.structureStatus, "passed"); assert.equal(checked.review.imageStatus, "passed");
  assert.equal(checked.review.renderStatus, "not_completed"); assert.equal(checked.review.status, "not_completed");
  assert.equal(checked.review.repairAttempts, 0); assert.ok(checked.review.findings?.some((item) => item.code === "svg-mapping-unverifiable" && item.verification === "inconclusive"));
});
