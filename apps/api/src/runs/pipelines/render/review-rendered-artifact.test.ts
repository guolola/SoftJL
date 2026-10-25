// Verifies pre-render structure repairs and rendering without SVG mapping or PNG image review.
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import assert from "node:assert/strict";
import test from "node:test";
import { branchedRetryActivity, parallelRetryActivity } from "../../../../tests/fixtures/complex-activity.js";
import { getStageModelSchemas, validateModelInput, type ModelingStage, type DiagramModelSpec, type ProviderSettings } from "@uml-platform/contracts";
import type { LlmTransport } from "../../../adapters/llm/llm-transport.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";
import { reviewRenderedArtifact } from "./review-rendered-artifact.js";
import { DiagramReviewRenderError } from "./review-rendered-artifact.js";
import { deriveTableModel, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { generateDesignPlantUmlArtifacts } from "../../../adapters/plantuml/model-renderer.js";
import { RunCancelledError } from "../../records/run-cancellation.js";
import { createCallActivity } from "../shared/call-activity.js";

function repairTransport(candidate?: DesignDiagramModelSpec): LlmTransport {
  return { async *streamChatCompletion(input) {
    const prompt = input.messages.at(-1)?.content;
    input.onReasoningChunk?.("核对本模型的已确认约束"); input.onReasoningSummary?.("已完成依据核实");
    yield typeof prompt === "string" && prompt.includes('请基于本对话中上一版完整模型') ? JSON.stringify(candidate) : '{"passed":true,"issues":[],"findings":[]}';
  } };
}

const settings: ProviderSettings = { modelCapability: strictTestModelCapability("vision-test"), apiBaseUrl: "https://example.test", apiKey: "test", model: "vision-test" };
const model: DiagramModelSpec = { diagramKind: "usecase", title: "用例", summary: "用例", notes: [], actors: [], useCases: [], systemBoundaries: [], relationships: [] };
const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Render fixtures remain recognizable, while review completion no longer depends on SVG mapping evidence.
const renderClient: RenderClient = async (artifact) => {
  const aliases = new Map(artifact.renderMapping?.elements.map((element) => [element.elementId, element.alias]));
  const nodes = artifact.renderMapping?.elements.map((element) => `<g id="elem_${element.alias}"><text>${escapeXml(element.label ?? "")}</text></g>`).join("") ?? "";
  const links = artifact.renderMapping?.relationships.filter((edge) => edge.statement && !edge.statement.trimStart().startsWith("'")).map((edge) => `<g class="link" data-entity-1="${aliases.get(edge.sourceId)}" data-entity-2="${aliases.get(edge.targetId)}"><text>${escapeXml(edge.label ?? "")}</text></g>`).join("") ?? "";
  return { svg: `<svg>${nodes || '<g id="elem_empty"/>'}${links}</svg>`, renderMeta: { engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } };
};

function record(): RunRecord {
  return { snapshot: createEmptySnapshot("visual-test", "需求", ["usecase"]), events: [], listeners: new Set(), terminal: false };
}

for (const stage of ["feasibility", "requirements"] as const) test(`${stage}: complex business flows finish rendering without model repair or repeated rebuilds`, async () => {
  for (const fixture of [branchedRetryActivity, parallelRetryActivity]) {
    const candidate = fixture(), before = structuredClone(candidate), run = record();
    let renders = 0;
    const checked = await reviewRenderedArtifact({
      record: run, providerSettings: settings, model: candidate, basis: { stage }, mutable: false,
      llmTransport: { async *streamChatCompletion() { throw new Error("Drawing must never rewrite business semantics"); } },
      renderClient: async (artifact, signal) => { renders++; return renderClient(artifact, signal); },
    });
    assert.equal(renders, 1);
    assert.equal(checked.review.renderStatus, "passed");
    assert.equal(checked.review.repairAttempts, 0);
    assert.deepEqual(checked.model, before);
    assert.deepEqual(candidate, before);
    assert.ok(checked.rendered.artifact.renderMapping?.auxiliary?.some(item => item.kind === "flow-connector"));
    assert.ok(!run.events.some(event => event.type === "run_activity" && event.operation === "render_repair"));
  }
});

test("valid models never spend an LLM call on repeated validation or another run", async () => {
  let calls = 0;
  const run = record();
  const llmTransport: LlmTransport = { async *streamChatCompletion() { calls++; yield '{"passed":true,"issues":[],"findings":[]}'; } };
  const input = { record: run, providerSettings: settings, model, basis: { stage: "requirements" as const }, mutable: true, renderClient, llmTransport };
  await reviewRenderedArtifact(input);
  await reviewRenderedArtifact(input);
  await reviewRenderedArtifact({ ...input, model: { ...model, summary: "不同输入" } });
  await reviewRenderedArtifact({ ...input, record: record() }); assert.equal(calls, 0);
});

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`program validation renders ${stage}/${kind} without semantic or image requests`, async () => {
    const candidate = modelFixture(stage, kind);
    const prompts: Array<{ image: boolean; text: string }> = [];
    const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model: candidate, basis: { stage }, mutable: true, renderClient,
      llmTransport: { async *streamChatCompletion(input) {
        const content = input.messages.at(-1)!.content;
        prompts.push({ image: Array.isArray(content), text: typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("\n") });
        yield '{"passed":true,"issues":[],"findings":[]}';
      } },
    });
    assert.equal(checked.review.status, "passed");
    assert.deepEqual(prompts, []);
    assert.equal(checked.review.structureAttempts, 0);
    assert.match(checked.review.reason, /程序结构校验与绘制通过/);
    assert.equal(checked.review.attempts, 0); assert.equal(checked.review.imageStatus, "skipped");
    assert.equal(checked.review.renderStatus, "passed");
  });
}

