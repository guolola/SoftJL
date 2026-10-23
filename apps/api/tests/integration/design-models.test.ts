// Verifies API design-models behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";


import { designDiagramModelsResultSchema } from "@uml-platform/contracts";

import { CLASS_MODEL, CLASS_REQUIREMENT_TRACEABILITY, DESIGN_CLASS_AND_TABLE_JSON, DESIGN_NAVIGATION_JSON, DESIGN_SEQUENCE_JSON, MANAGED_PROVIDER_SETTINGS, PROTOTYPE_MODEL, PROTOTYPE_REQUIREMENT_TRACEABILITY, TEST_REQUIREMENT_BASELINE, USECASE_MODEL_JSON, USECASE_REQUIREMENT_TRACEABILITY, assertApiErrorCode, createTestApiServer, expectedResponseFormat, lastPromptText, startProjectRun, waitForRunSnapshot } from "../fixtures/api-run-fixtures.js";

test("api rebuilds design after render failure without requesting PlantUML rewrites", async () => {
  let renderAttempts = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        assert.match(prompt, /用例实现设计/);
        yield DESIGN_SEQUENCE_JSON;
      },
    },
    renderClient: async (artifact) => {
      renderAttempts += 1;
      if (renderAttempts === 1) {
        throw new Error("Syntax Error? (line 4)");
      }
      return {
        svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
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
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementModelTraceability: USECASE_REQUIREMENT_TRACEABILITY,
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshot = await waitForRunSnapshot(app, `/api/design-runs/${runId}`);

  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.equal(renderAttempts, 2);
  assert.equal(snapshot.svgArtifacts.length, 1);
  assert.ok(snapshot.designTrace.some((entry: { kind: string }) => entry.kind === "render_error"));
  assert.ok(snapshot.designTrace.every((entry: { kind: string }) => !["repair_output", "repaired_plantuml"].includes(entry.kind)));

  await app.close();
});

