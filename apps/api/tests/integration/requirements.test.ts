// Verifies API requirements behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";

import { MANAGED_PROVIDER_SETTINGS, MULTI_MODEL_JSON, RULES_JSON, USECASE_MODEL_JSON, createMockLlmTransport, createRuleNormalizerMockLlmTransport, createTestApiServer, expectedResponseFormat, lastPromptText, managedProviderSettings, startProjectRun, withCapturedConsoleError } from "../fixtures/api-run-fixtures.js";

test("api runs a full pipeline and streams SSE events", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202, startResponse.body);
  const { runId } = startResponse.json();

  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });
  assert.equal(eventsResponse.statusCode, 200);
  assert.equal(
    eventsResponse.headers["access-control-allow-origin"],
    "http://localhost:3000",
  );
  assert.equal(eventsResponse.headers.vary, "Origin");
  assert.match(
    String(eventsResponse.headers["content-type"] ?? ""),
    /text\/event-stream/i,
  );
  assert.match(eventsResponse.body, /"type":"queued"/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  assert.equal(snapshotResponse.statusCode, 200);
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.rules.length, 1);
  assert.equal(snapshot.models.length, 1);
  assert.equal(snapshot.svgArtifacts.length, 1);
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_models" && entry.kind === "llm_output",
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_models" && entry.kind === "parsed_model",
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { stage: string; kind: string; plantUmlSource?: string }) =>
        entry.stage === "generate_plantuml" &&
        entry.kind === "plantuml_source" &&
        /@startuml/.test(entry.plantUmlSource ?? ""),
    ),
  );

  await app.close();
});

test("api preserves explicit semantic classifications without category mappings", async () => {
  const app = await createTestApiServer({
    llmTransport: createRuleNormalizerMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg><text>seat reservation</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "共享自习室座位预约系统支持微信登录、查座、预约和签到。\n接口请求做合法性校验，防止恶意预约。\n系统支持至少100人同时在线使用，页面加载速度小于2秒。",
      selectedDiagrams: ["usecase"],
      providerSettings: managedProviderSettings("gpt-5.4"),
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();

  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
  });
  assert.equal(eventsResponse.statusCode, 200);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  assert.equal(snapshotResponse.statusCode, 200);
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.deepEqual(snapshot.rules.map((rule: { type: string }) => rule.type), ["functional", "quality", "quality"]);
  assert.ok(snapshot.rules.every((rule: object) => !("relatedDiagrams" in rule) && !("category" in rule)));

  await app.close();
});

test("api repairs generate_models output when the first model JSON is malformed", async () => {
  let modelAttempts = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);

        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        modelAttempts += 1;
        if (modelAttempts === 1) {
          yield '{"models":[{"diagramKind":"usecase","title":"实验平台用例","summary":"主要参与者和用例","notes":["仅包含核心流程"],"actors":[';
          return;
        }

        yield USECASE_MODEL_JSON;
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });
  assert.match(eventsResponse.body, /模型 JSON 结构不合法/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.equal(modelAttempts, 2);
  assert.deepEqual(snapshot.models[0].notes, ["仅包含核心流程"]);
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string; rawOutput?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "llm_output" &&
        /actors/.test(entry.rawOutput ?? ""),
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string; errorMessage?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "parse_error" &&
        /JSON|Unterminated|Unexpected/.test(entry.errorMessage ?? ""),
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string }) =>
        entry.attempt === 2 && entry.kind === "parsed_model",
    ),
  );

  await app.close();
});