test("missing declared actor links are repaired by rules and published with reconciled trace and rendered output", async () => {
  const candidate = modelFixture("requirements", "usecase"); if (candidate.diagramKind !== "usecase") throw new Error("fixture");
  candidate.useCases[0].primaryActorId = "actor"; candidate.relationships = [];
  let reconciliationCount = 0;
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model: candidate, basis: { stage: "requirements" }, mutable: true, renderClient,
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

test("generation repairs exhaust the same five-round budget in requirements, design and feasibility", async () => {
  for (const [stage, kind, generationStage] of [["requirements", "usecase", "generate_models"], ["design", "table", "generate_design_models"], ["feasibility", "context", "generate_context"]] as const) {
    const run = record(), candidate = modelFixture(stage, kind);
    if (candidate.diagramKind === "usecase") { candidate.useCases[0].primaryActorId = "actor"; candidate.relationships = []; }
    if (candidate.diagramKind === "context") candidate.relationships[0].targetId = "unknown";
    for (let round = 1; round <= 5; round++) {
      const activity = createCallActivity({ record: run, stage: generationStage, subtaskId: kind, operation: "model_repair", round });
      activity.onStart(); activity.onComplete();
    }
    await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(), renderClient,
      model: candidate, basis: { stage }, mutable: true }), (error) => {
      assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 5); assert.equal(error.review.status, "failed"); return true;
    });
    assert.equal(run.events.filter((event) => event.type === "run_activity" && event.phase === "started" && event.operation === "model_repair").length, 5);
  }
});

test("a valid generated model does not request a separate business verdict", async () => {
  let calls = 0;
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model, basis: { stage: "requirements" }, mutable: true, renderClient,
    llmTransport: { async *streamChatCompletion() { calls++; throw new Error("unexpected business reviewer"); } },
  });
  assert.equal(checked.review.status, "passed"); assert.equal(checked.review.structureStatus, "passed"); assert.equal(checked.review.repairAttempts, 0);
  assert.deepEqual(checked.review.findings, []); assert.equal(calls, 0);
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
    const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model: before, basis: { stage: "design" }, mutable: true, renderClient, llmTransport: repairTransport(candidate) });
    assert.equal(checked.review.status, "passed"); assert.equal(checked.review.repairAttempts, 1); assert.equal(checked.review.repairHistory?.[0].method, "llm");
    assert.deepEqual(validateModelInput(checked.model, "design"), []); assert.equal(checked.model.title, before.title);
  }
});