test("api records design model parse repair trace", async () => {
  let designCalls = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        if (prompt.includes("请基于本对话中上一版完整模型")) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
        if (designCalls > 0) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
        designCalls += 1;
        const invalid = JSON.parse(DESIGN_SEQUENCE_JSON);
        invalid.models[0].participants[0].participantType = "alien";
        yield JSON.stringify(invalid);
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>sequence</text></svg>",
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
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementModelTraceability: USECASE_REQUIREMENT_TRACEABILITY,
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  await app.inject({ method: "GET", url: `/api/design-runs/${runId}/events` });
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/design-runs/${runId}`,
    })
  ).json();

  assert.equal(snapshot.status, "completed");
  assert.equal(designCalls, 1);
  assert.ok(
    snapshot.designTrace.some(
      (entry: { attempt: number; kind: string; rawOutput?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "llm_output" &&
        /"participantType":"alien"/.test(entry.rawOutput ?? ""),
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { attempt: number; kind: string; errorMessage?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "parse_error" &&
        /participantType/.test(entry.errorMessage ?? ""),
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { attempt: number; kind: string }) =>
        entry.attempt === 2 && entry.kind === "parsed_model",
    ),
  );

  await app.close();
});

test("api rejects malformed design fields after five structured repair attempts", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        assert.match(prompt, /设计阶段顺序图|用例实现设计|请基于本对话/);
        yield JSON.stringify({
          models: [
            {
              diagramKind: "sequence",
              modelId: "sequence:usecase_generate",
              sourceUseCaseId: "usecase_generate",
              sourceUseCaseName: "生成模型",
              title: "顺序图",
              summary: "动态行为",
              notes: "由用例推导",
              participants: [
                { id: "user", name: "用户", participantType: "actor" },
                { id: "system", name: "系统", participantType: "control" },
              ],
              messages: [
                {
                  id: "m1",
                  type: "response",
                  sourceId: "system",
                  targetId: "user",
                  name: "返回结果",
                  parameters: "result",
                  description: "返回根据文本需求生成的 UML 模型结果。",
                },
              ],
              fragments: [],
            },
          ],
          designModelTraceability: [
            {
              source: {
                modelId: "sequence:usecase_generate",
                diagramKind: "sequence",
                elementId: "user",
                elementKind: "participant",
                label: "用户",
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: "actor_researcher",
                  elementKind: "actor",
                  label: "研究人员",
                },
              ],
            },
            {
              source: {
                modelId: "sequence:usecase_generate",
                diagramKind: "sequence",
                elementId: "system",
                elementKind: "participant",
                label: "系统",
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: "usecase_generate",
                  elementKind: "usecase",
                  label: "生成模型",
                },
              ],
            },
            {
              source: {
                modelId: "sequence:usecase_generate",
                diagramKind: "sequence",
                elementId: "m1",
                elementKind: "message",
                label: "返回结果",
              },
              targets: [
                {
                  diagramKind: "usecase",
                  elementId: "usecase_generate",
                  elementKind: "usecase",
                  label: "生成模型",
                },
              ],
            },
          ],
        });
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>sequence</text></svg>",
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
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementModelTraceability: USECASE_REQUIREMENT_TRACEABILITY,
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshot = await waitForRunSnapshot(app, `/api/design-runs/${runId}`);

  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.models.length, 0);
  assert.equal(snapshot.designTrace.filter((entry: { kind: string }) => entry.kind === "llm_output").length, 6);
  assert.match(JSON.stringify(snapshot.diagramErrors), /notes|Expected array/);

  await app.close();
});

test("api rejects missing design sources without an independent mapping call", async () => {
  let modelAttempts = 0;
  let traceabilityAttempts = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        if (
          prompt.includes("设计阶段 UML 模型补充元素级可追踪关系") ||
          prompt.includes("修复设计模型元素级可追踪关系")
        ) { traceabilityAttempts += 1; assert.fail("当前模型生成必须随完整模型返回来源声明，不能发起独立追踪调用"); }

        modelAttempts += 1;
        yield JSON.stringify({
          models: JSON.parse(DESIGN_SEQUENCE_JSON).models,
        });
      },
    },
    renderClient: async () => ({
      svg: "<svg><text>sequence</text></svg>",
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
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementModelTraceability: USECASE_REQUIREMENT_TRACEABILITY,
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshot = await waitForRunSnapshot(app, `/api/design-runs/${runId}`);

  assert.equal(snapshot.status, "failed");
  assert.equal(modelAttempts, 6);
  assert.equal(traceabilityAttempts, 0, "no independent source-recovery loop");
  assert.deepEqual(snapshot.models, []);
  assert.deepEqual(snapshot.designModelTraceability, []);
  assert.match(JSON.stringify(snapshot.diagramErrors), /designModelTraceability/);

  await app.close();
});

test("api generates navigation from its prototype in one call without sequence or semantic review", async () => {
  let llmCalls = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion() {
        llmCalls += 1;
        yield DESIGN_NAVIGATION_JSON;
      },
    },
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
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
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0], PROTOTYPE_MODEL],
      requirementModelTraceability: [
        ...USECASE_REQUIREMENT_TRACEABILITY,
        ...PROTOTYPE_REQUIREMENT_TRACEABILITY,
      ],
      selectedDiagrams: ["navigation"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  await app.inject({ method: "GET", url: `/api/design-runs/${runId}/events` });
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/design-runs/${runId}`,
    })
  ).json();

  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.models.filter((model: { diagramKind: string }) => model.diagramKind === "navigation").length, 1);
  assert.equal(llmCalls, 1);

  await app.close();
});

test("api rejects dependent design batches before calling the provider", async () => {
  let llmCalls = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion() {
        llmCalls += 1;
        yield DESIGN_CLASS_AND_TABLE_JSON;
      },
    },
  });

  // Both selection orders and conflicts split across command fields use the public route guard.
  for (const batch of [
    { selectedDiagrams: ["class", "table"], requestedDiagrams: ["table"] },
    { selectedDiagrams: ["table", "class"], requestedDiagrams: ["table"] },
    { selectedDiagrams: ["class"], requestedDiagrams: ["table"] },
  ]) {
    const response = await startProjectRun(app, {
      method: "POST",
      url: "/api/design-runs",
      payload: { ...batch, providerSettings: MANAGED_PROVIDER_SETTINGS },
    });
    assert.equal(response.statusCode, 409);
    assertApiErrorCode(response, "MODEL_GENERATION_BATCH_CONFLICT");
  }
  assert.equal(llmCalls, 0);
  await app.close();
});

