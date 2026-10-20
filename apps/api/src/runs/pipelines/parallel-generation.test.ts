// Verifies model-level generation keeps failures and retries scoped to the affected diagram.
import { strictTestModelCapability } from "../../test-fixtures/providers/model-capability.js";
import { assertCurrentRunSnapshot, createRequirementBaselineSnapshot, validateModelInput } from "@uml-platform/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiagramKind,
  DiagramModelSpec,
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  ProviderSettings,
  RequirementRule,
  RequirementModelTraceabilityEntry,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { createEmptyDesignSnapshot, createEmptySnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { RunCancelledError } from "../records/run-cancellation.js";
import { runDesignStagePipeline as runDesignWithChecks } from "./design-pipeline.js";
import { runStagePipeline as runRequirementsWithChecks } from "./requirements-pipeline.js";
import { generateModelsWithRepair } from "./requirements-pipeline.js";
import { createRunLlmChunkHandlers } from "./shared/llm-chunk-events.js";
import { withModelTaskTimeout } from "./shared/model-task-timeout.js";
import { collectTextResult } from "./shared/structured-output.js";
import { getRunError } from "./shared/errors.js";
import { createQueuedRunFromSource } from "../records/run-actions.js";

// Generation-count tests exclude the new independent review operation; its calls have dedicated coverage.
function withStructureReview(transport: LlmTransport): LlmTransport {
  return { async *streamChatCompletion(input) {
    const prompt = input.messages.at(-1)?.content;
    if (typeof prompt === "string" && /^核对 (?:feasibility|requirements|design)\.[a-z]+ 的结构与业务内容。/.test(prompt)) yield '{"passed":true,"issues":[],"findings":[]}';
    else yield* transport.streamChatCompletion(input);
  } };
}
const runStagePipeline = (...args: Parameters<typeof runRequirementsWithChecks>) => {
  args[2] = withStructureReview(args[2]);
  args[4] = async () => { throw new Error("unexpected PNG render during requirement model generation"); };
  return runRequirementsWithChecks(...args);
};
const runDesignStagePipeline = (...args: Parameters<typeof runDesignWithChecks>) => { args[2] = withStructureReview(args[2]); return runDesignWithChecks(...args); };

const LIBRARY_REQUIREMENT_TEXT = `一个小型图书馆管理系统，需完成以下工作：
(1)借书、还书；
(2)图书馆中增加/删除一本书；
(3)照作者名或专业领域检索一批书；
(4)找出被某位读者借出的一批书；
(5)找出最近借走某本图书的读者。
该系统有两类用户：图书管理员与普通读者。
功能(4)可供普通读者查找他们自己借出的书目。
功能(1)、(2)、(5)只供图书管理员使用。
该系统必须满足以下限制：
(1)馆中所有未借出的书籍能够供读者随时借阅。
(2)在同一时刻，一本书不能既被借出，又可供借阅。
(3)一个读者一次借出的书籍数目不能超过预定值。`;

const providerSettings: ProviderSettings = {
  modelCapability: strictTestModelCapability("test-model"),
  apiBaseUrl: "https://llm.test",
  apiKey: "test-key",
  model: "test-model",
};

const libraryRules: RequirementRule[] = [
  {
    id: "r1",
    type: "functional" as const,
    text: "图书管理员可以办理借书和还书。",
    sourceFragment: "(1)借书、还书；",

  },
  {
    id: "r2",
    type: "data" as const,
    text: "系统需要记录图书、读者和借阅记录。",
    sourceFragment: "(4)找出被某位读者借出的一批书；",

  },
  {
    id: "r3",
    type: "operations" as const,
    text: "系统需要部署为可访问的图书馆管理服务。",
    sourceFragment: "一个小型图书馆管理系统，需完成以下工作：",

  },
];

function modelForKind(kind: DiagramKind): DiagramModelSpec {
  if (kind === "function") {
    return {
      diagramKind: "function",
      title: "图书馆功能结构图",
      summary: "图书馆管理功能分解。",
      notes: [],
      nodes: [
        { id: "fn_library", name: "图书馆管理", sourceRequirementIds: ["REQ-001"] },
        { id: "fn_borrow", name: "借还书", sourceRequirementIds: ["REQ-001"] },
      ],
      relationships: [
        {
          id: "rel_fn_borrow",
          type: "decomposition",
          sourceId: "fn_library",
          targetId: "fn_borrow",
        },
      ],
    };
  }

  if (kind === "usecase") {
    return {
      diagramKind: "usecase",
      title: "图书馆用例模型",
      summary: "管理员与读者的核心用例。",
      notes: [],
      actors: [
        {
          id: "actor_librarian",
          name: "图书管理员",
          actorType: "human",
          responsibilities: ["借书", "还书", "维护图书"],
        },
      ],
      useCases: [
        {
          id: "uc_borrow",
          systemBoundaryId: "boundary_library",
          name: "借书",
          goal: "登记图书借阅",
          preconditions: ["图书未借出"],
          postconditions: ["图书被借出"],
          primaryActorId: "actor_librarian",
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [{ id: "boundary_library", name: "图书馆管理系统" }],
      relationships: [
        {
          id: "rel_librarian_borrow",
          type: "association",
          sourceId: "actor_librarian",
          targetId: "uc_borrow",
        },
      ],
    };
  }

  if (kind === "class") {
    return {
      diagramKind: "class",
      title: "图书馆领域概念模型",
      summary: "图书、读者和借阅记录。",
      notes: [],
      classes: [
        {
          id: "class_book",
          name: "图书",
          classKind: "entity",
          attributes: [
            { name: "id", type: "string", visibility: "private" },
            { name: "available", type: "boolean", visibility: "private" },
          ],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    };
  }

  if (kind === "activity") {
    return {
      diagramKind: "activity",
      title: "图书馆界面关系",
      summary: "借书和还书流程。",
      notes: [],
      swimlanes: [{ id: "lane_librarian", name: "图书管理员" }],
      nodes: [
        { id: "start", type: "start", name: "开始" },
        {
          id: "act_borrow",
          type: "activity",
          name: "办理借书",
          actorOrLane: "lane_librarian",
          input: ["读者", "图书"],
          output: ["借阅记录"],
        },
        { id: "end", type: "end", name: "结束" },
      ],
      relationships: [
        {
          id: "flow_borrow",
          type: "control_flow",
          sourceId: "start",
          targetId: "act_borrow",
        },
        {
          id: "flow_end",
          type: "control_flow",
          sourceId: "act_borrow",
          targetId: "end",
        },
      ],
    };
  }

  return {
    diagramKind: "deployment",
    title: "图书馆部署模型",
    summary: "管理服务和数据库部署。",
    notes: [],
    nodes: [
      {
        id: "node_app",
        name: "图书馆管理服务",
        nodeType: "device",
        environment: "production",
      },
    ],
    databases: [{ id: "db_library", name: "图书馆数据库", engine: "PostgreSQL" }],
    components: [],
    externalSystems: [],
    artifacts: [],
    relationships: [
      {
        id: "rel_app_db",
        type: "communication",
        sourceId: "node_app",
        targetId: "db_library",
        protocol: "TCP",
      },
    ],
  };
}

function outputForKind(kind: DiagramKind) {
  const ruleId =
    kind === "class" ? "r2" : kind === "deployment" ? "r3" : "r1";
  const model = modelForKind(kind);
  const targets =
    kind === "function"
      ? [
          { elementId: "fn_library", elementKind: "function", label: "图书馆管理" },
          { elementId: "fn_borrow", elementKind: "function", label: "借还书" },
          {
            elementId: "rel_fn_borrow",
            elementKind: "relationship",
            label: "图书馆管理 -> 借还书",
          },
        ]
      : kind === "usecase"
      ? [
          { elementId: "actor_librarian", elementKind: "actor", label: "图书管理员" },
          { elementId: "uc_borrow", elementKind: "usecase", label: "借书" },
          {
            elementId: "rel_librarian_borrow",
            elementKind: "relationship",
            label: "图书管理员 -> 借书",
          },
        ]
      : kind === "class"
        ? [{ elementId: "class_book", elementKind: "class", label: "图书" }]
        : kind === "activity"
          ? [
              { elementId: "act_borrow", elementKind: "activity", label: "办理借书" },
              {
                elementId: "flow_borrow",
                elementKind: "relationship",
                label: "开始 -> 办理借书",
              },
              {
                elementId: "flow_end",
                elementKind: "relationship",
                label: "办理借书 -> 结束",
              },
            ]
          : [
              {
                elementId: "node_app",
                elementKind: "deployment-node",
                label: "图书馆管理服务",
              },
              { elementId: "db_library", elementKind: "database", label: "图书馆数据库" },
              {
                elementId: "rel_app_db",
                elementKind: "relationship",
                label: "图书馆管理服务 -> 图书馆数据库",
              },
            ];
  return JSON.stringify({
    models: [model],
    requirementModelTraceability: targets.map((target) => ({
      ruleId,
      target: {
        diagramKind: kind,
        ...target,
      },
    })),
  });
}

function selectedKindFromPrompt(prompt: string): DiagramKind {
  const match = prompt.match(/只生成以下图类型：\n([^\n]+)/);
  if (!match && /diagramKind 为 analysis|只包含 diagramKind 为 analysis|需求分析顺序图/.test(prompt)) {
    return "analysis";
  }
  const listed = (match?.[1] ?? "usecase").split(",").map((item) => item.trim());
  return (listed[0] ?? "usecase") as DiagramKind;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForAbortSignal(signal: AbortSignal | undefined, guardMs = 1000) {
  return new Promise<never>((_resolve, reject) => {
    if (!signal) {
      reject(new Error("test transport did not receive an abort signal"));
      return;
    }

    let guard: ReturnType<typeof setTimeout> | undefined;
    const rejectAfterAbort = () => {
      if (guard) clearTimeout(guard);
      setTimeout(() => reject(new Error("aborted after timeout")), 0);
    };

    if (signal.aborted) {
      rejectAfterAbort();
      return;
    }

    signal.addEventListener("abort", rejectAfterAbort, { once: true });
    guard = setTimeout(() => {
      signal.removeEventListener("abort", rejectAfterAbort);
      reject(new Error("test transport did not receive abort before guard timeout"));
    }, guardMs);
  });
}

function useCaseIdFromSingleUseCasePrompt(prompt: string) {
  return prompt.match(/"useCases"\s*:\s*\[\s*\{[\s\S]*?"id"\s*:\s*"([^"]+)"/)?.[1];
}

async function withTemporaryEnv<T>(
  key: string,
  value: string | undefined,
  callback: () => Promise<T>,
) {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

test("collectTextResult preserves blank chunks in raw output but hides them from visible chunk callbacks", async () => {
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      yield "{";
      yield "   ";
      yield "\n";
      yield '"ok":true';
      yield "}";
    },
  };
  const visibleChunks: string[] = [];

  const rawOutput = await collectTextResult(
    transport,
    providerSettings,
    [{ role: "user", content: "test" }],
    (chunk) => visibleChunks.push(chunk),
  );

  assert.equal(rawOutput, '{   \n"ok":true}');
  assert.deepEqual(visibleChunks, ["{", '"ok":true', "}"]);
});

test("blank LLM chunk handler emits a waiting-for-valid-output progress event instead of llm_chunk noise", () => {
  const snapshot = createEmptySnapshot("run-blank-progress", "需求", ["analysis"], []);
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };
  const handlers = createRunLlmChunkHandlers({
    record,
    stage: "generate_models",
    diagramKind: "analysis",
    modelId: "analysis:uc-1",
    subtaskId: "analysis:uc-1",
    subtaskLabel: "需求分析模型：注册活动",
  });

  for (let index = 0; index < 40; index += 1) {
    handlers.onBlankChunk?.("   ");
  }

  assert.equal(record.events.some((event) => event.type === "llm_chunk"), false);
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.subtaskId === "analysis:uc-1" &&
        event.message?.includes("模型持续返回空白片段"),
    ),
  );
});

test("silent LLM stream emits no-visible-output heartbeat before the first visible chunk", async () => {
  const snapshot = createEmptySnapshot("run-silent-heartbeat", "需求", ["analysis"], []);
  const seen: RunEvent[] = [];
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set([(event) => seen.push(event)]),
    terminal: false,
  };
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield "{\"rules\":[]}";
    },
  };

  const output = await collectTextResult(
    transport,
    providerSettings,
    [{ role: "user", content: "test" }],
    createRunLlmChunkHandlers({
      record,
      stage: "extract_rules",
      noVisibleChunkHeartbeatInitialDelayMs: 1,
      noVisibleChunkHeartbeatIntervalMs: 5,
    }),
  );

  assert.equal(output, "{\"rules\":[]}");
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.stage === "extract_rules" &&
        event.message === "模型正在生成，当前供应商暂未返回可见流式内容",
    ),
  );
  assert.ok(
    seen.some(
      (event) => event.type === "llm_chunk" && event.chunk === "{\"rules\":[]}",
    ),
  );
});