test("two correction rounds keep one artifact scope and never trigger an independent review", async () => {
  const before = modelFixture("design", "class"); if (before.diagramKind !== "class") throw new Error("fixture");
  before.relationships[0].targetMultiplicity = "0...*";
  before.notes = ["UNCHANGED_GENERATED_CONTENT"];
  const corrected = structuredClone(before); corrected.relationships[0].targetMultiplicity = "0..*";
  const run = record(); const prompts: string[] = [];
  const baseline = createEmptySnapshot("backend-only", "BACKEND_ONLY_BASELINE", [], [{ id: "r0", type: "functional", text: "BACKEND_ONLY_BASELINE" }]).requirementBaseline!;
  const savedBaseline = structuredClone(baseline);
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, model: before, mutable: true,
    basis: { stage: "design", baseline, upstreamModels: [{ ...before, title: "UNRELATED_UPSTREAM_CONTENT" }] }, renderClient,
    llmTransport: { async *streamChatCompletion(input) {
      assert.doesNotMatch(JSON.stringify(input.messages), /BACKEND_ONLY_BASELINE|"baseline"/);
      prompts.push(String(input.messages.at(-1)?.content));
      assert.deepEqual(input.messages.map(message => message.role), prompts.length === 1
        ? ["system", "user", "assistant", "user"]
        : ["system", "user", "assistant", "user", "assistant", "user"]);
      yield JSON.stringify(prompts.length === 1 ? before : corrected);
    } },
  });
  assert.equal(prompts.length, 2);
  assert.ok(prompts.every(prompt => !/UNRELATED_UPSTREAM_CONTENT|UNCHANGED_GENERATED_CONTENT/.test(prompt)));
  assert.equal(result.review.structureAttempts, 0); assert.equal(result.review.status, "passed");
  assert.deepEqual(result.review.repairHistory?.map(item => item.status), ["rejected", "accepted"]);
  assert.deepEqual(result.model, corrected);
  assert.deepEqual(baseline, savedBaseline);
  assert.deepEqual(run.events.filter(event => event.type === "run_activity" && event.phase === "started").map(event => event.type === "run_activity" && [event.operation, event.round]), [["model_repair", 1], ["model_repair", 2]]);
});

test("validated models never acquire associations or late LLM repairs during rendering", async () => {
  const before = modelFixture("requirements", "usecase");
  if (before.diagramKind !== "usecase") throw new Error("fixture");
  before.useCases[0]!.primaryActorId = before.actors[0]!.id;
  before.relationships = [];
  let calls = 0, renders = 0;
  const checked = await reviewRenderedArtifact({
    record: record(), providerSettings: settings, model: before, mutable: false,
    basis: { stage: "requirements", traceability: [] },
    llmTransport: { async *streamChatCompletion() { calls++; yield "unexpected"; } },
    renderClient: async artifact => { renders++; return renderClient(artifact); },
  });
  assert.equal(calls, 0);
  assert.equal(renders, 1);
  assert.deepEqual(checked.model.relationships, []);
  assert.deepEqual(before.relationships, []);
});

test("a deterministic correction cannot publish a model whose source validation fails", async () => {
  const before = modelFixture("requirements", "usecase");
  if (before.diagramKind !== "usecase") throw new Error("fixture");
  before.useCases[0]!.primaryActorId = "actor";
  before.relationships = [];
  let renders = 0;
  await assert.rejects(reviewRenderedArtifact({
    record: record(), providerSettings: settings, model: before, mutable: true,
    basis: { stage: "requirements", traceability: [] },
    validateTraceability: candidate => {
      if (candidate.diagramKind === "usecase" && candidate.relationships.length) throw new Error("新关联缺少来源");
    },
    llmTransport: repairTransport(), renderClient: async artifact => { renders++; return renderClient(artifact); },
  }), /新关联缺少来源/);
  assert.equal(renders, 0);
  assert.deepEqual(before.relationships, []);
});

