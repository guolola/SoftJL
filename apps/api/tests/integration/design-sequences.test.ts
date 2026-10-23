// Verifies API design-sequences behavior through the assembled server.

import assert from "node:assert/strict";
import test from "node:test";

import { DESIGN_NAVIGATION_JSON, DESIGN_SEQUENCE_JSON, DESIGN_SEQUENCE_MODEL, MANAGED_PROVIDER_SETTINGS, PROTOTYPE_MODEL, PROTOTYPE_REQUIREMENT_TRACEABILITY, TEST_REQUIREMENT_BASELINE, USECASE_MODEL_JSON, USECASE_REQUIREMENT_TRACEABILITY, createTestApiServer, expectedResponseFormat, lastPromptText, startProjectRun, waitForRunSnapshot } from "../fixtures/api-run-fixtures.js";

test("api runs a design sequence pipeline from the requirement usecase model", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        assert.match(prompt, /用例实现设计/);
        yield DESIGN_SEQUENCE_JSON;
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
  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.deepEqual(snapshot.selectedDiagrams, ["sequence"]);
  assert.equal(snapshot.models[0].diagramKind, "sequence");
  assert.equal(snapshot.svgArtifacts[0].diagramKind, "sequence");
  assert.ok(
    snapshot.designTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_design_sequence" && entry.kind === "llm_output",
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { stage: string; kind: string }) =>
        entry.stage === "generate_design_sequence" && entry.kind === "parsed_model",
    ),
  );
  assert.ok(
    snapshot.designTrace.some(
      (entry: { stage: string; kind: string; plantUmlSource?: string }) =>
        entry.stage === "generate_plantuml" &&
        entry.kind === "plantuml_source" &&
        /@startuml/.test(entry.plantUmlSource ?? ""),
    ),
  );

  await app.close();
});

test("api rejects empty design sequence sources after the shared repair budget", async () => {
  const prompts: string[] = [];
  const emptyTraceSequenceJson = JSON.stringify({
    models: [DESIGN_SEQUENCE_MODEL],
    designModelTraceability: [],
  });
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        prompts.push(lastPromptText(messages));
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        yield emptyTraceSequenceJson;
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
  const snapshot = await waitForRunSnapshot(app, `/api/design-runs/${startResponse.json().runId}`);

  assert.equal(snapshot.status, "failed");
  assert.equal(prompts.length, 6);
  assert.deepEqual(snapshot.models, []);
  assert.deepEqual(snapshot.designModelTraceability, []);
  assert.match(JSON.stringify(snapshot.diagramErrors), /designModelTraceability/);

  await app.close();
});