test("model task timeout treats blank chunks as non-effective output", async () => {
  let interval: ReturnType<typeof setInterval> | undefined;
  let signalAborted = false;
  try {
    await assert.rejects(
      () =>
        withModelTaskTimeout(
          async (_markActivity, markBlankActivity, abortSignal) =>
            new Promise<never>(() => {
              abortSignal.addEventListener("abort", () => {
                signalAborted = true;
              });
              interval = setInterval(markBlankActivity, 1);
            }),
          {
            idleTimeoutMs: 200,
            blankOutputTimeoutMs: 15,
            maxRuntimeMs: 200,
            label: "空白输出任务",
          },
        ),
      /长时间仅收到空白输出，超过 15ms/,
    );
    assert.equal(signalAborted, true);
  } finally {
    if (interval) clearInterval(interval);
  }
});

test("model task timeout allows meaningful activity to extend the idle window", async () => {
  let interval: ReturnType<typeof setInterval> | undefined;
  try {
    const result = await withModelTaskTimeout(
      async (markActivity) =>
        new Promise<string>((resolve) => {
          interval = setInterval(markActivity, 5);
          setTimeout(() => resolve("ok"), 35);
        }),
      {
        idleTimeoutMs: 15,
        maxRuntimeMs: 200,
        label: "有效输出任务",
      },
    );
    assert.equal(result, "ok");
  } finally {
    if (interval) clearInterval(interval);
  }
});

test("requirement rule extraction aborts the LLM stream when the run is cancelled", async () => {
  await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS", "5000", async () => {
    await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS", "5000", async () => {
      const snapshot = createEmptySnapshot(
        "run-requirement-extract-cancel",
        "用户可以登录系统。",
        ["usecase"],
        [],
      );
      const record: RunRecord = {
        snapshot,
        events: [],
        listeners: new Set(),
        terminal: false,
      };
      let abortObserved = false;
      const transport: LlmTransport = {
        async *streamChatCompletion(input: StreamChatCompletionInput) {
          snapshot.status = "cancelled";
          await new Promise<void>((resolve, reject) => {
            const signal = input.abortSignal;
            const guard = setTimeout(() => {
              reject(new Error("test transport did not receive abort after cancellation"));
            }, 1500);
            const finish = () => {
              clearTimeout(guard);
              abortObserved = true;
              resolve();
            };
            if (signal?.aborted) {
              finish();
              return;
            }
            signal?.addEventListener("abort", finish, { once: true });
          });
        },
      };
      const renderClient: RenderClient = async (artifact) => ({
        svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
        renderMeta: {
          engine: "test",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 1,
        },
      });

      await assert.rejects(
        () => runStagePipeline(record, providerSettings, transport, renderClient),
        RunCancelledError,
      );
      assert.equal(abortObserved, true);
    });
  });
});

test("requirement pipeline calls the LLM once per selected model and keeps successful models when one model fails", async () => {
  const calls: Array<{ kind: DiagramKind; prompt: string }> = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const kind = input.runContext?.diagramKind ?? selectedKindFromPrompt(prompt);
      calls.push({ kind, prompt });
      if (kind === "activity") {
        yield "{bad-json";
        return;
      }
      yield outputForKind(kind);
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-library",
    LIBRARY_REQUIREMENT_TEXT,
    ["usecase", "class", "activity", "deployment"],
    libraryRules,
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await assert.rejects(() => runStagePipeline(record, providerSettings, transport, renderClient), error => getRunError(error)?.code === "RUN_STRUCTURED_OUTPUT_INVALID");

  const completed = record.snapshot as RunSnapshot;
  assert.deepEqual(
    [...new Set(calls.map((call) => call.kind))].sort(),
    ["activity", "class", "deployment", "usecase"],
  );
  assert.equal(calls.filter((call) => call.kind === "class").length, 1);
  assert.equal(calls.filter((call) => call.kind === "deployment").length, 1);
  assert.equal(calls.filter((call) => call.kind === "usecase").length, 1);
  assert.ok(calls.filter((call) => call.kind === "activity").length > 1);
  assert.deepEqual(
    completed.models.map((model) => model.diagramKind).sort(),
    ["class", "deployment", "usecase"],
  );
  assert.equal(completed.diagramErrors.activity?.stage, "generate_models");
  assert.notEqual(completed.status, "completed");
  assert.equal(record.events.some(event => event.type === "completed"), false);
  assert.equal(completed.outputManifest?.filter(item => item.kind === "model").length, 3);
  const repairs = record.events.filter((event) => event.type === "stage_progress" && event.message?.includes("模型 JSON 结构不合法"));
  assert.ok(repairs.length > 0);
  for (const event of repairs) {
    assert.equal("diagramKind" in event && event.diagramKind, "activity");
    assert.equal("subtaskId" in event && event.subtaskId, "activity");
  }
});

test("requirement pipeline publishes declared actor-link repairs without inventing source mappings", async () => {
  const generated = JSON.parse(outputForKind("usecase"));
  generated.models[0].modelId = "custom-usecase";
  generated.models[0].actors.push({ ...generated.models[0].actors[0], id: "actor_panel", name: "控制面板", actorType: "external" });
  generated.models[0].useCases[0].supportingActorIds = ["actor_panel"];
  generated.requirementModelTraceability.push({ ruleId: "r1",
    target: { diagramKind: "usecase", elementId: "actor_panel", elementKind: "actor", label: "控制面板" } });
  const snapshot = createEmptySnapshot("actor-repair", LIBRARY_REQUIREMENT_TEXT, ["usecase"], libraryRules);
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  await runStagePipeline(record, providerSettings, {
    async *streamChatCompletion() { yield JSON.stringify(generated); },
  }, async (artifact) => ({ svg: "<svg></svg>", renderMeta: {
    engine: "test", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1,
  } }));
  assert.equal(snapshot.status, "completed");
  assert.deepEqual(snapshot.diagramErrors, {});
  assert.equal(snapshot.models[0].modelId, "custom-usecase");
  assert.ok(snapshot.svgArtifacts.some((artifact) => artifact.modelId === "custom-usecase"));
  const published = snapshot.models[0];
  assert.ok(published.diagramKind === "usecase" && published.relationships.some((edge) => edge.id === "association:actor_panel:uc_borrow"));
  assert.equal(snapshot.requirementModelTraceability.some((entry) => entry.target.elementId === "association:actor_panel:uc_borrow"), false);
  assert.deepEqual(snapshot.rules, libraryRules);
});

test("requirement pipeline rejects absent sources after five repairs without inventing associations", async () => {
  let llmCalls = 0;
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      llmCalls += 1;
      yield JSON.stringify({
        models: [modelForKind("activity")],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-empty-requirement-traceability",
    LIBRARY_REQUIREMENT_TEXT,
    ["activity"],
    libraryRules,
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await assert.rejects(runStagePipeline(record, providerSettings, transport, renderClient), /requirementModelTraceability.*共享 5 次/);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(llmCalls, 6);
  assert.notEqual(completed.status, "completed");
  assert.equal(completed.models.length, 0);
  assert.deepEqual(completed.requirementModelTraceability, []);
  assert.equal(
    completed.requirementTrace.some(
      (entry) =>
        entry.kind === "parsed_model" &&
        Boolean(
          (entry.parsedData as { autoFilledRequirementTraceability?: boolean } | undefined)
            ?.autoFilledRequirementTraceability,
        ),
    ), false,
  );
});

test("requirement pipeline retries activity with a compact prompt after provider timeout", async () => {
  const prompts: string[] = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      prompts.push(prompt);
      if (prompts.length === 1) {
        await waitForAbortSignal(input.abortSignal);
        return;
      }
      assert.match(prompt, /精简重试/);
      assert.match(prompt, /diagramKind="activity"/);
      assert.match(prompt, /人工验收补充/);
      yield JSON.stringify({
        models: [modelForKind("activity")],
        requirementModelTraceability: [{ ruleId: "r1", target: { diagramKind: "activity", elementId: "act_borrow", elementKind: "activity", label: "办理借书" } }],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-activity-compact-timeout-retry",
    LIBRARY_REQUIREMENT_TEXT,
    ["activity"],
    libraryRules,
  );
  snapshot.rules[0]!.text += "人工验收补充";
  snapshot.requirementBaseline = createRequirementBaselineSnapshot({ runId: snapshot.runId, requirementText: snapshot.requirementText, rules: snapshot.rules,
     });
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS", "20", async () => {
    await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS", "500", async () => {
      await runStagePipeline(record, providerSettings, transport, renderClient);
    });
  });

  const completed = record.snapshot as RunSnapshot;
  assert.equal(prompts.length, 2);
  assert.equal(completed.status, "completed");
  assert.ok(completed.models.some((model) => model.diagramKind === "activity"));
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.subtaskId === "activity" &&
        event.subtaskStatus === "repairing" &&
        event.message?.includes("精简活动图提示重试"),
    ),
  );
});

test("requirement pipeline renders a completed model before slower models finish", async () => {
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const kind = selectedKindFromPrompt(prompt);
      if (kind === "class") {
        await delay(40);
      }
      yield outputForKind(kind);
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-requirement-pipeline-render",
    LIBRARY_REQUIREMENT_TEXT,
    ["usecase", "class"],
    libraryRules,
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const useCaseSvgIndex = record.events.findIndex(
    (event) =>
      event.type === "artifact_ready" &&
      event.stage === "render_svg" &&
      event.artifactKind === "svg" &&
      event.diagramKind === "usecase",
  );
  const classModelIndex = record.events.findIndex(
    (event) =>
      event.type === "artifact_ready" &&
      event.stage === "generate_models" &&
      event.artifactKind === "model" &&
      event.diagramKind === "class",
  );
  assert.notEqual(useCaseSvgIndex, -1);
  assert.notEqual(classModelIndex, -1);
  assert.ok(useCaseSvgIndex < classModelIndex);
  const modelFinishedIndex = record.events.findIndex((event) => event.type === "stage_finished" && event.stage === "generate_models");
  assert.ok(modelFinishedIndex > classModelIndex);
  assert.equal(record.events.filter((event) => event.type === "stage_finished" && event.stage === "generate_models").length, 1);
});