test("structural review rejects the retired complete-model envelope instead of unwrapping it", async () => {
  const before = modelFixture("design", "class");
  if (before.diagramKind !== "class") throw new Error("fixture");
  before.relationships[0].targetMultiplicity = "0...*";
  const corrected = structuredClone(before);
  corrected.relationships[0].targetMultiplicity = "0..*";
  let rendered = false;
  await assert.rejects(reviewRenderedArtifact({
    record: record(), providerSettings: settings, model: before, basis: { stage: "design" }, mutable: true,
    renderClient: async () => { rendered = true; throw new Error("unexpected render"); },
    llmTransport: { async *streamChatCompletion() { yield JSON.stringify({ model: corrected }); } },
  }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError);
    assert.equal(error.review.repairAttempts, 5);
    return true;
  });
  assert.equal(rendered, false);
  assert.equal(before.relationships[0].targetMultiplicity, "0...*");
});

async function rendered(input: RunRecord) {
  const value = await renderArtifactWithRepair(input, renderClient, model, { diagramKind: "usecase", source: "@startuml\n@enduml" });
  assert.equal(value.status, "success");
  if (value.status !== "success") throw new Error("render failed");
  return value;
}

test("prepared renders finish without PNG generation, image input or additional model calls", async () => {
  const run = record();
  const prepared = await rendered(run);
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, model, rendered: prepared,
    llmTransport: { async *streamChatCompletion() { throw new Error("unexpected post-render check"); } },
    renderClient: async () => { throw new Error("unexpected redraw"); },
  });
  assert.equal(result.rendered, prepared);
  assert.equal(result.review.status, "passed");
  assert.equal(result.review.checkOutcome, "verified");
  assert.equal(result.review.renderStatus, "passed");
  assert.equal(result.review.imageStatus, "skipped");
  assert.equal(result.review.attempts, 0);
  assert.equal(result.review.repairAttempts, 0);
  assert.equal(run.events.some((event) => event.type === "run_activity"), false);
});

test("SVG identities and element coverage no longer trigger post-render checks or rebuilds", async () => {
  const candidate = modelFixture("requirements", "usecase");
  for (const svg of ['<svg/>', '<svg><g id="elem_unrelated"/></svg>', '<svg><g class="entity" id="ent0001"/></svg>']) {
    const run = record(); let renders = 0, checks = 0;
    const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, model: candidate,
      basis: { stage: "requirements" }, mutable: true,
      llmTransport: { async *streamChatCompletion(input) {
        checks++; assert.equal(typeof input.messages.at(-1)?.content, "string");
        yield '{"passed":true,"issues":[],"findings":[]}';
      } },
      renderClient: async (artifact) => { renders++; return { ...await renderClient(artifact), svg }; },
    });
    assert.equal(result.rendered.svgArtifact.svg, svg);
    assert.equal(result.review.status, "passed");
    assert.equal(result.review.renderStatus, "passed");
    assert.equal(result.review.imageStatus, "skipped");
    assert.deepEqual(result.review.findings, []);
    assert.equal(result.review.repairAttempts, 0);
    assert.equal(result.review.attempts, 0);
    assert.equal(renders, 1); assert.equal(checks, 0);
    assert.equal(run.events.some((event) => event.type === "run_activity" && ["visual_check", "render_repair"].includes(event.operation ?? "")), false);
  }
});