test("api generates a design table from its saved class without regenerating prerequisites", async () => {
  const classAndTable = designDiagramModelsResultSchema.parse(JSON.parse(DESIGN_CLASS_AND_TABLE_JSON));
  const classOnly = {
    models: classAndTable.models.filter(
      (model: { diagramKind: string }) => model.diagramKind === "class",
    ),
    designModelTraceability: classAndTable.designModelTraceability.filter(
      (entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "class",
    ),
  };
  const tableOnlyJson = JSON.stringify({
    models: classAndTable.models.filter(
      (model: { diagramKind: string }) => model.diagramKind === "table",
    ),
    designModelTraceability: classAndTable.designModelTraceability.filter(
      (entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "table",
    ),
  });
  let llmCallCount = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        llmCallCount += 1;
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        assert.match(prompt, /已生成设计阶段上下文模型/);
        assert.match(prompt, /设计阶段静态结构/);
        yield tableOnlyJson;
      },
    },
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0], CLASS_MODEL],
      requirementModelTraceability: [
        ...USECASE_REQUIREMENT_TRACEABILITY,
        ...CLASS_REQUIREMENT_TRACEABILITY,
      ],
      // Upstream models must already be saved, with their original provenance.
      existingDesignModels: classOnly.models,
      existingDesignModelTraceability: classOnly.designModelTraceability,
      selectedDiagrams: ["table"],
      requestedDiagrams: ["table"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshot = await waitForRunSnapshot(app, `/api/design-runs/${runId}`);

  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.deepEqual(snapshot.selectedDiagrams, ["table"]);
  assert.deepEqual(snapshot.requestedDiagrams, ["table"]);
  assert.equal(llmCallCount, 1);
  assert.deepEqual(
    snapshot.models.map((model: { diagramKind: string }) => model.diagramKind),
    ["class", "table"],
  );
  assert.deepEqual(snapshot.models.find((model: { diagramKind: string }) => model.diagramKind === "class"), classOnly.models[0]);
  assert.match(
    snapshot.plantUml.find((item: { diagramKind: string }) => item.diagramKind === "table")
      ?.source ?? "",
    /<<FK>>/,
  );

  await app.close();
});

test("api retains its saved class but rejects a table without sources after five repairs", async () => {
  const classAndTable = designDiagramModelsResultSchema.parse(JSON.parse(DESIGN_CLASS_AND_TABLE_JSON));
  const classOnly = {
    models: classAndTable.models.filter(
      (model: { diagramKind: string }) => model.diagramKind === "class",
    ),
    designModelTraceability: classAndTable.designModelTraceability.filter(
      (entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "class",
    ),
  };
  const tableOnlyJson = JSON.stringify({
    models: classAndTable.models.filter(
      (model: { diagramKind: string }) => model.diagramKind === "table",
    ),
    designModelTraceability: [],
  });
  let llmCallCount = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({responseFormat, runContext }) {
        llmCallCount += 1;
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        yield tableOnlyJson;
      },
    },
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 5,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0], CLASS_MODEL],
      requirementModelTraceability: [
        ...USECASE_REQUIREMENT_TRACEABILITY,
        ...CLASS_REQUIREMENT_TRACEABILITY,
      ],
      existingDesignModels: classOnly.models,
      existingDesignModelTraceability: classOnly.designModelTraceability,
      selectedDiagrams: ["table"],
      requestedDiagrams: ["table"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  await app.inject({ method: "GET", url: `/api/design-runs/${runId}/events` });
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/design-runs/${runId}`,
    })
  ).json();

  assert.equal(snapshot.status, "failed");
  assert.ok(snapshot.diagramErrors.table);
  assert.deepEqual(snapshot.models.find((model: { diagramKind: string }) => model.diagramKind === "class"), classOnly.models[0]);
  assert.ok(!snapshot.models.some((model: { diagramKind: string }) => model.diagramKind === "table"));
  assert.ok(!snapshot.designModelTraceability.some((entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "table"));
  assert.equal(llmCallCount, 6, "one table generation plus five repairs; saved prerequisites are not regenerated");

  await app.close();
});