test("requirement pipeline reuses contextual use case event flows for analysis-only reruns", async () => {
  const useCaseRule: RequirementRule = {
    id: "r-usecase",
    type: "functional" as const,
    text: "图书管理员可以按事件流完成借书。",

  };
  const useCaseContext = modelForKind("usecase");
  assert.equal(useCaseContext.diagramKind, "usecase");
  const contextualUseCase: DiagramModelSpec = {
    ...useCaseContext,
    useCases: useCaseContext.useCases.map((useCase) => ({
      ...useCase,
      eventFlows: [
        {
          id: "flow_borrow_main",
          name: "借书主成功场景",
          flowType: "main",
          trigger: "图书管理员发起借书",
          steps: [
            {
              order: 1,
              actor: "actor",
              actorAction: "提交读者与图书信息",
              systemAction: "校验图书可借状态",
            },
            {
              order: 2,
              actor: "system",
              action: "创建借阅记录",
              systemResponse: "返回借书成功",
            },
          ],
        },
      ],
    })),
  };
  const calls: string[] = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      calls.push(prompt);
      yield JSON.stringify({
        models: [
          {
            diagramKind: "analysis",
            modelId: "analysis:uc_borrow",
            sourceUseCaseId: "uc_borrow",
            sourceUseCaseName: "借书",
            title: "借书需求分析模型",
            summary: "根据借书用例事件流生成的需求阶段交互。",
            notes: [],
            participants: [
              { sourceElementIds: ["uc_borrow"],
                id: "actor_librarian",
                name: "图书管理员",
                participantType: "actor",
              },
              { sourceElementIds: ["uc_borrow"],
                id: "boundary_borrow",
                name: "借书界面",
                participantType: "boundary",
              },
              { sourceElementIds: ["uc_borrow"],
                id: "control_borrow",
                name: "借书控制",
                participantType: "control",
              },
            ],
            messages: [
              { sourceElementIds: ["uc_borrow"],
                id: "msg_submit",
                type: "sync",
                sourceId: "actor_librarian",
                targetId: "boundary_borrow",
                name: "提交借书信息",
                parameters: ["读者", "图书"],
                description: "图书管理员提交读者与图书信息。",
              },
              { sourceElementIds: ["uc_borrow"],
                id: "msg_validate",
                type: "sync",
                sourceId: "boundary_borrow",
                targetId: "control_borrow",
                name: "校验可借",
                parameters: ["图书"],
              },
            ],
            fragments: [],
          },
        ],
        requirementModelTraceability: [
          ...[
            ["actor_librarian", "participant", "图书管理员"],
            ["boundary_borrow", "participant", "借书界面"],
            ["control_borrow", "participant", "借书控制"],
            ["msg_submit", "message", "提交借书信息"],
            ["msg_validate", "message", "校验可借"],
          ].map(([elementId, elementKind, label]) => ({
            ruleId: "r-analysis",
            target: {
              diagramKind: "analysis",
              modelId: "analysis:uc_borrow",
              elementId,
              elementKind,
              label,
            },
          })),
        ],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-analysis-only",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [useCaseRule],
    {
      models: [contextualUseCase],
      requirementModelTraceability: [
        {
          ruleId: "r-usecase",
          target: {
            diagramKind: "usecase",
            elementId: "uc_borrow",
            elementKind: "usecase",
            label: "借书",
          },
        },
      ],
    },
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? "", /单用例需求阶段用例模型/);
  assert.match(calls[0] ?? "", /uc_borrow/);
  assert.doesNotMatch(calls[0] ?? "", /已确认需求项/);
  assert.doesNotMatch(calls[0] ?? "", /RequirementBaseline（/);
  assert.doesNotMatch(calls[0] ?? "", /图书管理员可以按事件流完成借书/);
  assert.equal(completed.status, "completed");
  assert.equal(completed.diagramErrors.usecase, undefined);
  assert.equal(
    completed.models.find((model) => model.diagramKind === "analysis")?.modelId,
    "analysis:uc_borrow",
  );
  assert.deepEqual(
    completed.models.map((model) => model.diagramKind).sort(),
    ["analysis", "usecase"],
  );
  assert.equal(
    completed.requirementModelTraceability.some(
      (entry) => entry.target.diagramKind === "analysis",
    ),
    false,
  );
});

test("requirement pipeline records implicit usecase dependency for analysis-only snapshots", async () => {
  const useCaseRule: RequirementRule = {
    id: "r-usecase",
    type: "functional" as const,
    text: "需求分析必须基于用例事件流生成。",

  };
  const calls: DiagramKind[] = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const selectedKind = selectedKindFromPrompt(prompt);
      const kind =
        !/只生成以下图类型：/.test(prompt) &&
        /diagramKind="analysis"|需求分析顺序图|单用例需求阶段用例模型/.test(prompt)
          ? "analysis"
          : selectedKind;
      calls.push(kind);
      if (kind === "usecase") {
        const useCaseModel = modelForKind("usecase");
        assert.equal(useCaseModel.diagramKind, "usecase");
        yield JSON.stringify({
          models: [
            {
              ...useCaseModel,
              useCases: useCaseModel.useCases.map((useCase) => ({
                ...useCase,
                eventFlows: [
                  {
                    id: "flow_borrow_main",
                    name: "借书主成功场景",
                    flowType: "main",
                    trigger: "图书管理员发起借书",
                    steps: [
                      {
                        order: 1,
                        actor: "actor",
                        actorAction: "提交读者与图书信息",
                        systemAction: "校验图书可借状态",
                      },
                    ],
                  },
                ],
              })),
            },
          ],
          requirementModelTraceability: JSON.parse(outputForKind("usecase")).requirementModelTraceability.map((entry: RequirementModelTraceabilityEntry) => ({ ...entry, ruleId: "r-usecase" })),
        });
        return;
      }

      yield JSON.stringify({
        models: [
          {
            diagramKind: "analysis",
            modelId: "analysis:uc_borrow",
            sourceUseCaseId: "uc_borrow",
            sourceUseCaseName: "借书",
            title: "借书需求分析模型",
            summary: "基于自动补齐的借书用例生成需求分析顺序图。",
            notes: [],
            participants: [
              { sourceElementIds: ["uc_borrow"],
                id: "actor_librarian",
                name: "图书管理员",
                participantType: "actor",
              },
              { sourceElementIds: ["uc_borrow"],
                id: "boundary_borrow",
                name: "借书界面",
                participantType: "boundary",
              },
            ],
            messages: [
              { sourceElementIds: ["uc_borrow"],
                id: "msg_submit",
                type: "sync",
                sourceId: "actor_librarian",
                targetId: "boundary_borrow",
                name: "提交借书信息",
                parameters: ["读者", "图书"],
              },
            ],
            fragments: [],
          },
        ],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-analysis-implicit-usecase",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [useCaseRule],
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(completed.status, "completed");
  assert.deepEqual(calls, ["usecase", "analysis"]);
  assert.deepEqual(completed.requestedDiagrams, ["analysis"]);
  assert.deepEqual(completed.selectedDiagrams, ["usecase", "analysis"]);
  assert.deepEqual(completed.dependencyDiagrams, ["usecase"]);
  assert.ok(completed.models.some((model) => model.diagramKind === "usecase"));
  assert.ok(
    completed.models.some(
      (model) => model.diagramKind === "analysis" && model.modelId === "analysis:uc_borrow",
    ),
  );
});

test("requirement pipeline retries analysis with a compact prompt after provider timeout", async () => {
  const useCaseRule: RequirementRule = {
    id: "r-usecase",
    type: "functional" as const,
    text: "每个用例都应由事件流生成独立需求分析顺序图。",

  };
  const baseUseCaseModel = modelForKind("usecase");
  assert.equal(baseUseCaseModel.diagramKind, "usecase");
  const contextualUseCase: DiagramModelSpec = {
    ...baseUseCaseModel,
    useCases: [
      {
        ...baseUseCaseModel.useCases[0]!,
        id: "uc_borrow",
        name: "借书",
        eventFlows: [
          {
            id: "flow_borrow_main",
            name: "借书主成功场景",
            flowType: "main",
            trigger: "管理员发起借书",
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "提交借书信息",
                systemResponse: "系统创建借阅记录",
              },
            ],
          },
        ],
      },
    ],
  };
  const prompts: string[] = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      prompts.push(prompt);
      if (prompts.length === 1) {
        await waitForAbortSignal(input.abortSignal);
        return;
      }
      assert.match(prompt, /精简重试/);
      assert.match(prompt, /diagramKind="analysis"/);
      assert.match(prompt, /sourceUseCaseId="uc_borrow"/);
      yield JSON.stringify({
        models: [
          {
            diagramKind: "analysis",
            modelId: "analysis:uc_borrow",
            sourceUseCaseId: "uc_borrow",
            sourceUseCaseName: "借书",
            title: "借书需求分析模型",
            summary: "根据借书事件流生成。",
            notes: [],
            participants: [
              { sourceElementIds: ["uc_borrow"], id: "actor_librarian", name: "图书管理员", participantType: "actor" },
              { sourceElementIds: ["uc_borrow"], id: "boundary_borrow", name: "借书界面", participantType: "boundary" },
            ],
            messages: [
              { sourceElementIds: ["uc_borrow"],
                id: "msg_borrow",
                type: "sync",
                sourceId: "actor_librarian",
                targetId: "boundary_borrow",
                name: "提交借书信息",
                parameters: [],
              },
            ],
            fragments: [],
          },
        ],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-analysis-compact-timeout-retry",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [useCaseRule],
    {
      models: [contextualUseCase],
      requirementModelTraceability: [],
    },
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS", "20", async () => {
    await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS", "500", async () => {
      await runStagePipeline(record, providerSettings, transport, renderClient);
    });
  });

  const completed = record.snapshot as RunSnapshot;
  assert.equal(prompts.length, 2);
  assert.equal(completed.status, "completed");
  assert.ok(
    completed.models.some(
      (model) => model.diagramKind === "analysis" && model.modelId === "analysis:uc_borrow",
    ),
  );
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.subtaskId === "analysis:uc_borrow" &&
        event.subtaskStatus === "repairing" &&
        event.message?.includes("精简单用例提示重试"),
    ),
  );
});