test("text-only providers incur no requests during successful program validation", async () => {
  const run = record(); let calls = 0;
  const result = await reviewRenderedArtifact({ record: run, providerSettings: { ...settings, modelCapability: { category: "text_chat" } as ProviderSettings["modelCapability"] },
    model, basis: { stage: "requirements" }, renderClient,
    llmTransport: { async *streamChatCompletion(input) {
      calls++; assert.equal(typeof input.messages.at(-1)?.content, "string");
      yield '{"passed":true,"issues":[]}';
    } },
  });
  assert.equal(calls, 0); assert.equal(result.review.structureAttempts, 0);
  assert.equal(result.review.attempts, 0); assert.equal(result.review.status, "passed");
  assert.ok(run.events.every((event) => event.type !== "run_activity" || !event.inputImages?.length));
  assert.equal(run.events.some(event => event.type === "run_activity"), false);
});

test("accepted repair is validated, rendered, rechecked and returned for downstream generation", async () => {
  const run = record(); const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  const accepted = deriveTableModel(table);
  const checked = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(accepted), renderClient, model: table, basis: { stage: "design" }, mutable: true });
  assert.deepEqual(checked.model, JSON.parse(JSON.stringify(accepted)));
  assert.deepEqual(table.relationships, []);
  assert.equal(checked.review.repairAttempts, 1); assert.equal(checked.review.structureAttempts, 0); assert.equal(checked.review.attempts, 0);
  assert.equal(checked.review.status, "passed"); assert.equal(checked.review.repairHistory?.[0]?.status, "accepted");
  assert.ok(checked.rendered.artifact.source.includes("FK"));
  const calls = run.events.filter((event) => event.type === "run_activity" && event.phase === "started");
  assert.deepEqual(calls.map((event) => event.operation), ["model_repair"]);
  assert.equal(new Set(calls.map((event) => event.callId)).size, 1);
  assert.ok(calls.every((event) => event.modelId === "table"));
  assert.ok(calls.every((event) => !event.inputImages?.length));
});

test("out-of-scope and no-op candidates never overwrite a valid tuple; failed attempt counts", async () => {
  const valid = modelFixture("design", "class"); if (valid.diagramKind !== "class") throw new Error("fixture");
  const invalid = structuredClone(valid); invalid.relationships[0].sourceId = "missing";
  for (const candidate of [invalid, { ...valid, title: "未经授权的改写" }]) {
    const run = record(); const artifact = generateDesignPlantUmlArtifacts([valid])[0]!;
    const old = await renderClient(artifact);
    await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(candidate), renderClient, model: invalid, rendered: { status: "success", artifact, svgArtifact: { ...old, diagramKind: "class", modelId: "class" } }, basis: { stage: "design" }, mutable: true }), (error) => {
      assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.status, "failed");
      assert.equal(error.review.repairAttempts, 5); assert.ok(error.review.repairHistory?.every((item) => item.status === "rejected"));
      assert.match(error.review.stopReason!, /结构规则|越过结构修复范围|没有唯一结构依据|越过允许范围/); return true;
    });
    assert.equal(valid.relationships[0].sourceId, "order"); assert.equal(old.svg, (await renderClient(artifact)).svg);
  }
});

test("manual structural defects fail without changing the model or launching a repair", async () => {
  const table = modelFixture("design", "table");
  await assert.rejects(reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: repairTransport(), renderClient, model: table as DesignDiagramModelSpec, basis: { stage: "design" } }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 0); assert.equal(error.review.status, "failed"); return true;
  });
  assert.deepEqual(table.relationships, []);
});

test("the same model cannot reset its shared repair budget when the run is replayed", async () => {
  const run = record(); const table = modelFixture("design", "table");
  const common = { providerSettings: settings, llmTransport: repairTransport(table), renderClient, model: table, basis: { stage: "design" as const }, mutable: true };
  for (let attempt = 0; attempt < 5; attempt++) {
    const checked = await reviewRenderedArtifact({ ...common, record: run });
    assert.equal(checked.review.repairAttempts, attempt + 1);
    if ("visualReviews" in run.snapshot) run.snapshot.visualReviews[table.modelId!] = checked.review;
  }
  const restored = { ...run, snapshot: JSON.parse(JSON.stringify(run.snapshot)), events: JSON.parse(JSON.stringify(run.events)), listeners: new Set<RunRecord["listeners"] extends Set<infer T> ? T : never>() };
  await assert.rejects(reviewRenderedArtifact({ ...common, record: restored }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 5);
    assert.equal(error.review.repairHistory?.length, 5); assert.match(error.review.stopReason!, /5 次修复上限/); return true;
  });
});