test("api repairs generate_models output when element traceability is missing", async () => {
  let modelAttempts = 0;
  let traceabilityAttempts = 0;
  const modelsOnlyOutput = JSON.stringify({
    models: JSON.parse(USECASE_MODEL_JSON).models,
  });
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        if (prompt.includes("补充元素级可追踪关系")) { traceabilityAttempts += 1; assert.fail("当前模型生成必须随完整模型返回来源声明，不能发起独立追踪调用"); }

        modelAttempts += 1;
        yield modelAttempts === 1 ? modelsOnlyOutput : USECASE_MODEL_JSON;
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  await app.inject({ method: "GET", url: `/api/runs/${runId}/events` });
  const snapshot = (
    await app.inject({ method: "GET", url: `/api/runs/${runId}` })
  ).json();

  assert.equal(snapshot.status, "completed");
  assert.equal(modelAttempts, 2);
  assert.equal(traceabilityAttempts, 0);
  assert.equal(snapshot.requirementModelTraceability.length, 4);
  assert.ok(
    snapshot.requirementModelTraceability.some(
      (entry: { target: { elementId: string } }) =>
        entry.target.elementId === "boundary_platform",
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string; errorMessage?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "parse_error" &&
        /requirementModelTraceability|mapping-coverage-missing/.test(entry.errorMessage ?? ""),
    ),
  );

  await app.close();
});

test("api rejects explicitly empty requirement sources without fabricating mappings", async () => {
  const emptyTraceOutput = JSON.stringify({
    models: JSON.parse(USECASE_MODEL_JSON).models,
    requirementModelTraceability: [],
  });
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages }) {
        const prompt = lastPromptText(messages);
        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        yield emptyTraceOutput;
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
  });
  assert.match(eventsResponse.body, /"type":"failed"/);

  const snapshot = (
    await app.inject({ method: "GET", url: `/api/runs/${runId}` })
  ).json();
  assert.equal(snapshot.status, "failed");
  assert.ok(snapshot.error);
  assert.deepEqual(snapshot.models, []);
  assert.equal(snapshot.requirementModelTraceability.length, 0);
  assert.equal(snapshot.requirementTrace.filter(
    (entry: { kind: string }) => entry.kind === "parse_error",
  ).length, 6);
  assert.ok(
    snapshot.requirementTrace.every(
      (entry: { kind: string; parsedData?: { autoFilledRequirementTraceability?: boolean } }) =>
        entry.parsedData?.autoFilledRequirementTraceability !== true,
    ),
  );

  await app.close();
});

test("api sends json_schema for Claude models and completes", async () => {
  let sawGenerateModels = false;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        if (prompt.includes("生成需求阶段 UML 结构化模型")) {
          sawGenerateModels = true;
          assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        }
        yield USECASE_MODEL_JSON;
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: managedProviderSettings("claude-opus-4-6-thinking"),
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.models.length, 1);
  assert.equal(sawGenerateModels, true);

  await app.close();
});

