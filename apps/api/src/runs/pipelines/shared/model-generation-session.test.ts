// Verifies text JSON generation, one backend validation per candidate, pinned facts and bounded same-conversation repairs.
import assert from "node:assert/strict";
import test from "node:test";
import { collectModelRefs, type DiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { GENERATE_MODELS_RESPONSE_FORMAT } from "../../../adapters/llm/response-formats/requirement-model-response-format.js";
import { createRealLlmTransport, ProviderOutputTruncatedError, type LlmTransport, type OpenAiCompatibleClientFactory, type StreamChatCompletionInput } from "../../../adapters/llm/llm-transport.js";
import { assertGeneratedModelCandidate } from "../../../normalizers/modeling/model-candidate-validation.js";
import { parseRequirementDiagramModelsResult } from "../../../normalizers/requirements/requirement-model-normalizer.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import { generateWithModelConversation } from "./model-generation-session.js";
import { RunCancelledError } from "../../records/run-cancellation.js";
import { withEngineeringContextBudget } from "./context-budget.js";
import { normalizeRunError } from "./errors.js";
import { generatePlantUmlArtifacts } from "../../../adapters/plantuml/model-renderer.js";

const rule = { id: "r17", type: "functional" as const, text: "学生可查看本人的点评结果。" };
const providerSettings = { apiBaseUrl: "https://provider.test", apiKey: "test", model: "test", modelCapability: strictTestModelCapability("test") };
function setup() {
  const record: RunRecord = { snapshot: createEmptySnapshot("tools", rule.text, ["usecase"], [rule]), events: [], listeners: new Set(), terminal: false };
  const model = modelFixture("requirements", "usecase") as Extract<DiagramModelSpec, { diagramKind: "usecase" }>;
  model.useCases[0]!.primaryActorId = model.actors[0]!.id;
  const candidate = { models: [model], requirementModelTraceability: collectModelRefs([model], true).refs.map(target => ({ ruleId: rule.id, target })) };
  const validate = (raw: string) => {
    assertGeneratedModelCandidate(raw, { stage: "requirements", kinds: ["usecase"], rules: [rule] });
    return parseRequirementDiagramModelsResult(raw, [rule]);
  };
  return { record, candidate, validate };
}
test("the first request contains complete pinned sources and accepts plain JSON without tools or a submission turn", async () => {
  const { record, candidate, validate } = setup();
  const rules = [structuredClone(rule)];
  const prompt = `生成用例，绑定规则：${JSON.stringify(rules)}`;
  let calls = 0, validations = 0;
  const result = await generateWithModelConversation({ record, providerSettings, stage: "generate_models", targetId: "usecase",
    prompt, schema: GENERATE_MODELS_RESPONSE_FORMAT,
    validate(raw) { validations++; return validate(raw); },
    transport: { async *streamChatCompletion(input) {
      calls++;
      assert.equal(input.tools, undefined); assert.equal(input.toolChoice, undefined);
      assert.equal(input.onToolCall, undefined);
      assert.equal(input.responseFormat, GENERATE_MODELS_RESPONSE_FORMAT);
      assert.equal(input.messages[1]!.content, prompt, "The caller's upstream data must not be appended a second time");
      assert.match(String(input.messages[1]!.content), new RegExp(rule.text));
      rules[0]!.text = "之后修改的需求";
      assert.doesNotMatch(String(input.messages[1]!.content), /之后修改/);
      yield JSON.stringify(candidate);
    } },
  });
  assert.deepEqual(result.models, candidate.models);
  assert.equal(calls, 1); assert.equal(validations, 1);
  assert.equal(record.events.some(event => event.type === "run_tool"), false);
  assert.deepEqual(record.events.filter(event => event.type === "run_activity" && event.operation === "structure_check").map(event => event.phase), ["started", "completed"]);
});

test("mapping errors append only diagnostics after the exact candidate and preserve the full first request", async () => {
  const { record, candidate, validate } = setup();
  const broken = structuredClone(candidate); broken.requirementModelTraceability.pop();
  const before = structuredClone(candidate);
  let calls = 0, validations = 0;
  let first: StreamChatCompletionInput["messages"] = [];
  const result = await generateWithModelConversation({ record, providerSettings, stage: "generate_models", targetId: "usecase",
    prompt: "生成用例", schema: GENERATE_MODELS_RESPONSE_FORMAT,
    validate(raw) { validations++; return validate(raw); },
    transport: { async *streamChatCompletion(input) {
      calls++;
      assert.equal(input.tools, undefined);
      if (calls === 1) first = structuredClone(input.messages);
      else {
        assert.deepEqual(input.messages.slice(0, 2), first);
        assert.deepEqual(input.messages.map(message => message.role), ["system", "user", "assistant", "user"]);
        assert.equal(input.messages[2]!.content, JSON.stringify(broken));
        const feedback = String(input.messages.at(-1)!.content);
        assert.deepEqual(Object.keys(JSON.parse(feedback)).sort(), ["errors", "valid"]);
        assert.match(feedback, /mapping-coverage-missing/);
        assert.doesNotMatch(feedback, /legalSources|candidates|expected|学生可查看本人的点评结果/);
        assert.equal(input.runContext?.round, 1);
      }
      yield JSON.stringify(calls === 1 ? broken : candidate);
    } },
  });
  assert.deepEqual(result.models, before.models);
  assert.deepEqual(candidate, before);
  assert.equal(calls, 2); assert.equal(validations, 2);
});

test("rule and model repairs send only current errors without source catalogs, warnings or repeated instructions", async () => {
  for (const artifactKind of ["model", "requirement-rules"] as const) {
    const { record } = setup();
    let calls = 0;
    const error = Object.assign(new Error("当前元素缺少映射"), {
      diagnostics: [{ code: "mapping-coverage-missing", path: "models.0", message: "当前元素缺少映射",
        expected: { legalSources: [rule] }, repairHint: "不要重复的通用指令", actual: { previousCandidate: true } }],
      warnings: [{ message: "不属于本轮错误的提示" }],
    });
    await generateWithModelConversation({ record, providerSettings, artifactKind, stage: "generate_models", targetId: "usecase",
      prompt: `首次绑定的完整资料：${JSON.stringify(rule)}`, schema: GENERATE_MODELS_RESPONSE_FORMAT,
      validate(raw) { if (raw === "{}") throw error; return JSON.parse(raw); },
      transport: { async *streamChatCompletion(input) {
        if (++calls === 2) {
          assert.deepEqual(input.messages.map(message => message.role), ["system", "user", "assistant", "user"]);
          assert.equal(input.messages.at(-2)!.content, "{}");
          assert.deepEqual(JSON.parse(String(input.messages.at(-1)!.content)), { valid: false,
            errors: [{ code: "mapping-coverage-missing", path: "models.0", reason: "当前元素缺少映射" }] });
        }
        yield calls === 1 ? "{}" : '{"accepted":true}';
      } },
    });
    assert.equal(calls, 2);
  }
});

test("compiler failures repair the complete candidate inside the same conversation", async () => {
  const { record } = setup();
  const model = modelFixture("requirements", "analysis");
  if (model.diagramKind !== "analysis") throw new Error("fixture");
  model.messages.push(...["saved", "rejected"].map(id => ({ ...structuredClone(model.messages[0]!), id, name: id })));
  model.fragments = [{ id: "choice", type: "alt", label: "范围检查", messageIds: ["m", "saved", "rejected"], branches: [
    { id: "yes", label: "允许", messageIds: ["saved"] }, { id: "no", label: "拒绝", messageIds: ["rejected"] },
  ] }];
  const candidate = { models: [model] };
  const corrected = structuredClone(candidate); corrected.models[0]!.fragments[0]!.messageIds = ["saved", "rejected"];
  let calls = 0, validations = 0, compilations = 0;
  const result = await generateWithModelConversation({ record, providerSettings, stage: "generate_models", targetId: "analysis:case",
    prompt: "生成分析模型", schema: GENERATE_MODELS_RESPONSE_FORMAT,
    validate(raw) { validations++; return JSON.parse(raw) as typeof candidate; },
    compile(value) { compilations++; generatePlantUmlArtifacts(value.models, "requirements", "schema"); },
    transport: { async *streamChatCompletion(input) {
      if (++calls > 1) {
        assert.equal(input.messages.at(-2)!.content, JSON.stringify(candidate));
        assert.match(String(input.messages.at(-1)!.content), /fragment-contiguity|片段/);
      }
      yield JSON.stringify(calls === 1 ? candidate : corrected);
    } },
  });
  assert.deepEqual(result, corrected);
  assert.equal(calls, 2); assert.equal(validations, 2); assert.equal(compilations, 2);
  assert.deepEqual(record.events.filter(event => event.type === "run_activity" && event.operation === "model_compile").map(event => event.phase), ["started", "failed", "started", "completed"]);
});

test("truncated replies preserve complete history and reasoning, never validating a partial candidate", async () => {
  const { record, candidate, validate } = setup();
  const broken = structuredClone(candidate); broken.requirementModelTraceability.pop();
  let requests = 0, validations = 0;
  const rounds: Array<number | undefined> = [];
  const clientFactory: OpenAiCompatibleClientFactory = () => ({ chat: { completions: { create: async body => {
    assert.equal(body.max_tokens, 384_000);
    assert.deepEqual(body.tools, []); assert.equal(body.tool_choice, "none");
    const step = requests++;
    return (async function* () {
      yield { choices: [{ delta: { reasoning_content: step === 1 ? "unfinished-reasoning" : `complete-reasoning-${step}` } }] };
      yield { choices: [{ delta: { content: JSON.stringify(step === 0 ? broken : step === 1 ? { unfinished: true } : candidate) } }] };
      yield { choices: [{ delta: {}, finish_reason: step === 1 ? "length" : "stop" }] };
    })() as never;
  } } }, models: { list: async () => ({ data: [] }) } });
  const real = createRealLlmTransport({ clientFactory, resolveHostname: async () => ["8.8.8.8"] });
  const transport = withEngineeringContextBudget({ async *streamChatCompletion(input) {
    rounds.push(input.runContext?.round);
    if (requests > 0) assert.deepEqual(input.messages.filter(message => message.role === "assistant").map(message => message.reasoningContent), ["complete-reasoning-0"]);
    assert.doesNotMatch(JSON.stringify(input.messages), /unfinished/);
    yield* real.streamChatCompletion(input);
  } }, { context: 1_000_000, output: 384_000, source: "admin", matchedId: null, updatedAt: null });
  const result = await generateWithModelConversation({ record, providerSettings, transport, stage: "generate_models", targetId: "usecase",
    prompt: "生成", schema: GENERATE_MODELS_RESPONSE_FORMAT,
    validate(raw) { validations++; return validate(raw); },
  });
  assert.deepEqual(result.models, candidate.models);
  assert.equal(requests, 3); assert.equal(validations, 2);
  assert.deepEqual(rounds, [undefined, 1, 2]);
});

test("persistent truncation exhausts the shared repair limit", async () => {
  const { record, validate } = setup();
  let calls = 0, validations = 0;
  await assert.rejects(generateWithModelConversation({ record, providerSettings, stage: "generate_models", targetId: "usecase",
    prompt: "生成", schema: GENERATE_MODELS_RESPONSE_FORMAT,
    validate(raw) { validations++; return validate(raw); },
    transport: { async *streamChatCompletion() { calls++; throw new ProviderOutputTruncatedError(); } },
  }), error => {
    assert.match(normalizeRunError(error).message, /长度限制.*共享 5 次修复上限/); return true;
  });
  assert.equal(calls, 6); assert.equal(validations, 0);
});

test("cancellation, changed sources and transport failures never initiate extra repairs", async () => {
  for (const mode of ["cancelled", "aborted", "source", "transport"]) {
    const { record, candidate, validate } = setup();
    const controller = new AbortController();
    const failure = new Error("connection interrupted");
    let calls = 0;
    await assert.rejects(generateWithModelConversation({ record, providerSettings, stage: "generate_models", targetId: "usecase",
      prompt: "生成", schema: GENERATE_MODELS_RESPONSE_FORMAT, validate,
      abortSignal: controller.signal, assertSourceCurrent() { if (mode === "source" && calls) throw new Error("来源已变化"); },
      transport: { async *streamChatCompletion() {
        calls++;
        if (mode === "cancelled") record.snapshot.status = "cancelled";
        if (mode === "aborted") controller.abort();
        if (mode === "transport") throw failure;
        yield JSON.stringify(candidate);
      } },
    }), error => mode === "transport" ? error === failure : mode === "source" ? /来源已变化/.test(String(error))
      : mode === "cancelled" ? error instanceof RunCancelledError : error instanceof Error && error.name === "AbortError");
    assert.equal(calls, 1);
    assert.equal(record.events.some(event => event.type === "stage_progress" && event.subtaskStatus === "repairing"), false);
  }
});