test("program checks do not depend on an LLM returning valid review JSON", async () => {
  let calls = 0;
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, renderClient, model,
    basis: { stage: "requirements" }, mutable: true,
    llmTransport: { async *streamChatCompletion() { calls++; yield "invalid-json"; } },
  });
  assert.equal(calls, 0); assert.equal(checked.review.structureAttempts, 0);
  assert.equal(checked.review.checkOutcome, "verified");
  assert.equal(checked.review.imageStatus, "skipped"); assert.equal(checked.review.renderStatus, "passed");
  assert.equal(checked.review.attempts, 0); assert.equal(checked.review.repairAttempts, 0);
  assert.deepEqual(checked.review.issues, []);
});

test("provider unavailability cannot block local validation and rendering of a valid model", async () => {
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, renderClient, model,
    basis: { stage: "requirements" }, mutable: true,
    llmTransport: { async *streamChatCompletion() { throw new Error("structure provider unavailable"); } },
  });
  assert.equal(checked.review.status, "passed");
  assert.deepEqual(checked.review.issues, []);
  assert.ok(checked.rendered.svgArtifact.svg);
});


test("initial render failure records an incomplete review with zero image calls", async () => {
  await assert.rejects(reviewRenderedArtifact({ record: record(), providerSettings: settings, llmTransport: repairTransport(), renderClient: async () => { throw new Error("renderer offline"); }, model }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError);
    assert.equal(error.review.status, "failed"); assert.equal(error.review.renderStatus, "failed");
    assert.equal(error.review.attempts, 0); assert.match(error.review.issues.join(), /renderer offline/);
    return true;
  });
});

test("model repairs and render-failure retries retain the shared five-attempt budget", async () => {
  const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  const run = record(); let renders = 0;
  const corrected = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(),
    renderClient: async (artifact) => { renders++; return renderClient(artifact); },
    model: table, basis: { stage: "design" }, mutable: true });
  if ("visualReviews" in run.snapshot) run.snapshot.visualReviews.table = corrected.review;
  await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(),
    renderClient: async () => { renders++; throw new Error("renderer offline"); },
    model: corrected.model, basis: { stage: "design" }, mutable: true }), (error) => {
    assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 5);
    assert.equal(error.review.attempts, 0); assert.match(error.message, /renderer offline/);
    assert.deepEqual(error.review.repairHistory?.map((item) => item.status), ["accepted", "failed", "failed", "failed", "failed"]); return true;
  });
  assert.equal(renders, 6);
});

test("a submitted immutable model retains operational render retries", async () => {
  let renders = 0; const run = record();
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: repairTransport(),
    model, basis: { stage: "requirements" }, mutable: false,
    renderClient: async (artifact) => { if (++renders === 1) throw new Error("renderer offline"); return renderClient(artifact); },
  });
  assert.equal(renders, 2); assert.equal(result.review.status, "passed");
  assert.equal(result.review.repairAttempts, 1); assert.equal(result.review.repairHistory?.[0].target, "render");
  assert.deepEqual(result.model, model); assert.equal(result.review.renderStatus, "passed");
});