test("requirement analysis generation inherits run concurrency when no narrower limit is configured", async () => {
  const previousAnalysisConcurrency = process.env.UML_REQUIREMENT_ANALYSIS_CONCURRENCY;
  delete process.env.UML_REQUIREMENT_ANALYSIS_CONCURRENCY;
  await withTemporaryEnv("UML_LLM_RUN_CONCURRENCY", "3", async () => {
    try {
      const useCaseRule: RequirementRule = {
        id: "r-usecase",
        type: "functional" as const,
        text: "每个用例都有事件流。",

      };
      const baseUseCaseModel = modelForKind("usecase");
      assert.equal(baseUseCaseModel.diagramKind, "usecase");
      const useCases = ["uc_one", "uc_two", "uc_three"].map((id, index) => ({
        ...baseUseCaseModel.useCases[0]!,
        id,
        name: `用例${index + 1}`,
        eventFlows: [
          {
            id: `flow_${id}`,
            name: `用例${index + 1}主流程`,
            flowType: "main" as const,
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "提交请求",
                systemResponse: "返回结果",
              },
            ],
          },
        ],
      }));
      const contextualUseCase: DiagramModelSpec = {
        ...baseUseCaseModel,
        useCases,
      };
      let inFlight = 0;
      let maxInFlight = 0;
      const transport: LlmTransport = {
        async *streamChatCompletion(input: StreamChatCompletionInput) {
          const prompt = String(input.messages.at(-1)?.content ?? "");
          const useCaseId = useCaseIdFromSingleUseCasePrompt(prompt) ?? "uc_one";
          const useCaseName =
            useCases.find((useCase) => useCase.id === useCaseId)?.name ?? "用例";
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          try {
            await delay(30);
            yield JSON.stringify({
              models: [
                {
                  diagramKind: "analysis",
                  modelId: `analysis:${useCaseId}`,
                  sourceUseCaseId: useCaseId,
                  sourceUseCaseName: useCaseName,
                  title: `${useCaseName}需求分析顺序图`,
                  summary: "根据单个用例事件流生成。",
                  notes: [],
                  participants: [
                    { sourceElementIds: [useCaseId], id: "actor_user", name: "用户", participantType: "actor" },
                    { sourceElementIds: [useCaseId], id: "boundary_page", name: "页面", participantType: "boundary" },
                  ],
                  messages: [
                    { sourceElementIds: [useCaseId],
                      id: "msg_request",
                      type: "sync",
                      sourceId: "actor_user",
                      targetId: "boundary_page",
                      name: "提交请求",
                      parameters: [],
                    },
                  ],
                  fragments: [],
                },
              ],
              requirementModelTraceability: [],
            });
          } finally {
            inFlight -= 1;
          }
        },
      };
      const renderClient: RenderClient = async (artifact) => ({
        svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
        renderMeta: {
          engine: "test",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 1,
        },
      });
      const snapshot = createEmptySnapshot(
        "run-analysis-concurrency",
        LIBRARY_REQUIREMENT_TEXT,
        ["analysis"],
        [useCaseRule],
        {
          models: [contextualUseCase],
          requirementModelTraceability: [],
        },
      );
      const record: RunRecord = {
        snapshot,
        events: [],
        listeners: new Set(),
        terminal: false,
      };

      await runStagePipeline(record, providerSettings, transport, renderClient);

      assert.equal(maxInFlight, 3);
      assert.equal((record.snapshot as RunSnapshot).status, "completed");
    } finally {
      if (previousAnalysisConcurrency === undefined) {
        delete process.env.UML_REQUIREMENT_ANALYSIS_CONCURRENCY;
      } else {
        process.env.UML_REQUIREMENT_ANALYSIS_CONCURRENCY = previousAnalysisConcurrency;
      }
    }
  });
});

test("requirement analysis emits failed subtasks when one use case generation times out", async () => {
  const baseUseCaseModel = modelForKind("usecase");
  assert.equal(baseUseCaseModel.diagramKind, "usecase");
  const useCases = [
    { id: "uc_fast", name: "查看活动" },
    { id: "uc_hang", name: "邮件提醒" },
  ].map((item) => ({
    ...baseUseCaseModel.useCases[0]!,
    id: item.id,
    name: item.name,
    eventFlows: [
      {
        id: `flow_${item.id}`,
        name: `${item.name}主流程`,
        flowType: "main" as const,
        steps: [
          {
            order: 1,
            actor: "actor",
            action: "提交请求",
            systemResponse: "返回处理结果",
          },
        ],
      },
    ],
  }));
  const contextualUseCase: DiagramModelSpec = {
    ...baseUseCaseModel,
    useCases,
  };
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const useCaseId = prompt.includes("uc_hang")
        ? "uc_hang"
        : useCaseIdFromSingleUseCasePrompt(prompt) ?? "uc_fast";
      if (useCaseId === "uc_hang") {
        await delay(100);
      }
      const useCaseName =
        useCases.find((useCase) => useCase.id === useCaseId)?.name ?? "查看活动";
      yield JSON.stringify({
        models: [
          {
            diagramKind: "analysis",
            modelId: `analysis:${useCaseId}`,
            sourceUseCaseId: useCaseId,
            sourceUseCaseName: useCaseName,
            title: `${useCaseName}需求分析顺序图`,
            summary: "根据单个用例事件流生成。",
            notes: [],
            participants: [
              { sourceElementIds: [useCaseId], id: "actor_user", name: "用户", participantType: "actor" },
              { sourceElementIds: [useCaseId], id: "boundary_page", name: "页面", participantType: "boundary" },
            ],
            messages: [
              { sourceElementIds: [useCaseId],
                id: "msg_request",
                type: "sync",
                sourceId: "actor_user",
                targetId: "boundary_page",
                name: "提交请求",
                parameters: [],
              },
            ],
            fragments: [],
          },
        ],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-analysis-timeout",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [
      {
        id: "r-usecase",
        type: "functional" as const,
        text: "每个用例都有事件流。",

      },
    ],
    {
      models: [contextualUseCase],
      requirementModelTraceability: [],
    },
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS", "20", async () => {
    await assert.rejects(
      Promise.race([
        runStagePipeline(record, providerSettings, transport, renderClient),
        delay(1000).then(() => {
          throw new Error("analysis timeout test pipeline did not settle within 1000ms");
        }),
      ]),
      /需求分析模型必须为每个用例生成一个独立分析顺序图|超过 20ms 未完成/,
    );
  });

  const failedTimeoutEvents = record.events.filter(
    (event) =>
      event.type === "stage_progress" &&
      event.stage === "generate_models" &&
      event.subtaskId === "analysis:uc_hang" &&
      event.subtaskStatus === "failed" &&
      event.error?.code === "PLATFORM_PROVIDER_TIMEOUT" &&
      /超过 20ms 未完成/.test(
        `${event.message ?? ""} ${
          ((event.error.details as { providerMessage?: string } | undefined)
            ?.providerMessage ?? "")
        }`,
      ),
  );
  const fastSvgEvent = record.events.find(
    (event) =>
      event.type === "artifact_ready" &&
      event.stage === "render_svg" &&
      event.artifactKind === "svg" &&
      event.modelId === "analysis:uc_fast",
  );
  assert.ok(failedTimeoutEvents.length >= 1);
  assert.ok(fastSvgEvent);
  assert.equal(
    (record.snapshot as RunSnapshot).models.some(
      (model) => model.diagramKind === "analysis" && model.modelId === "analysis:uc_fast",
    ),
    true,
  );
});

test("requirement model task timeout resets while the model keeps streaming", async () => {
  const output = outputForKind("usecase");
  const chunks = output.match(/.{1,20}/g) ?? [output];
  const idleTimeoutMs = 250;
  // The complete stream exceeds the idle limit; each chunk resets it. Leave room for busy CI scheduling.
  assert.ok(chunks.length * 10 > idleTimeoutMs);
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      for (const chunk of chunks) {
        await delay(10);
        yield chunk;
      }
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-requirement-streaming-timeout",
    LIBRARY_REQUIREMENT_TEXT,
    ["usecase"],
    libraryRules,
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS", String(idleTimeoutMs), async () => {
    await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS", "10000", async () => {
      await runStagePipeline(record, providerSettings, transport, renderClient);
    });
  });

  assert.equal((record.snapshot as RunSnapshot).status, "completed");
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "artifact_ready" &&
        event.stage === "render_svg" &&
        event.diagramKind === "usecase",
    ),
  );
  assert.equal(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.subtaskStatus === "failed" &&
        /长时间无输出|最大运行时长/.test(event.message ?? ""),
    ),
    false,
  );
});

test("requirement model task hard max stops a continuously streaming model", async () => {
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      for (let index = 0; index < 20; index += 1) {
        await delay(5);
        yield "{}";
      }
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-requirement-hard-max-timeout",
    LIBRARY_REQUIREMENT_TEXT,
    ["usecase"],
    libraryRules,
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS", "50", async () => {
    await withTemporaryEnv("UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS", "30", async () => {
      await assert.rejects(
        () => runStagePipeline(record, providerSettings, transport, renderClient),
        /超过最大运行时长 30ms 未完成/,
      );
    });
  });

  await delay(120);
  const failedUseCase = record.events.find(
    (event) =>
      event.type === "stage_progress" &&
      event.stage === "generate_models" &&
      event.subtaskId === "usecase" &&
      event.subtaskStatus === "failed",
  );
  assert.match(failedUseCase?.message ?? "", /超过最大运行时长 30ms 未完成/);
});