test("api rejects ambiguous deployment endpoints without deleting relationships", async () => {
  const deploymentRulesJson = JSON.stringify({

    rules: [
      {
        id: "r1",
        type: "operations" as const,
        text: "系统部署包含 Web、Node API、数据库和站内消息服务。",
        sourceFragment: "系统部署包含 Web、Node API、数据库和站内消息服务。",

      },
    ],
  });
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages }) {
        const prompt = lastPromptText(messages);
        if (prompt.includes("抽取结构化需求规则")) {
          yield deploymentRulesJson;
          return;
        }

        yield JSON.stringify({
          models: [
            {
              diagramKind: "deployment",
              title: "部署模型",
              summary: "API 与站内消息服务部署",
              notes: "线上部署拓扑",
              nodes: [{ id: "node_api", name: "Node API", nodeType: "server" }],
              databases: [{ id: "db_main", name: "主数据库" }],
              components: [{ id: "component_web", name: "Web 前端" }],
              externalSystems: [{ id: "mail_service", name: "站内消息服务" }],
              artifacts: [],
              relationships: [
                {
                  id: "rel_by_name",
                  type: "communication",
                  sourceName: "Web 前端",
                  targetName: "Node API",
                  port: 8080,
                  protocol: "HTTP",
                },
                {
                  id: "rel_from_to",
                  type: "communication",
                  from: "Node API",
                  to: "主数据库",
                  port: 5432,
                  protocol: "TCP",
                },
                {
                  id: "rel_drop",
                  type: "communication",
                  label: "无法确定端点",
                },
              ],
            },
          ],
          requirementModelTraceability: [
            {
              ruleId: "r1",
              target: {
                diagramKind: "deployment",
                elementId: "node_api",
                elementKind: "deployment-node",
                label: "Node API",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "deployment",
                elementId: "db_main",
                elementKind: "database",
                label: "主数据库",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "deployment",
                elementId: "component_web",
                elementKind: "component",
                label: "Web 前端",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "deployment",
                elementId: "mail_service",
                elementKind: "external-system",
                label: "站内消息服务",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "deployment",
                elementId: "rel_by_name",
                elementKind: "relationship",
                label: "Web 前端 -> Node API",
              },
            },
            {
              ruleId: "r1",
              target: {
                diagramKind: "deployment",
                elementId: "rel_from_to",
                elementKind: "relationship",
                label: "Node API -> 主数据库",
              },
            },
          ],
        });
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "系统部署包含 Web、Node API、数据库和站内消息服务。",
      selectedDiagrams: ["deployment"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  await app.inject({ method: "GET", url: `/api/runs/${runId}/events` });
  const snapshotResponse = await app.inject({ method: "GET", url: `/api/runs/${runId}` });
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.models.length, 0);
  assert.match(JSON.stringify(snapshot.diagramErrors), /sourceName|sourceId|nodeType|notes/);

  await app.close();
});