test("deterministic compilation failure stops before render retries or provider calls", async () => {
  const run = record(); let renders = 0, providerCalls = 0;
  const candidate = modelFixture("requirements", "analysis");
  if (candidate.diagramKind !== "analysis") throw new Error("fixture");
  candidate.fragments = [{ id: "unassigned", type: "alt", label: "分支", messageIds: ["m"], branches: [
    { id: "yes", label: "允许", messageIds: [] }, { id: "no", label: "拒绝", messageIds: [] },
  ] }];
  await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings,
    llmTransport: { async *streamChatCompletion() { providerCalls++; yield ""; } },
    renderClient: async artifact => { renders++; return renderClient(artifact); },
    model: candidate, basis: { stage: "requirements" }, mutable: false,
  }), error => {
    assert.ok(error instanceof DiagramReviewRenderError);
    assert.match(error.message, /消息未归入分支/);
    assert.equal(error.review.repairAttempts, 0);
    assert.equal(error.review.renderStatus, "failed");
    return true;
  });
  assert.equal(renders, 0); assert.equal(providerCalls, 0);
  assert.ok(!run.events.some(event => event.type === "run_activity" && event.operation === "render_repair"));
});

test("conditional correction timeout and render cancellation propagate abort without image calls", async () => {
  const run = record(); let aborted = false;
  const waiting: LlmTransport = { async *streamChatCompletion(input) { await new Promise<void>((_resolve, reject) => input.abortSignal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true })); yield ""; } };
  const invalid = modelFixture("design", "class"); if (invalid.diagramKind !== "class") throw new Error("fixture");
  invalid.relationships[0].targetMultiplicity = "0...*";
  await assert.rejects(reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: waiting,
    renderClient, model: invalid, mutable: true, basis: { stage: "design" }, timeoutMs: 20 }), (error) => {
      assert.ok(error instanceof DiagramReviewRenderError); assert.equal(error.review.repairAttempts, 5); return true;
    });
  assert.equal(aborted, true);
  const cancelled = record();
  await assert.rejects(reviewRenderedArtifact({ record: cancelled, providerSettings: settings, llmTransport: repairTransport(),
    renderClient: async (artifact) => { cancelled.snapshot.status = "cancelled"; return renderClient(artifact); }, model }), RunCancelledError);
});

test("parallel valid models render independently without review calls on replay", async () => {
  const run = record(); const models = ["one", "two"].map((id) => ({ ...model, modelId: id }));
  await Promise.all(models.map((candidate) => reviewRenderedArtifact({ record: run, providerSettings: settings,
    llmTransport: repairTransport(), renderClient, model: candidate, basis: { stage: "requirements" }, mutable: true })));
  const replay = JSON.parse(JSON.stringify(run.events)) as typeof run.events;
  for (const id of ["one", "two"]) {
    const starts = replay.filter((event) => event.type === "run_activity" && event.modelId === id && event.phase === "started");
    assert.equal(starts.length, 0);
    assert.ok(replay.some(event => event.type === "stage_progress" && event.modelId === id && event.subtaskStatus === "completed"));
  }
  assert.ok(replay.every((event) => event.type !== "run_activity" || (!event.inputImages?.length && event.operation !== "visual_check")));
});


test("does not solicit advisory business issues after the generated model is valid", async () => {
  const run = record(); let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() {
    calls++; yield JSON.stringify({ passed: false, issues: ["缺少审批业务用例", "多出通知业务用例", "模型说明与需求描述需要核实"] });
  } };
  const result = await reviewRenderedArtifact({ record: run, providerSettings: settings, llmTransport: transport,
    renderClient, model, basis: { stage: "requirements" } });
  assert.equal(result.review.status, "passed");
  assert.equal(calls, 0); assert.equal(result.review.issues.length, 0);
  assert.equal(result.review.repairAttempts, 0); assert.deepEqual(result.model, model);
  assert.doesNotMatch(result.rendered.artifact.source, /审批|通知/);
});

test("layout-only structure suggestions do not create pending problems or repair attempts", async () => {
  let calls = 0;
  const checked = await reviewRenderedArtifact({ record: record(), providerSettings: settings, model, basis: { stage: "requirements" }, mutable: true, renderClient,
    llmTransport: { async *streamChatCompletion() {
      calls++; yield JSON.stringify({ passed: false, issues: ["连线交叉；字号太小", "节点位置需要调整"] });
    } },
  });
  assert.equal(calls, 0); assert.equal(checked.review.status, "passed"); assert.equal(checked.review.repairAttempts, 0);
});