test("api generates design sequences with one LLM request per use case", async () => {
  const prompts: string[] = [];
  let activeSequenceCalls = 0;
  let maxActiveSequenceCalls = 0;
  const useCaseModel = JSON.parse(USECASE_MODEL_JSON).models[0];
  const multiUseCaseModel = {
    ...useCaseModel,
    useCases: [
      ...useCaseModel.useCases,
      {
        id: "usecase_review",
        systemBoundaryId: "boundary_platform",
        name: "审核模型",
        goal: "审核生成后的模型",
        preconditions: ["模型已生成"],
        postconditions: ["审核结果已记录"],
        primaryActorId: "actor_researcher",
        supportingActorIds: [],
      },
      {
        id: "usecase_archive",
        systemBoundaryId: "boundary_platform",
        name: "归档模型",
        goal: "归档审核后的模型",
        preconditions: ["模型已审核"],
        postconditions: ["模型已归档"],
        primaryActorId: "actor_researcher",
        supportingActorIds: [],
      },
    ],
    relationships: [
      ...useCaseModel.relationships,
      {
        id: "rel_association_2",
        sourceId: "actor_researcher",
        targetId: "usecase_review",
        type: "association",
        label: "审核",
      },
      {
        id: "rel_association_3",
        sourceId: "actor_researcher",
        targetId: "usecase_archive",
        type: "association",
        label: "归档",
      },
    ],
  };
  const multiUseCaseRequirementTraceability = [
    ...USECASE_REQUIREMENT_TRACEABILITY,
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "usecase_review",
        elementKind: "usecase",
        label: "审核模型",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "usecase_archive",
        elementKind: "usecase",
        label: "归档模型",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "rel_association_2",
        elementKind: "relationship",
        label: "审核",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "rel_association_3",
        elementKind: "relationship",
        label: "归档",
      },
    },
  ];
  const sequenceJsonFor = (useCaseId: string, useCaseName: string) =>
    {
      const sources = [
        { elementId: "actor_researcher", elementKind: "participant", label: "研究人员" },
        { elementId: "ui", elementKind: "participant", label: "Web 页面" },
        { elementId: "api", elementKind: "participant", label: "编排 API" },
        { elementId: "msg_submit", elementKind: "message", label: "submitRequirement" },
        { elementId: "msg_start", elementKind: "message", label: "startRun" },
      ];
      const model = {
        ...DESIGN_SEQUENCE_MODEL,
        modelId: `sequence:${useCaseId}`,
        sourceUseCaseId: useCaseId,
        sourceUseCaseName: useCaseName,
        title: `${useCaseName}顺序`,
      };
      return JSON.stringify({
      models: [model],
      designModelTraceability: sources.map((source) => ({
          source: {
            modelId: `sequence:${useCaseId}`,
            diagramKind: "sequence",
            ...source,
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
      });
    };
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        prompts.push(prompt);
        activeSequenceCalls += 1;
        maxActiveSequenceCalls = Math.max(maxActiveSequenceCalls, activeSequenceCalls);
        await new Promise((resolve) => setTimeout(resolve, 5));
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        try {
          if (/"id":\s*"usecase_review"/.test(prompt)) {
            yield sequenceJsonFor("usecase_review", "审核模型");
          } else if (/"id":\s*"usecase_archive"/.test(prompt)) {
            yield sequenceJsonFor("usecase_archive", "归档模型");
          } else {
            yield sequenceJsonFor("usecase_generate", "生成模型");
          }
        } finally {
          activeSequenceCalls -= 1;
        }
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
      requirementModels: [multiUseCaseModel],
      requirementModelTraceability: multiUseCaseRequirementTraceability,
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  await app.inject({
    method: "GET",
    url: `/api/design-runs/${startResponse.json().runId}/events`,
  });
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/design-runs/${startResponse.json().runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.deepEqual(
    snapshot.models.map((model: { sourceUseCaseId: string }) => model.sourceUseCaseId).sort(),
    ["usecase_archive", "usecase_generate", "usecase_review"],
  );
  assert.equal(prompts.length, 3);
  assert.ok(maxActiveSequenceCalls <= 2);
  assert.ok(
    prompts.some(
      (prompt) =>
        /"id":\s*"usecase_generate"/.test(prompt) &&
        !/"id":\s*"usecase_review"/.test(prompt) &&
        !/"id":\s*"usecase_archive"/.test(prompt),
    ),
  );
  assert.ok(
    prompts.some(
      (prompt) =>
        /"id":\s*"usecase_review"/.test(prompt) &&
        !/"id":\s*"usecase_generate"/.test(prompt) &&
        !/"id":\s*"usecase_archive"/.test(prompt),
    ),
  );
  assert.ok(
    prompts.some(
      (prompt) =>
        /"id":\s*"usecase_archive"/.test(prompt) &&
        !/"id":\s*"usecase_generate"/.test(prompt) &&
        !/"id":\s*"usecase_review"/.test(prompt),
    ),
  );

  await app.close();
});

test("api retries an empty use-case sequence result and completes coverage", async () => {
  const useCaseModel = JSON.parse(USECASE_MODEL_JSON).models[0];
  const multiUseCaseModel = {
    ...useCaseModel,
    useCases: [
      ...useCaseModel.useCases,
      {
        id: "uc_filter_date",
        systemBoundaryId: "boundary_platform",
        name: "日期筛选",
        goal: "按日期筛选座位状态",
        preconditions: ["用户已进入座位查询页"],
        postconditions: ["系统展示目标日期座位状态"],
        primaryActorId: "actor_researcher",
        supportingActorIds: [],
      },
    ],
    relationships: [...useCaseModel.relationships, { id: "rel_filter", type: "association", sourceId: "actor_researcher", targetId: "uc_filter_date" }],
  };
  const traceability = [
    ...USECASE_REQUIREMENT_TRACEABILITY,
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "uc_filter_date",
        elementKind: "usecase",
        label: "日期筛选",
      },
    },
  ];
  const attemptsByUseCase = new Map<string, number>();
  const traceSources = [
    { elementId: "actor_researcher", elementKind: "participant", label: "研究人员" },
    { elementId: "ui", elementKind: "participant", label: "Web 页面" },
    { elementId: "api", elementKind: "participant", label: "编排 API" },
    { elementId: "msg_submit", elementKind: "message", label: "submitTextRequirement" },
    { elementId: "msg_start", elementKind: "message", label: "generateUmlModel" },
  ];
  const traceabilityJsonFor = (useCaseId: string, useCaseName: string) =>
    JSON.stringify({
      designModelTraceability: traceSources.map((source) => ({
        source: {
          modelId: `sequence:${useCaseId}`,
          diagramKind: "sequence",
          ...source,
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
    });
  const sequenceJsonFor = (useCaseId: string, useCaseName: string) =>
    {
      return JSON.stringify({
        models: [
          {
            ...DESIGN_SEQUENCE_MODEL,
            modelId: `sequence:${useCaseId}`,
            sourceUseCaseId: useCaseId,
            sourceUseCaseName: useCaseName,
            title: `${useCaseName}顺序图`,
          },
        ],
        ...JSON.parse(traceabilityJsonFor(useCaseId, useCaseName)),
      });
    };
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        const prompt = lastPromptText(messages);
        if (prompt.includes("请为已经生成成功的设计阶段 UML 模型补充元素级可追踪关系")) {  assert.fail("当前模型生成必须随完整模型返回来源声明，不能发起独立追踪调用"); }
        const useCaseId = runContext?.subtaskId === "sequence:uc_filter_date"
          ? "uc_filter_date"
          : "usecase_generate";
        const isSequencePrompt = true;
        const attempt = isSequencePrompt
          ? (attemptsByUseCase.get(useCaseId) ?? 0) + 1
          : 1;
        if (isSequencePrompt) attemptsByUseCase.set(useCaseId, attempt);
        if (useCaseId === "uc_filter_date" && attempt === 1) {
          yield JSON.stringify({ models: [], designModelTraceability: [] });
          return;
        }
        yield sequenceJsonFor(
          useCaseId,
          useCaseId === "uc_filter_date" ? "日期筛选" : "生成模型",
        );
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
      requirementModels: [multiUseCaseModel],
      requirementModelTraceability: traceability,
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  await app.inject({
    method: "GET",
    url: `/api/design-runs/${startResponse.json().runId}/events`,
  });
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/design-runs/${startResponse.json().runId}`,
    })
  ).json();

  assert.equal(snapshot.status, "completed");
  assert.equal(attemptsByUseCase.get("uc_filter_date"), 2);
  assert.deepEqual(
    snapshot.models.map((model: { sourceUseCaseId: string }) => model.sourceUseCaseId).sort(),
    ["uc_filter_date", "usecase_generate"],
  );
  assert.equal(snapshot.diagramErrors["sequence:uc_filter_date"], undefined);

  await app.close();
});

test("api preserves successful sequences when one use-case sequence keeps failing", async () => {
  const useCaseModel = JSON.parse(USECASE_MODEL_JSON).models[0];
  const multiUseCaseModel = {
    ...useCaseModel,
    useCases: [
      ...useCaseModel.useCases,
      {
        id: "uc_filter_date",
        systemBoundaryId: "boundary_platform",
        name: "日期筛选",
        goal: "按日期筛选座位状态",
        preconditions: ["用户已进入座位查询页"],
        postconditions: ["系统展示目标日期座位状态"],
        primaryActorId: "actor_researcher",
        supportingActorIds: [],
      },
    ],
    relationships: [...useCaseModel.relationships, { id: "rel_filter", type: "association", sourceId: "actor_researcher", targetId: "uc_filter_date" }],
  };
  const traceability = [
    ...USECASE_REQUIREMENT_TRACEABILITY,
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "uc_filter_date",
        elementKind: "usecase",
        label: "日期筛选",
      },
    },
  ];
  let downstreamPromptSeen = false;
  const traceSources = [
    { elementId: "actor_researcher", elementKind: "participant", label: "研究人员" },
    { elementId: "ui", elementKind: "participant", label: "Web 页面" },
    { elementId: "api", elementKind: "participant", label: "编排 API" },
    { elementId: "msg_submit", elementKind: "message", label: "submitTextRequirement" },
    { elementId: "msg_start", elementKind: "message", label: "generateUmlModel" },
  ];
  const traceabilityJsonFor = (useCaseId: string, useCaseName: string) =>
    JSON.stringify({
      designModelTraceability: traceSources.map((source) => ({
        source: {
          modelId: `sequence:${useCaseId}`,
          diagramKind: "sequence",
          ...source,
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
    });
  const sequenceJsonFor = (useCaseId: string, useCaseName: string) =>
    {
      return JSON.stringify({
        models: [
          {
            ...DESIGN_SEQUENCE_MODEL,
            modelId: `sequence:${useCaseId}`,
            sourceUseCaseId: "wrong-use-case",
            sourceUseCaseName: "错误用例",
            title: `${useCaseName}顺序图`,
          },
        ],
        ...JSON.parse(traceabilityJsonFor(useCaseId, useCaseName)),
      });
    };
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages }) {
        const prompt = lastPromptText(messages);
        if (prompt.includes("本阶段生成的是下游聚合设计模型")) {
          downstreamPromptSeen = true;
        }
        if (prompt.includes("请为已经生成成功的设计阶段 UML 模型补充元素级可追踪关系")) {  assert.fail("当前模型生成必须随完整模型返回来源声明，不能发起独立追踪调用"); }
        if (/"id":\s*"uc_filter_date"/.test(prompt)) {
          yield JSON.stringify({ models: [], designModelTraceability: [] });
          return;
        }
        yield sequenceJsonFor("usecase_generate", "生成模型");
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
      requirementModels: [multiUseCaseModel],
      requirementModelTraceability: traceability,
      selectedDiagrams: ["sequence", "class"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  await app.inject({
    method: "GET",
    url: `/api/design-runs/${startResponse.json().runId}/events`,
  });
  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/design-runs/${startResponse.json().runId}`,
    })
  ).json();

  assert.equal(snapshot.status, "failed");
  assert.ok(snapshot.error);
  assert.deepEqual(snapshot.outputManifest.filter((item: { kind: string }) => item.kind === "model").map((item: { id: string }) => item.id), ["sequence:usecase_generate"]);
  assert.deepEqual(
    snapshot.models.map((model: { sourceUseCaseId: string }) => model.sourceUseCaseId),
    ["usecase_generate"],
  );
  assert.equal(snapshot.models[0].modelId, "sequence:usecase_generate");
  assert.equal(snapshot.diagramErrors["sequence:uc_filter_date"].stage, "generate_design_sequence");
  assert.equal(downstreamPromptSeen, false);

  await app.close();
});

test("api generates an explicit sequence dependency for downstream design diagrams", async () => {
  const prompts: string[] = [];
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        prompts.push(prompt);
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        if (prompt.includes("models 只包含 diagramKind 为 sequence")) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
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
      selectedDiagrams: ["sequence", "navigation"],
      requestedDiagrams: ["navigation"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshot = await waitForRunSnapshot(app, `/api/design-runs/${runId}`);
  assert.equal(snapshot.status, "completed", JSON.stringify(snapshot.error));
  assert.deepEqual(snapshot.selectedDiagrams, ["sequence", "navigation"]);
  assert.deepEqual(snapshot.requestedDiagrams, ["navigation"]);
  assert.deepEqual(
    snapshot.models.map((model: { diagramKind: string }) => model.diagramKind),
    ["sequence", "navigation"],
  );
  assert.equal(prompts.length, 2);

  await app.close();
});