test("requirement pipeline retries empty coverage five times without guessing associations", async () => {
  let traceabilityPromptCount = 0;
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      if (String(input.messages[0]?.content).includes("你是软件需求输入检查器")) {
        const units = JSON.parse(prompt) as Array<{ id: string }>;
        yield JSON.stringify({ units: units.map((unit) => ({ id: unit.id, category: "requirement" })) });
        return;
      }
      if (prompt.includes("抽取结构化需求规则")) {
        yield JSON.stringify({  rules: libraryRules });
        return;
      }
      if (prompt.includes("只修复来源映射")) {
        traceabilityPromptCount += 1;
        yield JSON.stringify({ models: [modelForKind("usecase")], requirementModelTraceability: [] });
        return;
      }
      yield JSON.stringify({
        models: [modelForKind("usecase")],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const record: RunRecord = {
    snapshot: createEmptySnapshot(
      "run-autofill-empty-traceability",
      LIBRARY_REQUIREMENT_TEXT,
      ["usecase"],
      [],
    ),
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await assert.rejects(runStagePipeline(record, providerSettings, transport, renderClient), /requirementModelTraceability.*共享 5 次/);

  const completed = record.snapshot as RunSnapshot;
  assert.notEqual(completed.status, "completed");
  assert.equal(traceabilityPromptCount, 0, "source fields share model repairs; no independent coverage-repair calls");
  assert.equal(completed.requirementModelTraceability.length, 0);
  assert.equal(
    completed.requirementTrace.some(
      (entry) =>
        entry.kind === "parsed_model" &&
        Boolean(
          (entry.parsedData as { autoFilledRequirementTraceability?: boolean } | undefined)
            ?.autoFilledRequirementTraceability,
        ),
    ), false,
  );
});

test("requirement pipeline repairs complete provenance in the original model conversation", async () => {
  let traceabilityPromptCount = 0;
  const repairedTargets = [
    { elementId: "actor_librarian", elementKind: "actor", label: "图书管理员" },
    { elementId: "uc_borrow", elementKind: "usecase", label: "借书" },
    {
      elementId: "rel_librarian_borrow",
      elementKind: "relationship",
      label: "图书管理员 -> 借书",
    },
  ];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      if (prompt.includes("请基于本对话中上一版完整模型")) {
        traceabilityPromptCount += 1;
        assert.deepEqual(input.messages.map(message => message.role), ["system", "user", "assistant", "user"]);
        assert.match(prompt, /完整模型/);
        yield JSON.stringify({
          models: [modelForKind("usecase")],
          requirementModelTraceability: repairedTargets.map((target) => ({
            ruleId: "r1",
            target: {
              modelId: "usecase",
              diagramKind: "usecase",
              ...target,
            },
          })),
        });
        return;
      }
      yield JSON.stringify({
        models: [modelForKind("usecase")],
        requirementModelTraceability: [{ ruleId: "r1", target: { diagramKind: "usecase", elementId: "uc_borrow", elementKind: "usecase", label: "借书" } }],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const record: RunRecord = {
    snapshot: createEmptySnapshot(
      "run-nullable-traceability-repair",
      LIBRARY_REQUIREMENT_TEXT,
      ["usecase"],
      [libraryRules[0]!],
    ),
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  assert.equal(completed.status, "completed");
  assert.equal(completed.diagramErrors.usecase, undefined);
  assert.equal(traceabilityPromptCount, 1);
  assert.equal(completed.requirementModelTraceability.length, 3);
  assert.ok(
    completed.requirementModelTraceability.every(
      (entry) =>
        entry.mappingSource === "llm" && entry.target.diagramKind === "usecase" &&
        entry.target.modelId === "usecase",
    ),
  );
  assert.equal(
    completed.requirementTrace.some((entry) =>
      Boolean(
        (entry.parsedData as { autoFilledRequirementTraceability?: boolean } | undefined)
          ?.autoFilledRequirementTraceability,
      ),
    ),
    false,
  );
});

test("obsolete source diagram aliases are rejected instead of upgraded", async () => {
  const rules = [libraryRules[0]!];
  const snapshot = createEmptySnapshot("invalid-references", LIBRARY_REQUIREMENT_TEXT, ["usecase"], rules);
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  const invalidReferences = [{ ruleId: "r1", target: { diagramKind: "use-case-diagram", elementId: "uc_borrow", elementKind: "usecase", label: "借书" } }];
  const transport: LlmTransport = { async *streamChatCompletion() {
    yield JSON.stringify({ models: [modelForKind("usecase")], requirementModelTraceability: invalidReferences });
  } };
  await assert.rejects(generateModelsWithRepair(record, providerSettings, transport, rules, snapshot.requirementBaseline!, ["usecase"]));
  assert.deepEqual(snapshot.requirementModelTraceability, []);
  assert.equal(
    snapshot.requirementTrace.some((entry) =>
      (JSON.stringify(entry.parsedData) ?? "").includes("autoFilledRequirementTraceability"),
    ),
    false,
  );
});

test("requirement pipeline rejects empty rule extraction before model generation", async () => {
  let traceabilityPromptCount = 0;
  const emptyDeploymentModel: DiagramModelSpec = {
    diagramKind: "deployment",
    title: "空部署模型",
    summary: "没有可映射的业务元素。",
    notes: [],
    nodes: [],
    databases: [],
    components: [],
    externalSystems: [],
    artifacts: [],
    relationships: [],
  };
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      if (String(input.messages[0]?.content).includes("你是软件需求输入检查器")) {
        const units = JSON.parse(prompt) as Array<{ id: string }>;
        yield JSON.stringify({ units: units.map((unit) => ({ id: unit.id, category: "requirement" })) });
        return;
      }
      if (prompt.includes("抽取结构化需求规则")) {
        yield JSON.stringify({  rules: [] });
        return;
      }
      if (prompt.includes("补充元素级可追踪关系") || prompt.includes("修复需求模型元素级可追踪关系")) {
        traceabilityPromptCount += 1;
        yield JSON.stringify({ requirementModelTraceability: [] });
        return;
      }
      yield JSON.stringify({
        models: [emptyDeploymentModel],
        requirementModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const record: RunRecord = {
    snapshot: createEmptySnapshot(
      "run-no-mappable-elements-traceability-skip",
      "读者可以查询图书并提交借阅申请。",
      ["deployment"],
      [],
    ),
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await assert.rejects(
    () => runStagePipeline(record, providerSettings, transport, renderClient),
    (error) => getRunError(error)?.code === "RUN_REQUIREMENT_RULES_EMPTY",
  );
  assert.equal(traceabilityPromptCount, 0);
  assert.equal(record.snapshot.models.length, 0);
});

test("design pipeline renders a completed use case sequence before slower sequences finish", async () => {
  const useCaseModel: DiagramModelSpec = {
    diagramKind: "usecase",
    title: "会议室预约用例模型",
    summary: "两个独立用例。",
    notes: [],
    actors: [],
    useCases: [
      {
        id: "uc_fast",
        name: "查看空闲会议室",
        goal: "查看会议室空闲时段",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
        eventFlows: [
          {
            id: "flow_fast",
            name: "查看主流程",
            flowType: "main",
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "选择日期",
                systemResponse: "返回空闲会议室",
              },
            ],
          },
        ],
      },
      {
        id: "uc_slow",
        name: "提交预约申请",
        goal: "提交会议室预约",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
        eventFlows: [
          {
            id: "flow_slow",
            name: "预约主流程",
            flowType: "main",
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "填写预约信息",
                systemResponse: "保存预约申请",
              },
            ],
          },
        ],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const rules: RequirementRule[] = [
    {
      id: "r-fast",
      type: "functional" as const,
      text: "员工可以查看空闲会议室。",

    },
    {
      id: "r-slow",
      type: "functional" as const,
      text: "员工可以提交预约申请。",

    },
  ];
  const requirementSnapshot = createEmptySnapshot(
    "run-design-sequence-requirements",
    "会议室预约系统",
    ["usecase"],
    rules,
    {
      models: [useCaseModel],
      requirementModelTraceability: [
        {
          ruleId: "r-fast",
          target: {
            diagramKind: "usecase",
            elementId: "uc_fast",
            elementKind: "usecase",
            label: "查看空闲会议室",
          },
        },
        {
          ruleId: "r-slow",
          target: {
            diagramKind: "usecase",
            elementId: "uc_slow",
            elementKind: "usecase",
            label: "提交预约申请",
          },
        },
      ],
    },
  );
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const useCaseId = prompt.includes("uc_slow") ? "uc_slow" : "uc_fast";
      const useCaseName =
        useCaseId === "uc_slow" ? "提交预约申请" : "查看空闲会议室";
      if (useCaseId === "uc_slow") {
        await delay(40);
      }
      const modelId = `sequence:${useCaseId}`;
      yield JSON.stringify({
        models: [
          {
            diagramKind: "sequence",
            modelId,
            sourceUseCaseId: useCaseId,
            sourceUseCaseName: useCaseName,
            title: `${useCaseName}用例实现设计`,
            summary: `${useCaseName}的对象交互。`,
            notes: [],
            participants: [
              { id: "actor_employee", name: "员工", participantType: "actor" },
              { id: "boundary_page", name: "预约页面", participantType: "boundary" },
            ],
            messages: [
              {
                id: "msg_submit",
                type: "sync",
                sourceId: "actor_employee",
                targetId: "boundary_page",
                name: useCaseName,
                parameters: [],
              },
            ],
            fragments: [],
          },
        ],
        designModelTraceability: [
          ...[
            ["actor_employee", "participant", "员工"],
            ["boundary_page", "participant", "预约页面"],
            ["msg_submit", "message", useCaseName],
          ].map(([elementId, elementKind, label]) => ({
            source: {
              modelId,
              diagramKind: "sequence",
              elementId,
              elementKind,
              label,
            },
            targets: [
              {
                diagramKind: "usecase",
                elementId: useCaseId,
                elementKind: "usecase",
                label: useCaseName,
              },
            ],
          })),
        ],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptyDesignSnapshot("run-design-sequence-pipeline", {
    selectedDiagrams: ["sequence"],
    requirementBaseline: requirementSnapshot.requirementBaseline!,
    requirementModels: [useCaseModel],
    requirementModelTraceability: requirementSnapshot.requirementModelTraceability,
  });
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runDesignStagePipeline(record, providerSettings, transport, renderClient);

  const fastSvgIndex = record.events.findIndex(
    (event) =>
      event.type === "artifact_ready" &&
      event.stage === "render_svg" &&
      event.artifactKind === "svg" &&
      event.modelId === "sequence:uc_fast",
  );
  const slowModelIndex = record.events.findIndex(
    (event) =>
      event.type === "artifact_ready" &&
      event.stage === "generate_design_sequence" &&
      event.artifactKind === "model" &&
      event.modelId === "sequence:uc_slow",
  );
  assert.notEqual(fastSvgIndex, -1);
  assert.notEqual(slowModelIndex, -1);
  assert.ok(fastSvgIndex < slowModelIndex);
  const sequenceFinishedIndex = record.events.findIndex((event) => event.type === "stage_finished" && event.stage === "generate_design_sequence");
  assert.ok(sequenceFinishedIndex > slowModelIndex);
  assert.equal((record.snapshot as DesignRunSnapshot).status, "completed");
});

test("design sequence rejects completion but keeps partial artifacts when one use case generation times out", async () => {
  await withTemporaryEnv("UML_DESIGN_MODEL_TASK_TIMEOUT_MS", "20", async () => {
    const useCaseModel: DiagramModelSpec = {
      diagramKind: "usecase",
      title: "活动日历用例模型",
      summary: "两个独立用例。",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc_fast",
          name: "查看活动",
          goal: "查看活动日历",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
          eventFlows: [
            {
              id: "flow_fast",
              name: "查看主流程",
              flowType: "main",
              steps: [{ order: 1, actor: "actor", action: "打开日历", systemResponse: "显示活动" }],
            },
          ],
        },
        {
          id: "uc_slow",
          name: "申请注册",
          goal: "提交注册申请",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
          eventFlows: [
            {
              id: "flow_slow",
              name: "注册主流程",
              flowType: "main",
              steps: [{ order: 1, actor: "actor", action: "填写资料", systemResponse: "创建申请" }],
            },
          ],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    };
    const transport: LlmTransport = {
      async *streamChatCompletion(input: StreamChatCompletionInput) {
        const prompt = String(input.messages.at(-1)?.content ?? "");
        const useCaseId = prompt.includes("uc_slow") ? "uc_slow" : "uc_fast";
        const useCaseName = useCaseId === "uc_slow" ? "申请注册" : "查看活动";
        if (useCaseId === "uc_slow") {
          await delay(100);
        }
        const modelId = `sequence:${useCaseId}`;
        yield JSON.stringify({
          models: [
            {
              diagramKind: "sequence",
              modelId,
              sourceUseCaseId: useCaseId,
              sourceUseCaseName: useCaseName,
              title: `${useCaseName}用例实现设计`,
              summary: `${useCaseName}对象交互。`,
              notes: [],
              participants: [
                { id: "actor_user", name: "用户", participantType: "actor" },
                { id: "boundary_page", name: "页面", participantType: "boundary" },
              ],
              messages: [
                {
                  id: "msg_request",
                  type: "sync",
                  sourceId: "actor_user",
                  targetId: "boundary_page",
                  name: useCaseName,
                  parameters: [],
                },
              ],
              fragments: [],
            },
          ],
          designModelTraceability: [
                ...["actor_user", "boundary_page"].map(elementId => ({
                  source: { modelId, diagramKind: "sequence", elementId, elementKind: "participant", label: elementId },
                  targets: [{ diagramKind: "usecase", elementId: useCaseId, elementKind: "usecase", label: useCaseName }],
                })),
            {
              source: {
                modelId,
                diagramKind: "sequence",
                elementId: "msg_request",
                elementKind: "message",
                label: useCaseName,
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: useCaseId,
                  elementKind: "usecase",
                  label: useCaseName,
                },
              ],
            },
          ],
        });
      },
    };
    const renderClient: RenderClient = async (artifact) => ({
      svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
      renderMeta: {
        engine: "test",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 1,
      },
    });
    const requirementSnapshot = createEmptySnapshot(
      "run-design-sequence-timeout-requirements",
      "公共活动日历系统",
      ["usecase"],
      [],
      {
        models: [useCaseModel],
        requirementModelTraceability: [],
      },
    );
    const snapshot = createEmptyDesignSnapshot("run-design-sequence-timeout", {
      selectedDiagrams: ["sequence"],
      requirementBaseline: requirementSnapshot.requirementBaseline!,
      requirementModels: [useCaseModel],
      requirementModelTraceability: [],
    });
    const record: RunRecord = {
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: false,
    };

    await assert.rejects(() => runDesignStagePipeline(record, providerSettings, transport, renderClient), error => getRunError(error)?.code === "PLATFORM_PROVIDER_TIMEOUT");

    const fastSvg = record.events.find(
      (event) =>
        event.type === "artifact_ready" &&
        event.stage === "render_svg" &&
        event.modelId === "sequence:uc_fast",
    );
    const failedSlow = record.events.find(
      (event) =>
        event.type === "stage_progress" &&
        event.stage === "generate_design_sequence" &&
        event.modelId === "sequence:uc_slow" &&
        event.subtaskStatus === "failed",
    );
    assert.ok(fastSvg);
    assert.ok(failedSlow);
    assert.notEqual((record.snapshot as DesignRunSnapshot).status, "completed");
    assert.equal(record.events.some((event) => event.type === "completed"), false);
    assert.deepEqual(record.snapshot.outputManifest?.filter(item => item.kind === "model").map(item => item.id), ["sequence:uc_fast"]);
    assert.equal(
      (record.snapshot as DesignRunSnapshot).diagramErrors["sequence:uc_slow"]
        ?.error.code,
      "PLATFORM_PROVIDER_TIMEOUT",
    );
    assert.equal(failedSlow.error?.code, "PLATFORM_PROVIDER_TIMEOUT");
    assert.match(
      `${
        ((failedSlow.error.details as { providerMessage?: string } | undefined)
          ?.providerMessage ?? "")
      }`,
      /超过 20ms 未完成/,
    );
  });
});

test("design sequence aborts the LLM stream when the run is cancelled", async () => {
  await withTemporaryEnv("UML_DESIGN_MODEL_TASK_TIMEOUT_MS", "5000", async () => {
    await withTemporaryEnv("UML_DESIGN_MODEL_TASK_MAX_RUNTIME_MS", "5000", async () => {
      const useCaseModel: DiagramModelSpec = {
        diagramKind: "usecase",
        title: "图书检索用例模型",
        summary: "用户检索图书。",
        notes: [],
        actors: [],
        useCases: [
          {
            id: "uc_search",
            name: "检索图书",
            goal: "查找可借图书",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
            eventFlows: [
              {
                id: "flow_search",
                name: "检索主流程",
                flowType: "main",
                steps: [
                  { order: 1, actor: "actor", action: "输入关键字", systemResponse: "返回结果" },
                ],
              },
            ],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      };
      const requirementSnapshot = createEmptySnapshot(
        "run-design-sequence-cancel-requirements",
        "图书检索系统",
        ["usecase"],
        [],
        {
          models: [useCaseModel],
          requirementModelTraceability: [],
        },
      );
      const snapshot = createEmptyDesignSnapshot("run-design-sequence-cancel", {
        selectedDiagrams: ["sequence"],
        requirementBaseline: requirementSnapshot.requirementBaseline!,
        requirementModels: [useCaseModel],
        requirementModelTraceability: [],
      });
      const record: RunRecord = {
        snapshot,
        events: [],
        listeners: new Set(),
        terminal: false,
      };
      let abortObserved = false;
      const transport: LlmTransport = {
        async *streamChatCompletion(input: StreamChatCompletionInput) {
          snapshot.status = "cancelled";
          await new Promise<void>((resolve, reject) => {
            const signal = input.abortSignal;
            const guard = setTimeout(() => {
              reject(new Error("test transport did not receive abort after cancellation"));
            }, 1500);
            const finish = () => {
              clearTimeout(guard);
              abortObserved = true;
              resolve();
            };
            if (signal?.aborted) {
              finish();
              return;
            }
            signal?.addEventListener("abort", finish, { once: true });
          });
        },
      };
      const renderClient: RenderClient = async (artifact) => ({
        svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
        renderMeta: {
          engine: "test",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 1,
        },
      });

      await assert.rejects(
        () => runDesignStagePipeline(record, providerSettings, transport, renderClient),
        RunCancelledError,
      );
      assert.equal(abortObserved, true);
    });
  });
});

test("design sequence retries when generated output is too similar to requirement analysis", async () => {
  const useCaseModel: DiagramModelSpec = {
    diagramKind: "usecase",
    title: "报名用例模型",
    summary: "用户申请报名。",
    notes: [],
    actors: [],
    useCases: [
      {
        id: "uc_apply",
        name: "申请报名",
        goal: "提交活动报名申请",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
        eventFlows: [
          {
            id: "flow_apply",
            name: "申请报名主流程",
            flowType: "main",
            steps: [
              { order: 1, actor: "actor", actorAction: "提交报名申请", systemAction: "记录申请" },
            ],
          },
        ],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const analysisModel: DiagramModelSpec = {
    diagramKind: "analysis",
    modelId: "analysis:uc_apply",
    sourceUseCaseId: "uc_apply",
    sourceUseCaseName: "申请报名",
    title: "申请报名需求分析模型",
    summary: "需求阶段交互。",
    notes: [],
    participants: [
      { sourceElementIds: ["uc_apply"], id: "actor_user", name: "用户", participantType: "actor" },
      { sourceElementIds: ["uc_apply"], id: "boundary_page", name: "报名页面", participantType: "boundary" },
    ],
    messages: [
      { sourceElementIds: ["uc_apply"],
        id: "msg_apply",
        type: "sync",
        sourceId: "actor_user",
        targetId: "boundary_page",
        name: "提交报名申请",
        parameters: [],
      },
    ],
    fragments: [],
  };
  let calls = 0;
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      calls += 1;
      const common = {
        diagramKind: "sequence",
        modelId: "sequence:uc_apply",
        sourceUseCaseId: "uc_apply",
        sourceUseCaseName: "申请报名",
        title: "申请报名用例实现设计",
        summary: "申请报名对象交互。",
        notes: [],
        fragments: [],
      };
      yield JSON.stringify({
        models: [
          calls === 1
            ? {
                ...common,
                participants: [
                  { id: "actor_user", name: "用户", participantType: "actor" },
                  { id: "boundary_page", name: "报名页面", participantType: "boundary" },
                ],
                messages: [
                  {
                    id: "msg_apply",
                    type: "sync",
                    sourceId: "actor_user",
                    targetId: "boundary_page",
                    name: "提交报名申请",
                    parameters: [],
                  },
                ],
              }
            : {
                ...common,
                participants: [
                  { id: "actor_user", name: "用户", participantType: "actor" },
                  { id: "boundary_page", name: "报名页面", participantType: "boundary" },
                  { id: "service_registration", name: "报名服务", participantType: "service" },
                ],
                messages: [
                  {
                    id: "msg_apply",
                    type: "sync",
                    sourceId: "boundary_page",
                    targetId: "service_registration",
                    name: "applyForRegistration",
                    parameters: ["userId", "eventId"],
                  },
                ],
              },
        ],
        designModelTraceability: ["actor_user", "boundary_page", "msg_apply", ...(calls > 1 ? ["service_registration"] : [])].map(elementId => ({
          source: { modelId: "sequence:uc_apply", diagramKind: "sequence", elementId, elementKind: elementId === "msg_apply" ? "message" : "participant", label: elementId },
          targets: [{ diagramKind: "usecase", elementId: "uc_apply", elementKind: "usecase", label: "申请报名" }],
        })),
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const requirementSnapshot = createEmptySnapshot(
    "run-design-sequence-similar-requirements",
    "公共活动日历系统",
    ["usecase", "analysis"],
    [],
    {
      models: [useCaseModel, analysisModel],
      requirementModelTraceability: [],
    },
  );
  const snapshot = createEmptyDesignSnapshot("run-design-sequence-similar", {
    selectedDiagrams: ["sequence"],
    requirementBaseline: requirementSnapshot.requirementBaseline!,
    requirementModels: [useCaseModel, analysisModel],
    requirementModelTraceability: [],
  });
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runDesignStagePipeline(record, providerSettings, transport, renderClient);

  assert.equal(calls, 2);
  assert.equal(snapshot.status, "completed");
  const sequence = snapshot.models.find((model) => model.diagramKind === "sequence");
  assert.equal(sequence?.diagramKind, "sequence");
  if (sequence?.diagramKind === "sequence") {
    assert.ok(sequence.participants.some((participant) => participant.participantType === "service"));
  }
});

test("design pipeline keeps provider timeout as the terminal selected downstream failure", async () => {
  await withTemporaryEnv("UML_DESIGN_MODEL_TASK_TIMEOUT_MS", "20", async () => {
    const useCaseModel = modelForKind("usecase");
    const classModel = modelForKind("class");
    const existingSequenceModel: DesignDiagramModelSpec = {
      diagramKind: "sequence",
      modelId: "sequence:uc_borrow",
      sourceUseCaseId: "uc_borrow",
      sourceUseCaseName: "借书",
      title: "借书用例实现设计",
      summary: "已有用例实现设计。",
      notes: [],
      participants: [
        { id: "actor_librarian", name: "图书管理员", participantType: "actor" },
        { id: "boundary_page", name: "借书界面", participantType: "boundary" },
      ],
      messages: [
        {
          id: "msg_borrow",
          type: "sync",
          sourceId: "actor_librarian",
          targetId: "boundary_page",
          name: "提交借书",
          parameters: [],
        },
      ],
      fragments: [],
    };
    const transport: LlmTransport = {
      async *streamChatCompletion() {
        await delay(100);
        yield JSON.stringify({ models: [], designModelTraceability: [] });
      },
    };
    const renderClient: RenderClient = async (artifact) => ({
      svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
      renderMeta: {
        engine: "test",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 1,
      },
    });
    const requirementSnapshot = createEmptySnapshot(
      "run-design-downstream-timeout-requirements",
      LIBRARY_REQUIREMENT_TEXT,
      ["usecase", "class"],
      libraryRules,
      {
        models: [useCaseModel, classModel],
        requirementModelTraceability: [],
      },
    );
    const snapshot = createEmptyDesignSnapshot("run-design-downstream-timeout", {
      selectedDiagrams: ["class", "table"],
      requirementBaseline: requirementSnapshot.requirementBaseline!,
      requirementModels: [useCaseModel, classModel],
      requirementModelTraceability: [],
      existingDesignModels: [existingSequenceModel],
    });
    const record: RunRecord = {
      snapshot,
      events: [],
      listeners: new Set(),
      terminal: false,
    };

    await assert.rejects(
      () => runDesignStagePipeline(record, providerSettings, transport, renderClient),
      (error) => {
        const runError = getRunError(error);
        assert.equal(runError?.code, "PLATFORM_PROVIDER_TIMEOUT");
        assert.match(
          `${(runError?.details as { providerMessage?: string } | undefined)?.providerMessage ?? ""}`,
          /超过 20ms 未完成/,
        );
        return true;
      },
    );

    assert.equal((record.snapshot as DesignRunSnapshot).status, "running");
    assert.equal((record.snapshot as DesignRunSnapshot).diagramErrors.class?.stage, "generate_design_models");
    assert.equal(
      (record.snapshot as DesignRunSnapshot).diagramErrors.table?.error.code,
      "RUN_DEPENDENCY_MISSING",
    );
    const completedEvent = record.events.find((event) => event.type === "completed");
    const failedClass = record.events.find(
      (event) =>
        event.type === "stage_progress" &&
        event.stage === "generate_design_models" &&
        event.subtaskId === "class" &&
        event.subtaskStatus === "failed",
    );
    assert.equal(completedEvent, undefined);
    assert.ok(failedClass);
    assert.equal(failedClass.error?.code, "PLATFORM_PROVIDER_TIMEOUT");
    assert.match(
      `${
        ((failedClass.error.details as { providerMessage?: string } | undefined)
          ?.providerMessage ?? "")
      }`,
      /超过 20ms 未完成/,
    );
  });
});

test("design pipeline rejects downstream output without sources instead of auto-filling coverage", async () => {
  const useCaseModel = modelForKind("usecase");
  const prototypeModel: DiagramModelSpec = {
    diagramKind: "prototype",
    title: "活动日历原型界面关系",
    summary: "活动列表和编辑页面。",
    notes: [],
    nodes: [
      {
        id: "screen_calendar",
        name: "公共日历页",
        nodeType: "screen",
        sourceUseCaseIds: ["uc_borrow"],
        sourceRequirementIds: ["r1"],
      },
      {
        id: "screen_edit",
        name: "活动编辑页",
        nodeType: "screen",
        sourceUseCaseIds: ["uc_borrow"],
        sourceRequirementIds: ["r1"],
      },
    ],
    relationships: [
      {
        id: "nav_calendar_edit",
        type: "opens",
        sourceId: "screen_calendar",
        targetId: "screen_edit",
        label: "打开编辑",
      },
    ],
  };
  const existingSequenceModel: DesignDiagramModelSpec = {
    diagramKind: "sequence",
    modelId: "sequence:uc_borrow",
    sourceUseCaseId: "uc_borrow",
    sourceUseCaseName: "维护活动",
    title: "维护活动用例实现设计",
    summary: "已有用例实现设计。",
    notes: [],
    participants: [
      { id: "actor_user", name: "注册用户", participantType: "actor" },
      { id: "boundary_calendar", name: "公共日历页", participantType: "boundary" },
    ],
    messages: [
      {
        id: "msg_open_edit",
        type: "sync",
        sourceId: "actor_user",
        targetId: "boundary_calendar",
        name: "打开编辑",
        parameters: [],
      },
    ],
    fragments: [],
  };
  let llmCalls = 0;
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      llmCalls += 1;
      yield JSON.stringify({
        models: [
          {
            diagramKind: "navigation",
            title: "界面关系图",
            summary: "公共日历和活动编辑的界面跳转。",
            notes: [],
            nodes: [
              {
                id: "act_calendar",
                nodeType: "screen",
                name: "查看公共日历",
              },
              {
                id: "act_edit",
                nodeType: "screen",
                name: "编辑活动",
              },
            ],
            relationships: [
              {
                id: "flow_open_edit",
                type: "navigation",
                sourceId: "act_calendar",
                targetId: "act_edit",
                condition: "打开编辑",
              },
            ],
          },
        ],
        designModelTraceability: [],
      });
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const requirementSnapshot = createEmptySnapshot(
    "run-design-empty-traceability-requirements",
    LIBRARY_REQUIREMENT_TEXT,
    ["usecase", "prototype"],
    libraryRules,
    {
      models: [useCaseModel, prototypeModel],
      requirementModelTraceability: [],
    },
  );
  const snapshot = createEmptyDesignSnapshot("run-design-empty-traceability", {
    selectedDiagrams: ["navigation"],
    requirementBaseline: requirementSnapshot.requirementBaseline!,
    requirementModels: [useCaseModel, prototypeModel],
    requirementModelTraceability: [],
    existingDesignModels: [existingSequenceModel],
  });
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await assert.rejects(runDesignStagePipeline(record, providerSettings, transport, renderClient), /designModelTraceability.*共享 5 次/);

  const designSnapshot = record.snapshot as DesignRunSnapshot;
  assert.equal(llmCalls, 6);
  assert.notEqual(designSnapshot.status, "completed");
  assert.ok(!designSnapshot.models.some(model => model.diagramKind === "navigation"));
  assert.deepEqual(designSnapshot.designModelTraceability, []);
  assert.ok(!designSnapshot.svgArtifacts.some(artifact => artifact.diagramKind === "navigation"));
});

test("design pipeline records downstream dependency errors per selected diagram", async () => {
  const deploymentModel = modelForKind("deployment");
  const requirementSnapshot = createEmptySnapshot(
    "run-design-dependency-errors-requirements",
    LIBRARY_REQUIREMENT_TEXT,
    ["deployment"],
    libraryRules,
    {
      models: [deploymentModel],
      requirementModelTraceability: [],
    },
  );
  const snapshot = createEmptyDesignSnapshot("run-design-dependency-errors", {
    selectedDiagrams: ["component", "deployment"],
    requestedDiagrams: ["component", "deployment"],
    requirementBaseline: requirementSnapshot.requirementBaseline!,
    requirementModels: [deploymentModel],
    requirementModelTraceability: [],
    existingDesignModels: [],
  });
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };
  const transport: LlmTransport = {
    async *streamChatCompletion() {
      throw new Error("LLM should not be called when design dependencies are missing");
    },
  };
  const renderClient: RenderClient = async () => {
    throw new Error("Render should not be called when design dependencies are missing");
  };

  await assert.rejects(
    () => runDesignStagePipeline(record, providerSettings, transport, renderClient),
    /设计模型生成未全部完成/,
  );

  const designSnapshot = record.snapshot as DesignRunSnapshot;
  assert.equal(
    designSnapshot.diagramErrors.component?.error.code,
    "RUN_DEPENDENCY_MISSING",
  );
  assert.match(
    designSnapshot.diagramErrors.component?.error.message ?? "",
    /缺少设计类图，无法生成组件/,
  );
  assert.equal(
    designSnapshot.diagramErrors.deployment?.error.code,
    "RUN_DEPENDENCY_MISSING",
  );
  assert.match(
    designSnapshot.diagramErrors.deployment?.error.message ?? "",
    /组件（构件）关系未能完成，无法生成部署设计/,
  );
  const failedSubtasks = record.events.filter(
    (event) =>
      event.type === "stage_progress" &&
      event.stage === "generate_design_models" &&
      event.subtaskStatus === "failed",
  );
  assert.deepEqual(
    failedSubtasks.map((event) => event.subtaskId),
    ["component", "deployment"],
  );
});

test("design sequence generation inherits run concurrency when no narrower limit is configured", async () => {
  const previousSequenceConcurrency = process.env.UML_DESIGN_SEQUENCE_CONCURRENCY;
  delete process.env.UML_DESIGN_SEQUENCE_CONCURRENCY;
  await withTemporaryEnv("UML_LLM_RUN_CONCURRENCY", "3", async () => {
    try {
      const useCaseModel: DiagramModelSpec = {
        diagramKind: "usecase",
        title: "活动日历用例模型",
        summary: "三个独立用例。",
        notes: [],
        actors: [],
        useCases: ["uc_one", "uc_two", "uc_three"].map((id, index) => ({
          id,
          name: `用例${index + 1}`,
          goal: "完成业务目标",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
          eventFlows: [
            {
              id: `flow_${id}`,
              name: `用例${index + 1}主流程`,
              flowType: "main",
              steps: [
                {
                  order: 1,
                  actor: "actor",
                  action: "提交请求",
                  systemResponse: "返回结果",
                },
              ],
            },
          ],
        })),
        systemBoundaries: [],
        relationships: [],
      };
      assert.equal(useCaseModel.diagramKind, "usecase");
      let inFlight = 0;
      let maxInFlight = 0;
      const transport: LlmTransport = {
        async *streamChatCompletion(input: StreamChatCompletionInput) {
          const prompt = String(input.messages.at(-1)?.content ?? "");
          const useCaseId =
            ["uc_one", "uc_two", "uc_three"].find((id) => prompt.includes(id)) ??
            "uc_one";
          const useCaseName =
            useCaseModel.useCases.find((useCase) => useCase.id === useCaseId)?.name ??
            "用例";
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          try {
            await delay(30);
            const modelId = `sequence:${useCaseId}`;
            yield JSON.stringify({
              models: [
                {
                  diagramKind: "sequence",
                  modelId,
                  sourceUseCaseId: useCaseId,
                  sourceUseCaseName: useCaseName,
                  title: `${useCaseName}用例实现设计`,
                  summary: `${useCaseName}的对象交互。`,
                  notes: [],
                  participants: [
                    { id: "actor_user", name: "用户", participantType: "actor" },
                    { id: "boundary_page", name: "页面", participantType: "boundary" },
                  ],
                  messages: [
                    {
                      id: "msg_request",
                      type: "sync",
                      sourceId: "actor_user",
                      targetId: "boundary_page",
                      name: "提交请求",
                      parameters: [],
                    },
                  ],
                  fragments: [],
                },
              ],
              designModelTraceability: [
                ...["actor_user", "boundary_page"].map(elementId => ({
                  source: { modelId, diagramKind: "sequence", elementId, elementKind: "participant", label: elementId },
                  targets: [{ diagramKind: "usecase", elementId: useCaseId, elementKind: "usecase", label: useCaseName }],
                })),
                {
                  source: {
                    modelId,
                    diagramKind: "sequence",
                    elementId: "msg_request",
                    elementKind: "message",
                    label: "提交请求",
                  },
                  targets: [
                    {
                      diagramKind: "usecase",
                      elementId: useCaseId,
                      elementKind: "usecase",
                      label: useCaseName,
                    },
                  ],
                },
              ],
            });
          } finally {
            inFlight -= 1;
          }
        },
      };
      const renderClient: RenderClient = async (artifact) => ({
        svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
        renderMeta: {
          engine: "test",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 1,
        },
      });
      const requirementSnapshot = createEmptySnapshot(
        "run-design-sequence-concurrency-requirements",
        "活动日历系统",
        ["usecase"],
        [],
        {
          models: [useCaseModel],
          requirementModelTraceability: [],
        },
      );
      const snapshot = createEmptyDesignSnapshot("run-design-sequence-concurrency", {
        selectedDiagrams: ["sequence"],
        requirementBaseline: requirementSnapshot.requirementBaseline!,
        requirementModels: [useCaseModel],
        requirementModelTraceability: [],
      });
      const record: RunRecord = {
        snapshot,
        events: [],
        listeners: new Set(),
        terminal: false,
      };

      await runDesignStagePipeline(record, providerSettings, transport, renderClient);

      assert.equal(maxInFlight, 3);
      assert.equal((record.snapshot as DesignRunSnapshot).status, "completed");
    } finally {
      if (previousSequenceConcurrency === undefined) {
        delete process.env.UML_DESIGN_SEQUENCE_CONCURRENCY;
      } else {
        process.env.UML_DESIGN_SEQUENCE_CONCURRENCY = previousSequenceConcurrency;
      }
    }
  });
});

for (const persistentFailure of [false, true]) test(`requirement analysis records exact retry targets when provider failure persists=${persistentFailure}`, async () => {
  const useCaseRule: RequirementRule = {
    id: "r-usecase",
    type: "functional" as const,
    text: "每个用例都应由事件流生成独立需求分析顺序图。",

  };
  const baseUseCaseModel = modelForKind("usecase");
  assert.equal(baseUseCaseModel.diagramKind, "usecase");
  const contextualUseCase: DiagramModelSpec = {
    ...baseUseCaseModel,
    actors: [...baseUseCaseModel.actors, { id: "actor_reader", name: "读者", actorType: "human", responsibilities: ["检索图书"] }],
    relationships: [...baseUseCaseModel.relationships, { id: "rel_reader_search", type: "association", sourceId: "actor_reader", targetId: "uc_search" }],
    useCases: [
      {
        ...baseUseCaseModel.useCases[0]!,
        id: "uc_borrow",
        name: "借书",
        eventFlows: [
          {
            id: "flow_borrow_main",
            name: "借书主成功场景",
            flowType: "main",
            trigger: "管理员发起借书",
            steps: [
              {
                order: 1,
                actor: "actor",
                actorAction: "提交借书信息",
                systemAction: "系统创建借阅记录",
              },
            ],
          },
        ],
      },
      {
        ...baseUseCaseModel.useCases[0]!,
        id: "uc_search",
        name: "检索图书",
        primaryActorId: "actor_reader",
        eventFlows: [
          {
            id: "flow_search_main",
            name: "检索主成功场景",
            flowType: "main",
            trigger: "读者输入检索条件",
            steps: [
              {
                order: 1,
                actor: "actor",
                actorAction: "提交检索条件",
                systemAction: "系统返回匹配图书",
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(validateModelInput(contextualUseCase, "requirements"), []);
  const callCounts = new Map<string, number>();
  const analysisOutput = (useCaseId: string, useCaseName: string) =>
    JSON.stringify({
      models: [
        {
          diagramKind: "analysis",
          modelId: `analysis:${useCaseId}`,
          sourceUseCaseId: useCaseId,
          sourceUseCaseName: useCaseName,
          title: `${useCaseName}需求分析模型`,
          summary: `根据${useCaseName}事件流生成。`,
          notes: [],
          participants: [
            { sourceElementIds: [useCaseId],
              id: `actor_${useCaseId}`,
              name: useCaseName === "检索图书" ? "读者" : "图书管理员",
              participantType: "actor",
            },
            { sourceElementIds: [useCaseId],
              id: `boundary_${useCaseId}`,
              name: `${useCaseName}界面`,
              participantType: "boundary",
            },
          ],
          messages: [
            { sourceElementIds: [useCaseId],
              id: `msg_${useCaseId}`,
              type: "sync",
              sourceId: `actor_${useCaseId}`,
              targetId: `boundary_${useCaseId}`,
              name: useCaseName,
              parameters: [],
            },
          ],
          fragments: [],
        },
      ],
      requirementModelTraceability: [
        [`actor_${useCaseId}`, "participant", useCaseName === "检索图书" ? "读者" : "图书管理员"],
        [`boundary_${useCaseId}`, "participant", `${useCaseName}界面`],
        [`msg_${useCaseId}`, "message", useCaseName],
      ].map(([elementId, elementKind, label]) => ({
        ruleId: useCaseRule.id,
        target: {
          diagramKind: "analysis",
          modelId: `analysis:${useCaseId}`,
          elementId,
          elementKind,
          label,
        },
      })),
    });
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const isSearch = prompt.includes("uc_search");
      const useCaseId = isSearch ? "uc_search" : "uc_borrow";
      const useCaseName = isSearch ? "检索图书" : "借书";
      const count = (callCounts.get(useCaseId) ?? 0) + 1;
      callCounts.set(useCaseId, count);
      if (useCaseId === "uc_search" && (persistentFailure || count === 1)) {
        throw new Error("temporary provider interruption");
      }
      yield analysisOutput(useCaseId, useCaseName);
    },
  };
  const renderClient: RenderClient = async (artifact) => ({
    svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
    renderMeta: {
      engine: "test",
      generatedAt: new Date().toISOString(),
      sourceLength: artifact.source.length,
      durationMs: 1,
    },
  });
  const snapshot = createEmptySnapshot(
    "run-analysis-coverage-retry",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [useCaseRule],
    {
      models: [contextualUseCase],
      requirementModelTraceability: [],
    },
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  if (persistentFailure) {
    await assert.rejects(runStagePipeline(record, providerSettings, transport, renderClient));
    const failed = record.snapshot as RunSnapshot;
    assert.deepEqual(Object.keys(failed.diagramErrors), ["analysis:uc_search"]);
    assert.ok(failed.models.some(model => model.modelId === "analysis:uc_borrow"));
    assert.equal(callCounts.get("uc_borrow"), 1);
    assertCurrentRunSnapshot(failed);
    const runs = new Map<string, RunRecord>();
    createQueuedRunFromSource({ runs, source: record, action: "retry", sourceRunId: failed.runId, runId: "retry-failed-analysis" });
    assert.deepEqual((runs.get("retry-failed-analysis")!.snapshot as RunSnapshot).analysisTargetUseCaseIds, ["uc_search"]);
    return;
  }
  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  const analysisIds = completed.models
    .filter((model) => model.diagramKind === "analysis")
    .map((model) => model.modelId)
    .sort();
  assert.equal(completed.status, "completed");
  assert.equal(completed.diagramErrors.analysis, undefined);
  assert.equal(callCounts.get("uc_borrow"), 1);
  assert.equal(callCounts.get("uc_search"), 2);
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.stage === "generate_models" &&
        event.subtaskId === "analysis:uc_search" &&
        event.modelId === "analysis:uc_search" &&
        event.subtaskStatus === "running" &&
        event.message === "正在补跑缺失的需求分析模型：检索图书（第 1 轮）",
    ),
  );
  assert.ok(!record.events.some((event) => "subtaskId" in event && event.subtaskId === "analysis:coverage-retry"));
  assert.deepEqual(analysisIds, ["analysis:uc_borrow", "analysis:uc_search"]);
});

test("requirement pipeline supplements only targeted missing analysis use cases", async () => {
  const useCaseRule: RequirementRule = {
    id: "r-usecase",
    type: "functional" as const,
    text: "每个用例都应由事件流生成独立需求分析顺序图。",

  };
  const baseUseCaseModel = modelForKind("usecase");
  assert.equal(baseUseCaseModel.diagramKind, "usecase");
  const contextualUseCase: DiagramModelSpec = {
    ...baseUseCaseModel,
    useCases: [
      {
        ...baseUseCaseModel.useCases[0]!,
        id: "uc_borrow",
        name: "借书",
        eventFlows: [
          {
            id: "flow_borrow_main",
            name: "借书主成功场景",
            flowType: "main",
            trigger: "管理员发起借书",
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "提交借书信息",
                systemResponse: "系统创建借阅记录",
              },
            ],
          },
        ],
      },
      {
        ...baseUseCaseModel.useCases[0]!,
        id: "uc_search",
        name: "检索图书",
        eventFlows: [
          {
            id: "flow_search_main",
            name: "检索主成功场景",
            flowType: "main",
            trigger: "读者输入检索条件",
            steps: [
              {
                order: 1,
                actor: "actor",
                action: "提交检索条件",
                systemResponse: "系统返回匹配图书",
              },
            ],
          },
        ],
      },
    ],
  };
  const existingAnalysis: DiagramModelSpec = {
    diagramKind: "analysis",
    modelId: "analysis:uc_borrow",
    sourceUseCaseId: "uc_borrow",
    sourceUseCaseName: "借书",
    title: "借书需求分析模型",
    summary: "已有借书分析。",
    notes: [],
    participants: [
      { sourceElementIds: ["uc_borrow"], id: "actor_existing", name: "图书管理员", participantType: "actor" },
      { sourceElementIds: ["uc_borrow"], id: "boundary_existing", name: "借书界面", participantType: "boundary" },
    ],
    messages: [
      { sourceElementIds: ["uc_borrow"],
        id: "msg_existing",
        type: "sync",
        sourceId: "actor_existing",
        targetId: "boundary_existing",
        name: "办理借书",
        parameters: [],
      },
    ],
    fragments: [],
  };
  const generatedUseCaseIds: string[] = [];
  const transport: LlmTransport = {
    async *streamChatCompletion(input: StreamChatCompletionInput) {
      const prompt = String(input.messages.at(-1)?.content ?? "");
      const useCaseId = useCaseIdFromSingleUseCasePrompt(prompt) ?? "unknown";
      generatedUseCaseIds.push(useCaseId);
      assert.equal(useCaseId, "uc_search");
      yield JSON.stringify({
        models: [
          {
            diagramKind: "analysis",
            modelId: "analysis:uc_search",
            sourceUseCaseId: "uc_search",
            sourceUseCaseName: "检索图书",
            title: "检索图书需求分析模型",
            summary: "根据检索图书事件流生成。",
            notes: [],
            participants: [
              { sourceElementIds: ["uc_search"], id: "actor_search", name: "读者", participantType: "actor" },
              { sourceElementIds: ["uc_search"], id: "boundary_search", name: "检索界面", participantType: "boundary" },
            ],
            messages: [
              { sourceElementIds: ["uc_search"],
                id: "msg_search",
                type: "sync",
                sourceId: "actor_search",
                targetId: "boundary_search",
                name: "提交检索条件",
                parameters: [],
              },
            ],
            fragments: [],
          },
        ],
        requirementModelTraceability: [],
      });
    },
  };
  const renderedModelIds: string[] = [];
  const renderClient: RenderClient = async (artifact) => {
    renderedModelIds.push(artifact.modelId ?? artifact.diagramKind);
    return {
      svg: `<svg data-kind="${artifact.diagramKind}" data-model-id="${artifact.modelId ?? ""}"></svg>`,
      renderMeta: {
        engine: "test",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 1,
      },
    };
  };
  const snapshot = createEmptySnapshot(
    "run-analysis-targeted-supplement",
    LIBRARY_REQUIREMENT_TEXT,
    ["analysis"],
    [useCaseRule],
    {
      models: [contextualUseCase, existingAnalysis],
      requirementModelTraceability: [],
      analysisTargetUseCaseIds: ["uc_search"],
    },
  );
  const record: RunRecord = {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
  };

  await runStagePipeline(record, providerSettings, transport, renderClient);

  const completed = record.snapshot as RunSnapshot;
  const analysisIds = completed.models
    .filter((model) => model.diagramKind === "analysis")
    .map((model) => model.modelId)
    .sort();
  assert.equal(completed.status, "completed");
  assert.deepEqual(generatedUseCaseIds, ["uc_search"]);
  assert.deepEqual(analysisIds, ["analysis:uc_borrow", "analysis:uc_search"]);
  assert.ok(renderedModelIds.includes("analysis:uc_search"));
  assert.equal(renderedModelIds.includes("analysis:uc_borrow"), false);
});

test("a selected model with no mapped rule types fails before calling the provider", async () => {
  const rules: RequirementRule[] = [{ id: "r1", type: "interaction", text: "预约页面显示日期选择器" }];
  const snapshot = createEmptySnapshot("fixed-type-guard", "预约系统", ["class"], rules);
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  let calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() { calls++; yield "{}"; } };
  const renderClient: RenderClient = async () => { throw new Error("must not render"); };
  await assert.rejects(runStagePipeline(record, providerSettings, transport, renderClient));
  assert.equal(calls, 0);
  assert.match((record.snapshot as RunSnapshot).diagramErrors.class?.error.message ?? "", /没有对应类型/);
});