test("api logs the final generate_models output when parsing or schema validation fails", async () => {
  await withCapturedConsoleError(async (logs) => {
    let modelAttempts = 0;
    const app = await createTestApiServer({
      llmTransport: {
        async *streamChatCompletion({messages, responseFormat, runContext }) {
          const prompt = lastPromptText(messages);

          if (prompt.includes("抽取结构化需求规则")) {
            yield RULES_JSON;
            return;
          }

          assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
          modelAttempts += 1;
          if (modelAttempts === 1) {
            yield '{"models":[{"diagramKind":"usecase","title":"实验平台用例","summary":"主要参与者和用例","notes":["仅包含核心流程"],"actors":[';
            return;
          }

          yield USECASE_MODEL_JSON;
        },
      },
      renderClient: async () => ({
        svg: "<svg><text>ok</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: 120,
          durationMs: 5,
        },
      }),
    });

    const startResponse = await startProjectRun(app, {
      method: "POST",
      url: "/api/runs",
      payload: {
        requirementText: "实验平台根据文本需求生成模型和 UML 图。",
        selectedDiagrams: ["usecase"],
        providerSettings: MANAGED_PROVIDER_SETTINGS,
      },
    });

    const { runId } = startResponse.json();
    const eventsResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/events`,
      headers: {
        origin: "http://localhost:3000",
      },
    });

    assert.match(eventsResponse.body, /模型 JSON 结构不合法/);
    assert.ok(
      logs.some(
        (entry) =>
          entry.includes("[llm-structured-output-failed]") &&
          entry.includes("stage=generate_models") &&
          entry.includes("attempt=1") &&
          entry.includes('"actors":['),
      ),
    );

    await app.close();
  });
});

test("api retries rendering from the same canonical model without accepting an LLM PlantUML rewrite", async () => {
  let renderAttempts = 0;
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => {
      renderAttempts += 1;
      if (renderAttempts === 1) {
        throw new Error("Syntax Error? (line 3)");
      }

      assert.match(artifact.source, /@startuml/);
      assert.match(artifact.source, /生成模型/);
      return {
        svg: "<svg><text>fixed</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 8,
        },
      };
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });
  assert.match(eventsResponse.body, /图形重建/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "completed");
  assert.equal(renderAttempts, 2);
  assert.equal(snapshot.svgArtifacts.length, 1);
  assert.ok(snapshot.requirementTrace.some((entry: { kind: string }) => entry.kind === "render_error"));
  assert.ok(snapshot.requirementTrace.every((entry: { kind: string }) => !["repair_output", "repaired_plantuml"].includes(entry.kind)));

  await app.close();
});

test("api rejects the placeholder and rebuilds SVG without rewriting model semantics", async () => {
  let renderAttempts = 0;
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => {
      renderAttempts += 1;
      if (renderAttempts === 1) {
        return {
          svg: "<svg><text>Welcome to PlantUML!</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: artifact.source.length,
            durationMs: 3,
          },
        };
      }

      return {
        svg: "<svg><text>fixed after placeholder</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 6,
        },
      };
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });
  assert.match(eventsResponse.body, /图形重建/);
  assert.match(eventsResponse.body, /"type":"completed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "completed");
  assert.equal(renderAttempts, 2);
  assert.equal(snapshot.svgArtifacts.length, 1);
  assert.ok(snapshot.requirementTrace.some((entry: { kind: string }) => entry.kind === "render_error"));
  assert.ok(snapshot.requirementTrace.every((entry: { kind: string }) => !["repair_output", "repaired_plantuml"].includes(entry.kind)));

  await app.close();
});

test("api keeps successful diagrams and reports activity render failure in diagramErrors", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);

        if (prompt.includes("抽取结构化需求规则")) {
          yield RULES_JSON;
          return;
        }

        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        const result = JSON.parse(MULTI_MODEL_JSON);
        const selected = prompt.match(/只生成以下图类型：\s*\n([^\n]+)/u)?.[1]?.trim();
        result.models = result.models.filter((model: { diagramKind: string }) => model.diagramKind === selected);
        result.requirementModelTraceability = result.requirementModelTraceability.filter((entry: { target: { diagramKind: string } }) => entry.target.diagramKind === selected);
        yield JSON.stringify(result);
      },
    },
    renderClient: async (artifact) => {
      if (artifact.diagramKind === "activity") {
        throw new Error("Syntax Error? (Assumed diagram type: activity)");
      }

      return {
        svg: "<svg><text>usecase ok</text></svg>",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 5,
        },
      };
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase", "activity"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });
  assert.match(eventsResponse.body, /"type":"failed"/);
  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "failed");
  assert.ok(snapshot.error);
  assert.equal(snapshot.outputManifest.filter((item: { kind: string }) => item.kind === "model").length, 1);
  assert.equal(snapshot.svgArtifacts.length, 1);
  assert.equal(snapshot.svgArtifacts[0].diagramKind, "usecase");
  assert.match(
    snapshot.diagramErrors.activity?.error?.message ?? "",
    /模型绘图失败/,
  );
  assert.equal(snapshot.diagramErrors.activity?.stage, "render_svg");

  await app.close();
});

test("api fails the run when deterministic PlantUML cannot be rendered", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => {
      throw new Error("broken uml source");
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });
  assert.match(eventsResponse.body, /模型绘图失败/);
  assert.match(eventsResponse.body, /"type":"failed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();

  assert.equal(snapshot.status, "failed");
  assert.match(snapshot.error?.message ?? "", /模型绘图失败/);
  assert.match(snapshot.error?.message ?? "", /broken uml source/i);

  await app.close();
});

test("api emits failed events when a stage returns invalid JSON", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion() {
        yield '{"rules":"invalid"}';
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>ok</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 120,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  const { runId } = startResponse.json();
  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      origin: "http://localhost:3000",
    },
  });

  assert.equal(eventsResponse.statusCode, 200);
  assert.equal(
    eventsResponse.headers["access-control-allow-origin"],
    "http://localhost:3000",
  );
  assert.match(eventsResponse.body, /"type":"failed"/);

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  const snapshot = snapshotResponse.json();
  assert.equal(snapshot.status, "failed");
  assert.match(snapshot.error?.message ?? "", /invalid/i);

  await app.close();
});
