// Verifies API server assembly, route registration, auth flows, and cross-domain integration contracts.
import { requirementRuleFacts } from "@uml-platform/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import type { InjectOptions } from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { LlmTransport } from "./llm.js";
import { createApiServer } from "./index.js";
import { createInMemoryAuthStore } from "./auth/in-memory-auth-store.js";
import type { DocumentLibrary } from "./documents/library/document-library.js";
import { createProviderConfigStore } from "./provider-configs/provider-config-store.js";
import { createRunRecordStore } from "./runs/records/run-record-store.js";
import { buildRequirementBaseline } from "./runs/baselines/requirement-baseline.js";
import { designInputFingerprint, requirementRuleSchema, snapshotInputFingerprint, type DesignDiagramModelSpec, type DiagramModelSpec } from "@uml-platform/contracts";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "./adapters/plantuml/model-renderer.js";

function assertApiErrorCode(response: { json(): unknown }, code: string) {
  const body = response.json() as { error?: { code?: string; retryable?: boolean } };
  assert.equal(body.error?.code, code);
  assert.equal(typeof body.error?.retryable, "boolean");
}

// Most index tests exercise pipeline behavior through a synthetic authenticated
// project context without browser sessions.

const TEST_RUN_ACCESS_CONTEXT = {
  userId: "api-index-test-user",
  projectId: "api-index-test-project",
};
const TEST_PROVIDER_CONFIG_ID = "api-index-managed-provider";
const MANAGED_PROVIDER_SETTINGS = {
  providerConfigId: TEST_PROVIDER_CONFIG_ID,
  model: "gpt-5.5",
};

function managedProviderSettings(model: string) {
  return {
    providerConfigId: TEST_PROVIDER_CONFIG_ID,
    model,
  };
}

async function createTestApiServer(options?: Parameters<typeof createApiServer>[0]) {
  // Existing pipeline fixtures model extraction; answer the new preflight with source ids.
  const screeningTransport: LlmTransport | undefined = options?.llmTransport ? {
    async *streamChatCompletion(input: Parameters<LlmTransport["streamChatCompletion"]>[0]) {
      const prompt = lastPromptText(input.messages);
      if (/^核对 (?:feasibility|requirements|design)\.[a-z]+ 的(?:结构与业务内容|图片与模型)。/.test(prompt)) {
        yield JSON.stringify({ passed: true, issues: [], findings: [] });
        return;
      }
      if (String(input.messages[0]?.content).includes("你是软件需求输入检查器")) {
        const units = JSON.parse(String(input.messages[1]?.content)) as Array<{ id: string; text: string }>;
        yield JSON.stringify({ units: units.map((unit) => ({
          id: unit.id,
          category: /忽略之前的指令/u.test(unit.text)
            ? "injection"
            : /天气/u.test(unit.text) ? "irrelevant" : "requirement",
        })) });
        return;
      }
      yield* options.llmTransport!.streamChatCompletion(input);
    },
  } : undefined;
  const providerConfigStore =
    options?.providerConfigStore ??
    createProviderConfigStore({
      secret: "api-index-test-secret",
    });
  if (!options?.providerConfigStore) {
    const created = providerConfigStore.create({
      name: "API index test provider",
      provider: "openai-compatible",
      baseUrl: "https://ai.comfly.org",
      apiKey: "sk-managed-index-test",
      defaultModel: "gpt-5.5",
      allowedModels: [
        "gpt-5.5",
        "gpt-5.4",
        "claude-opus-4-6-thinking",
      ],
      modelCapabilities: Object.fromEntries(
        ["gpt-5.5", "gpt-5.4", "claude-opus-4-6-thinking"].map((modelId) => [
          modelId,
          {
            id: modelId,
            category: "text_chat",
            supportsJsonSchema: true,
            supportsJsonObject: true,
            strictJson: true,
            structuredOutputMode: "strict_json",
            modeLabel: "严格 JSON",
            probeStatus: "strict",
            probedAt: "2026-07-29T00:00:00.000Z",
          },
        ]),
      ),
      createdBy: "api-index-test",
    });
    const resolveProviderId = (id: string) =>
      id === TEST_PROVIDER_CONFIG_ID ? created.id : id;
    const get = providerConfigStore.get.bind(providerConfigStore);
    const getSecret = providerConfigStore.getSecret.bind(providerConfigStore);
    const markUsed = providerConfigStore.markUsed.bind(providerConfigStore);
    providerConfigStore.get = (id) => get(resolveProviderId(id));
    providerConfigStore.getSecret = (id) => getSecret(resolveProviderId(id));
    providerConfigStore.markUsed = (id) => markUsed(resolveProviderId(id));
  }
  const authStore = options?.authStore ?? createInMemoryAuthStore();
  const app = await createApiServer({
    ...options,
    authStore,
    pngRenderClient: options?.pngRenderClient ?? (async () => ({ png: VALID_PNG, renderMeta: { engine: "plantuml", generatedAt: new Date().toISOString(), sourceLength: 1, durationMs: 1 } })),
    ...(screeningTransport ? { llmTransport: screeningTransport } : {}),
    providerConfigStore,
    testRunAccessContext:
      options && "testRunAccessContext" in options
        ? options.testRunAccessContext
        : TEST_RUN_ACCESS_CONTEXT,
  });
  fixtureAuthStores.set(app, authStore);
  return app;
}

type TestApiServer = Awaited<ReturnType<typeof createTestApiServer>>;
const fixtureAuthStores = new WeakMap<TestApiServer, ReturnType<typeof createInMemoryAuthStore>>();

// Integration fixtures save pipeline sources before submitting the public project
// command, so the same authoritative workspace boundary is exercised as in the UI.
async function startProjectRun(app: TestApiServer, request: InjectOptions & { payload: Record<string, unknown> }, workspaceOverrides: Record<string, unknown> = {}) {
  const source = request.payload;
  const projectId = typeof source.projectId === "string" ? source.projectId : TEST_RUN_ACCESS_CONTEXT.projectId;
  const requirementText = typeof source.requirementText === "string" ? source.requirementText : "实验平台根据文本需求生成模型和 UML 图。";
  const baseline = source.requirementBaseline as typeof TEST_REQUIREMENT_BASELINE | undefined;
  const rules = source.rules as typeof TEST_REQUIREMENT_BASELINE.rules | undefined
    ?? baseline?.rules.map((rule) => requirementRuleFacts(rule)) ?? [];
  const requirementBaseline = baseline ?? buildRequirementBaseline({ runId: "fixture-source", requirementText, rules });
  const models = (source.requirementModels ?? source.contextModels ?? []) as DiagramModelSpec[];
  const designModels = (source.designModels ?? source.existingDesignModels ?? []) as DesignDiagramModelSpec[];
  const requirementModelTraceability = source.requirementModelTraceability ?? source.contextRequirementModelTraceability ?? (models.length ? USECASE_REQUIREMENT_TRACEABILITY : []);
  const designModelTraceability = source.designModelTraceability ?? source.existingDesignModelTraceability ?? (designModels.length ? [{
    source: { diagramKind: "usecase", elementId: "usecase_generate", elementKind: "useCase", label: "生成模型" },
    targets: designModels.map((model) => ({ modelId: model.modelId, diagramKind: model.diagramKind, elementId: "message_generate", elementKind: "message", label: "生成模型" })),
  }] : []);
  const key = (value: { modelId?: string; diagramKind: string }) => value.modelId ?? value.diagramKind;
  const requirementArtifacts = (source.requirementPlantUml as ReturnType<typeof generatePlantUmlArtifacts> | undefined)?.length
    ? source.requirementPlantUml as ReturnType<typeof generatePlantUmlArtifacts> : generatePlantUmlArtifacts(models);
  const designArtifacts = (source.designPlantUml ?? source.existingDesignPlantUml) as ReturnType<typeof generateDesignPlantUmlArtifacts> | undefined;
  const state = { requirementText, rules, requirementBaseline,
    models: Object.fromEntries(models.map((model) => [key(model), model])), requirementModelTraceability,
    diagramInputFingerprints: Object.fromEntries(models.map((model) => [model.diagramKind, snapshotInputFingerprint({ requirementText, rules })])),
    plantUml: Object.fromEntries(requirementArtifacts.map((artifact) => [key(artifact), artifact.source])),
    svgArtifacts: Object.fromEntries(((source.requirementSvgArtifacts ?? []) as Array<{ modelId?: string; diagramKind: string }>).map((artifact) => [key(artifact), artifact])),
    designModels: Object.fromEntries(designModels.map((model) => [key(model), model])), designModelTraceability,
    generatedDesignDiagramTypes: designModels.map((model) => model.diagramKind),
    designInputFingerprints: Object.fromEntries(designModels.map((model) => [key(model), designInputFingerprint(models, requirementModelTraceability as never)])),
    designPlantUml: Object.fromEntries((designArtifacts?.length ? designArtifacts : generateDesignPlantUmlArtifacts(designModels)).map((artifact) => [key(artifact), artifact.source])),
    designSvgArtifacts: Object.fromEntries(((source.designSvgArtifacts ?? source.existingDesignSvgArtifacts ?? []) as Array<{ modelId?: string; diagramKind: string }>).map((artifact) => [key(artifact), artifact])),
  };
  const authStore = fixtureAuthStores.get(app)!;
  const current = await authStore.getProjectWorkspace(projectId);
  await authStore.saveProjectWorkspace({ projectId, baseVersion: current.version, state: { ...state, ...workspaceOverrides }, updatedByUserId: TEST_RUN_ACCESS_CONTEXT.userId });
  const fields = request.url === "/api/document-runs" ? ["documentKind", "providerSettings", "useAiText", "reasoning", "documentStyle"]
    : request.url === "/api/design-runs" ? ["selectedDiagrams", "requestedDiagrams", "providerSettings", "reasoning"]
    : ["requirementText", "attachments", "selectedDiagrams", "requestedDiagrams", "dependencyDiagrams", "analysisTargetUseCaseIds", "providerSettings", "reasoning"];
  return app.inject({ ...request, payload: { projectId, ...Object.fromEntries(fields.filter((field) => field in source).map((field) => [field, source[field]])) } });
}

async function waitForRunSnapshot(app: TestApiServer, url: string) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const response = await app.inject({ method: "GET", url });
    const snapshot = response.json();
    if (
      snapshot.status === "completed" ||
      snapshot.status === "failed" ||
      snapshot.status === "cancelled"
    ) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Run did not reach a terminal status: ${url}`);
}


function lastPromptText(messages: Parameters<LlmTransport["streamChatCompletion"]>[0]["messages"]) {
  const content = messages.at(-1)?.content ?? "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : part.image_url.url))
    .join("\n");
}

const RULES_JSON = JSON.stringify({  rules: [{ id: "r1", text: "研究人员可以根据文本需求生成 UML 模型。", sourceFragment: "实验平台根据文本需求生成模型和 UML 图。", type: "functional" as const }] });
const TEST_REQUIREMENT_BASELINE = buildRequirementBaseline({
  runId: "api-index-baseline",
  requirementText: "实验平台根据文本需求生成模型和 UML 图。",
  rules: JSON.parse(RULES_JSON).rules,
});
const CLASSIFIED_RULES_JSON = JSON.stringify({
  rules: [
    {
      id: "r1",
      type: "functional" as const,
      text: "用户选择目标日期、时间段与座位，提交预约请求。",
      sourceFragment: "共享自习室座位预约系统支持微信登录、查座、预约和签到。",

    },
    {
      id: "r2",
      type: "quality" as const,
      text: "接口请求做合法性校验，防止恶意预约。",
      sourceFragment: "共享自习室座位预约系统支持微信登录、查座、预约和签到。",

    },
    {
      id: "r3",
      type: "quality" as const,
      text: "系统支持至少100人同时在线使用，页面加载速度小于2秒。",
      sourceFragment: "共享自习室座位预约系统支持微信登录、查座、预约和签到。",

    },
  ],
});
const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const DOCUMENT_WORKSPACE_HEADERS = {
  "x-uml-workspace-id": "api-test-workspace",
  "x-uml-workspace-secret": "api-test-workspace-secret-value-123456",
};

const USECASE_MODEL_JSON = JSON.stringify({
  models: [
    {
      diagramKind: "usecase",
      title: "实验平台用例",
      summary: "主要参与者和用例",
      notes: ["仅包含核心流程"],
      actors: [
        {
          id: "actor_researcher",
          name: "研究人员",
          actorType: "human",
          responsibilities: ["发起生成请求"],
        },
      ],
      useCases: [
        {
          id: "usecase_generate",
          systemBoundaryId: "boundary_platform",
          name: "生成模型",
          goal: "根据需求生成 UML 模型",
          preconditions: ["已输入需求文本"],
          postconditions: ["系统返回结构化模型与图"],
          primaryActorId: "actor_researcher",
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [
        {
          id: "boundary_platform",
          name: "实验平台",
        },
      ],
      relationships: [
        {
          id: "rel_association_1",
          sourceId: "actor_researcher",
          targetId: "usecase_generate",
          type: "association",
          label: "发起",
        },
      ],
    },
  ],
  requirementModelTraceability: [
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "actor_researcher",
        elementKind: "actor",
        label: "研究人员",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "usecase_generate",
        elementKind: "usecase",
        label: "生成模型",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "rel_association_1",
        elementKind: "relationship",
        label: "发起",
      },
    },
  ],
});

const ACTIVITY_MODEL = {
  diagramKind: "activity" as const,
  title: "活动流程",
  summary: "带泳道的活动图",
  notes: [],
  swimlanes: [
    { id: "lane_user", name: "用户" },
    { id: "lane_system", name: "系统" },
  ],
  nodes: [
    { id: "start", type: "start", name: "开始" },
    {
      id: "submit",
      type: "activity",
      name: "提交需求",
      actorOrLane: "lane_user",
      input: ["需求"],
      output: ["请求"],
    },
    {
      id: "generate",
      type: "activity",
      name: "生成模型",
      actorOrLane: "lane_system",
      input: ["请求"],
      output: ["模型"],
    },
    { id: "end", type: "end", name: "结束" },
  ],
  relationships: [
    { id: "flow_start", type: "control_flow", sourceId: "start", targetId: "submit" },
    { id: "flow_submit", type: "control_flow", sourceId: "submit", targetId: "generate" },
    { id: "flow_generate", type: "control_flow", sourceId: "generate", targetId: "end" },
  ],
};

const PROTOTYPE_MODEL = {
  diagramKind: "prototype" as const,
  title: "原型界面关系",
  summary: "模型生成工作台页面关系",
  notes: [],
  nodes: [
    {
      id: "screen_input",
      name: "需求输入页",
      nodeType: "screen",
      route: "/requirements",
      sourceUseCaseIds: ["usecase_generate"],
      sourceRequirementIds: ["r1"],
    },
    {
      id: "screen_result",
      name: "模型结果页",
      nodeType: "screen",
      route: "/models",
      sourceUseCaseIds: ["usecase_generate"],
      sourceRequirementIds: ["r1"],
    },
  ],
  relationships: [
    {
      id: "proto_submit",
      type: "submits",
      sourceId: "screen_input",
      targetId: "screen_result",
      label: "提交后查看模型结果",
      trigger: "点击生成模型",
    },
  ],
};

const CLASS_MODEL = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "文本需求与 UML 模型领域对象",
  notes: [],
  classes: [
    {
      id: "user",
      name: "文本需求",
      classKind: "entity",
      attributes: [
        {
          name: "id",
          type: "INT",
          visibility: "public",
          required: true,
        },
        {
          name: "content",
          type: "VARCHAR(100)",
          visibility: "public",
          required: true,
        },
      ],
      operations: [],
    },
    {
      id: "order",
      name: "UML模型",
      classKind: "entity",
      attributes: [
        {
          name: "id",
          type: "INT",
          visibility: "public",
          required: true,
        },
        {
          name: "requirementId",
          type: "INT",
          visibility: "public",
          required: true,
        },
      ],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [
    {
      id: "rel_user_order",
      type: "association",
      sourceId: "user",
      targetId: "order",
      sourceMultiplicity: "1",
      targetMultiplicity: "0..*",
      label: "生成",
    },
  ],
};

const MULTI_MODEL_JSON = JSON.stringify({
  models: [JSON.parse(USECASE_MODEL_JSON).models[0], ACTIVITY_MODEL],
  requirementModelTraceability: [
    ...JSON.parse(USECASE_MODEL_JSON).requirementModelTraceability,
    {
      ruleId: "r1",
      target: {
        diagramKind: "activity",
        elementId: "submit",
        elementKind: "activity-node",
        label: "提交需求",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "activity",
        elementId: "generate",
        elementKind: "activity-node",
        label: "生成模型",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "activity",
        elementId: "flow_submit",
        elementKind: "relationship",
        label: "submit -> generate",
      },
    },
  ],
});

const USECASE_REQUIREMENT_TRACEABILITY =
  JSON.parse(USECASE_MODEL_JSON).requirementModelTraceability;
const ACTIVITY_REQUIREMENT_TRACEABILITY = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "activity",
      elementId: "submit",
      elementKind: "activity-node",
      label: "提交需求",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "activity",
      elementId: "generate",
      elementKind: "activity-node",
      label: "生成模型",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "activity",
      elementId: "flow_submit",
      elementKind: "relationship",
      label: "submit -> generate",
    },
  },
];
const PROTOTYPE_REQUIREMENT_TRACEABILITY = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "prototype",
      elementId: "screen_input",
      elementKind: "screen",
      label: "需求输入页",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "prototype",
      elementId: "screen_result",
      elementKind: "screen",
      label: "模型结果页",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "prototype",
      elementId: "proto_submit",
      elementKind: "relationship",
      label: "提交后查看模型结果",
    },
  },
];
const CLASS_REQUIREMENT_TRACEABILITY = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "user",
      elementKind: "class",
      label: "文本需求",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "order",
      elementKind: "class",
      label: "UML模型",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "rel_user_order",
      elementKind: "relationship",
      label: "生成",
    },
  },
];

const DESIGN_SEQUENCE_MODEL = {
  diagramKind: "sequence" as const,
  modelId: "sequence:usecase_generate",
  sourceUseCaseId: "usecase_generate",
  sourceUseCaseName: "生成模型",
  title: "生成模型顺序",
  summary: "用户触发生成后的对象调用",
  notes: ["设计阶段动态行为"],
  participants: [
    {
      id: "actor_researcher",
      name: "研究人员",
      participantType: "actor",
    },
    {
      id: "ui",
      name: "Web 页面",
      participantType: "boundary",
    },
    {
      id: "api",
      name: "编排 API",
      participantType: "control",
    },
  ],
  messages: [
    {
      id: "msg_submit",
      type: "sync",
      sourceId: "actor_researcher",
      targetId: "ui",
      name: "submitTextRequirement",
      parameters: ["文本需求"],
      description: "研究人员提交文本需求。",
    },
    {
      id: "msg_start",
      type: "sync",
      sourceId: "ui",
      targetId: "api",
      name: "generateUmlModel",
      parameters: ["selectedDiagrams", "UML 模型"],
      returnValue: "runId 与 UML 模型生成结果",
    },
  ],
  fragments: [],
};

function createCodeAppBlueprintJson(appName = "校园活动运营台") {
  return JSON.stringify({

  });
}

function createCodeBusinessLogicJson(appName = "UML 生成工作台") {
  return JSON.stringify({
    businessLogic: {
      appName,
      domainSummary: "UML 实验平台支持研究人员提交文本需求、生成 UML 模型并查看生成结果。",
      coreWorkflow: "提交文本需求、生成 UML 模型、查看模型结果和溯源状态。",
      actors: [
        {
          id: "researcher",
          name: "研究人员",
          type: "human",
          responsibilities: ["提交文本需求", "生成 UML 模型", "查看模型结果"],
        },
        {
          id: "reviewer",
          name: "复核人员",
          type: "human",
          responsibilities: ["复核模型覆盖", "查看溯源状态"],
        },
      ],
      businessEntities: [
        {
          id: "textRequirement",
          name: "文本需求",
          description: "用户输入的原始需求文本",
          fields: ["id:string", "content:string", "status:string"],
          relationships: ["文本需求生成多个 UML 模型"],
        },
        {
          id: "umlModel",
          name: "UML 模型",
          description: "根据文本需求生成的模型结果",
          fields: ["id:string", "requirementId:string", "status:string"],
          relationships: ["UML 模型追溯到文本需求"],
        },
      ],
      pageFlows: [
        {
          id: "overview",
          name: "生成总览",
          route: "/",
          purpose: "查看文本需求和 UML 模型生成指标",
          actors: ["研究人员", "复核人员"],
          entryPoints: ["进入系统"],
          userActions: ["查看生成状态", "筛选模型"],
          states: ["有需求", "空状态"],
          sourceRefs: ["sequence"],
        },
        {
          id: "generation",
          name: "模型生成",
          route: "/generation",
          purpose: "提交文本需求并生成 UML 模型",
          actors: ["研究人员"],
          entryPoints: ["输入文本需求"],
          userActions: ["提交文本需求", "生成 UML 模型"],
          states: ["待输入", "生成中", "已生成"],
          sourceRefs: ["sequence"],
        },
        {
          id: "detail",
          name: "模型详情",
          route: "/detail",
          purpose: "查看 UML 模型、覆盖关系和溯源状态",
          actors: ["研究人员", "复核人员"],
          entryPoints: ["打开模型结果"],
          userActions: ["查看模型详情", "查看溯源状态"],
          states: ["待复核", "已覆盖", "需复核"],
          sourceRefs: ["sequence"],
        },
      ],
      stateMachines: [
        {
          entity: "UML 模型",
          states: ["待输入", "生成中", "已生成", "需复核"],
          transitions: ["提交文本需求 -> 生成中", "生成 UML 模型 -> 已生成"],
        },
      ],
      permissions: [
        {
          actor: "研究人员",
          allowedActions: ["提交文本需求", "生成 UML 模型", "查看模型结果"],
          restrictedActions: [],
        },
      ],
      edgeCases: ["文本需求为空时禁止生成", "模型生成失败时展示错误原因"],
      frontendOperations: ["提交文本需求", "生成 UML 模型", "查看模型详情", "查看溯源状态"],
      plantUmlTraceability: ["sequence", "class"],
    },
  });
}

function createCodeSkillResourcePlanJson() {
  return JSON.stringify({

  });
}

function createCodeVisualDirectionJson() {
  return JSON.stringify({

  });
}

function createCodeSkillResourceDiscoveryPlanJson() {
  return JSON.stringify({

  });
}

function createCodeBusinessLogicObjectArrayJson(appName = "UML 生成工作台") {
  return JSON.stringify({
    businessLogic: {
      appName,
      domainSummary: "UML 实验平台支持研究人员提交文本需求并生成 UML 模型。",
      coreWorkflow: ["提交文本需求", "生成 UML 模型", "查看模型结果和溯源状态"],
      actors: [
        {
          id: "researcher",
          name: "研究人员",
          type: "human",
          responsibilities: ["提交文本需求", "生成 UML 模型"],
        },
      ],
      businessEntities: [
        {
          id: "textRequirement",
          name: "文本需求",
          description: "用户输入的原始需求文本",
          fields: [
            { name: "id", type: "string", required: true },
            { name: "content", type: "string", description: "需求文本" },
            { name: "status", type: "enum", values: ["待输入", "已提交"] },
          ],
          relationships: [
            {
              source: "文本需求",
              target: "UML 模型",
              type: "one-to-many",
              description: "文本需求生成多个 UML 模型",
            },
          ],
        },
        {
          id: "umlModel",
          name: "UML 模型",
          description: "根据文本需求生成的模型结果",
          fields: [
            { name: "id", type: "string" },
            { name: "requirementId", type: "string" },
            { name: "status", type: "enum", values: ["生成中", "已生成"] },
          ],
          relationships: [
            {
              source: "UML 模型",
              target: "文本需求",
              type: "many-to-one",
              description: "UML 模型追溯到文本需求",
            },
          ],
        },
      ],
      pageFlows: [
        {
          id: "overview",
          name: "生成总览",
          route: "/",
          purpose: "查看文本需求和 UML 模型生成指标",
          actors: ["研究人员"],
          entryPoints: ["进入系统"],
          userActions: ["筛选模型"],
          states: ["有需求", "空状态"],
          sourceRefs: ["sequence"],
        },
        {
          id: "generation",
          name: "模型生成",
          route: "/generation",
          purpose: "提交文本需求并生成 UML 模型",
          actors: ["研究人员"],
          entryPoints: ["输入文本需求"],
          userActions: ["生成 UML 模型"],
          states: ["待输入", "已生成"],
          sourceRefs: ["sequence"],
        },
      ],
      stateMachines: [
        {
          entity: "UML 模型",
          states: ["待输入", "生成中", "已生成"],
          transitions: [
            { from: "待输入", to: "生成中", action: "提交文本需求" },
            { from: "生成中", to: "已生成", action: "生成 UML 模型" },
          ],
        },
      ],
      permissions: [],
      edgeCases: [
        { condition: "文本需求为空", description: "禁止生成并提示原因" },
        { condition: "模型生成失败", description: "展示错误原因" },
      ],
      frontendOperations: [
        { action: "提交文本需求", target: "文本需求" },
        { action: "生成 UML 模型", target: "UML 模型" },
      ],
      plantUmlTraceability: [
        { type: "sequence", source: "generateUmlModel", target: "UMLModel" },
        { type: "class", source: "TextRequirement", target: "UMLModel" },
      ],
    },
  });
}

function createCodeUiBlueprintJson() {
  return JSON.stringify({

  });
}

function createCodeUiIrJson() {
  return JSON.stringify({

  });
}

function extractZipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let eocdOffset = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      eocdOffset = index;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(centralOffset), 0x02014b50);
    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLength = buffer.readUInt16LE(centralOffset + 32);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer
      .subarray(centralOffset + 46, centralOffset + 46 + fileNameLength)
      .toString("utf8");

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(
      name,
      method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed),
    );

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function createCodeFilePlanJson() {
  return JSON.stringify({
    filePlan: {
      entryFile: "/src/App.tsx",
      files: [
        { path: "/src/App.tsx", kind: "entry", responsibility: "挂载原型外壳" },
        {
          path: "/src/components/WorkspaceShell.tsx",
          kind: "component",
          responsibility: "组织导航和页面切换",
        },
        {
          path: "/src/pages/DashboardPage.tsx",
          kind: "page",
          responsibility: "活动运营总览",
        },
        {
          path: "/src/pages/RegistrationPage.tsx",
          kind: "page",
          responsibility: "活动报名流程",
        },
        {
          path: "/src/pages/DetailPage.tsx",
          kind: "page",
          responsibility: "报名详情和提醒",
        },
        {
          path: "/src/components/StatusBadge.tsx",
          kind: "component",
          responsibility: "展示活动和报名状态",
        },
        {
          path: "/src/components/MetricCard.tsx",
          kind: "component",
          responsibility: "展示运营指标",
        },
        {
          path: "/src/domain/types.ts",
          kind: "domain",
          responsibility: "定义活动和报名类型",
        },
        {
          path: "/src/data/mock-data.ts",
          kind: "data",
          responsibility: "提供校园活动 mock 数据",
        },
        { path: "/src/styles.css", kind: "style", responsibility: "业务主题样式" },
      ],
    },
  });
}

function createQualityCodeOperations(label = "UML 生成") {
  const operations = [
    {
      operation: "update_file",
      path: "/src/App.tsx",
      content:
        `import { useEffect } from 'react';
import { WorkspaceShell } from './components/WorkspaceShell';
export default function App() {
  useEffect(() => {
    document.title = '${label}';
  }, []);
  return <WorkspaceShell />;
}`,
      reason: "保持入口组件轻量",
    },
    {
      operation: "update_file",
      path: "/src/components/WorkspaceShell.tsx",
      content:
        "import { useState } from 'react';\nimport { DashboardPage } from '../pages/DashboardPage';\nimport { RegistrationPage } from '../pages/RegistrationPage';\nimport { DetailPage } from '../pages/DetailPage';\nimport { Button } from './ui/button';\nimport { Badge } from './ui/badge';\nconst routes = [{ path: '/', label: '总览' }, { path: '/generation', label: '模型生成' }, { path: '/detail', label: '模型详情' }] as const;\ntype RoutePath = (typeof routes)[number]['path'];\nexport function WorkspaceShell() { const [currentRoute,setCurrentRoute]=useState<RoutePath>('/'); const [theme,setTheme]=useState<'light'|'dark'>('light'); return <main className=\"min-h-screen w-full bg-[var(--bg)] px-4 py-5 text-[var(--text)] sm:px-6 lg:px-8\" data-theme={theme}><nav className=\"mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm\">{routes.map((item)=><Button key={item.path} variant={currentRoute===item.path?'default':'secondary'} size=\"sm\" onClick={()=>setCurrentRoute(item.path)}>{item.label}</Button>)}<Badge variant=\"outline\" className=\"ml-auto\">当前路径：{currentRoute}</Badge><Button variant=\"outline\" size=\"sm\" onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?'深色':'浅色'}</Button></nav>{currentRoute==='/'?<DashboardPage />:currentRoute==='/generation'?<RegistrationPage />:<DetailPage />}</main>; }",
      reason: "生成多页面导航外壳",
    },
    {
      operation: "create_file",
      path: "/src/pages/DashboardPage.tsx",
      content:
        "import { MetricCard } from '../components/MetricCard';\nimport { requirements } from '../data/mock-data';\nimport { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';\nexport function DashboardPage() { return <section className=\"grid gap-4 lg:grid-cols-[1fr_320px]\"><div className=\"grid gap-4 sm:grid-cols-2\"><MetricCard label=\"文本需求\" value={requirements.length} /><MetricCard label=\"UML 模型\" value={1} /></div><Card className=\"bg-white/90\"><CardHeader><CardTitle>UML 生成总览</CardTitle></CardHeader><CardContent><p className=\"text-sm leading-6 text-[var(--muted)]\">研究人员可以根据文本需求生成 UML 模型，并查看模型覆盖与溯源状态。</p></CardContent></Card></section>; }",
      reason: "生成总览页面",
    },
    {
      operation: "create_file",
      path: "/src/pages/RegistrationPage.tsx",
      content:
        "import { useState } from 'react';\nimport { StatusBadge } from '../components/StatusBadge';\nimport { requirements } from '../data/mock-data';\nimport { Button } from '../components/ui/button';\nimport { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';\nexport function RegistrationPage() { const [textRequirement,setTextRequirement]=useState(requirements[0]?.content ?? ''); const [status,setStatus]=useState('待输入'); const canGenerate = textRequirement.trim().length > 0; const generateUmlModel = () => { if (!canGenerate) return; setStatus('已生成'); }; return <section className=\"grid gap-4\"><h1 className=\"text-2xl font-semibold tracking-tight\">模型生成</h1><Card className=\"border-[var(--border)]\"><CardHeader className=\"flex flex-row items-center justify-between gap-3\"><CardTitle>文本需求生成 UML 模型</CardTitle><StatusBadge status={status} /></CardHeader><CardContent className=\"flex flex-wrap items-center gap-3\"><label className=\"sr-only\" htmlFor=\"requirement\">文本需求</label><textarea id=\"requirement\" value={textRequirement} onChange={(event)=>setTextRequirement(event.target.value)} className=\"min-h-24 w-full rounded-xl border border-[var(--border)] p-3\" /><p className=\"text-sm text-[var(--muted)]\">请输入文本需求后生成 UML 模型；文本需求为空时禁止生成。</p><Button disabled={!canGenerate} onClick={generateUmlModel}>生成 UML 模型</Button></CardContent></Card></section>; }",
      reason: "生成核心流程页面",
    },
    {
      operation: "create_file",
      path: "/src/pages/DetailPage.tsx",
      content:
        "import { umlModels } from '../data/mock-data';\nimport { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';\nexport function DetailPage() { return <section className=\"grid gap-4 md:grid-cols-2\"><h1 className=\"col-span-full text-2xl font-semibold tracking-tight\">模型详情</h1>{umlModels.map((item)=><Card key={item.id} className=\"shadow-sm\"><CardHeader><CardTitle>{item.name}</CardTitle></CardHeader><CardContent className=\"space-y-2 text-sm text-[var(--muted)]\"><p>{item.status}</p><p>{item.traceability}</p></CardContent></Card>)}</section>; }",
      reason: "生成详情页面",
    },
    {
      operation: "create_file",
      path: "/src/components/StatusBadge.tsx",
      content:
        "import { Badge } from './ui/badge';\nexport function StatusBadge({ status }: { status: string }) { return <Badge variant=\"secondary\" className=\"bg-amber-100 text-amber-800\">{status}</Badge>; }",
      reason: "生成状态组件",
    },
    {
      operation: "create_file",
      path: "/src/components/MetricCard.tsx",
      content:
        "import { Card, CardContent } from './ui/card';\nexport function MetricCard({ label, value }: { label: string; value: number }) { return <Card className=\"bg-white/90\"><CardContent className=\"space-y-2 p-5\"><span className=\"text-sm text-[var(--muted)]\">{label}</span><strong className=\"block text-3xl font-semibold text-[var(--text)]\">{value}</strong></CardContent></Card>; }",
      reason: "生成指标组件",
    },
    {
      operation: "create_file",
      path: "/src/lib/utils.ts",
      content:
        "import { clsx, type ClassValue } from 'clsx';\nimport { twMerge } from 'tailwind-merge';\nexport function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }",
      reason: "生成 shadcn 风格 cn 工具",
    },
    {
      operation: "create_file",
      path: "/src/components/ui/button.tsx",
      content:
        "import * as React from 'react';\nimport { Slot } from '@radix-ui/react-slot';\nimport { cva, type VariantProps } from 'class-variance-authority';\nimport { cn } from '../../lib/utils';\nconst buttonVariants = cva('inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:pointer-events-none disabled:opacity-50', { variants: { variant: { default: 'bg-[var(--primary)] text-white shadow-sm hover:opacity-90', secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200', outline: 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-slate-50' }, size: { sm: 'h-9 px-3', default: 'h-10 px-4 py-2', lg: 'h-11 px-6' } }, defaultVariants: { variant: 'default', size: 'default' } });\nexport interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }\nexport const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => { const Comp = asChild ? Slot : 'button'; return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />; });\nButton.displayName = 'Button';\nexport { buttonVariants };",
      reason: "生成 shadcn 风格按钮组件",
    },
    {
      operation: "create_file",
      path: "/src/components/ui/badge.tsx",
      content:
        "import * as React from 'react';\nimport { cva, type VariantProps } from 'class-variance-authority';\nimport { cn } from '../../lib/utils';\nconst badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors', { variants: { variant: { default: 'border-transparent bg-[var(--primary)] text-white', secondary: 'border-transparent bg-slate-100 text-slate-900', outline: 'border-[var(--border)] text-[var(--text)]' } }, defaultVariants: { variant: 'default' } });\nexport interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}\nexport function Badge({ className, variant, ...props }: BadgeProps) { return <div className={cn(badgeVariants({ variant }), className)} {...props} />; }\nexport { badgeVariants };",
      reason: "生成 shadcn 风格徽章组件",
    },
    {
      operation: "create_file",
      path: "/src/components/ui/card.tsx",
      content:
        "import * as React from 'react';\nimport { cn } from '../../lib/utils';\nexport const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn('rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm', className)} {...props} />);\nCard.displayName = 'Card';\nexport const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />);\nCardHeader.displayName = 'CardHeader';\nexport const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => <h3 ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />);\nCardTitle.displayName = 'CardTitle';\nexport const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />);\nCardContent.displayName = 'CardContent';",
      reason: "生成 shadcn 风格卡片组件",
    },
    {
      operation: "update_file",
      path: "/src/domain/types.ts",
      content:
        "export interface TextRequirement { id: string; content: string; status: string; }\nexport interface UmlModel { id: string; name: string; status: string; traceability: string; }",
      reason: "生成领域类型",
    },
    {
      operation: "update_file",
      path: "/src/data/mock-data.ts",
      content: `import type { TextRequirement, UmlModel } from '../domain/types';
export const requirements: TextRequirement[] = [{ id: 'req-1', content: '研究人员可以根据文本需求生成 UML 模型。', status: '已提交' }];
export const umlModels: UmlModel[] = [{ id: 'model-1', name: '${label} UML 模型', status: '已生成', traceability: '追溯到文本需求 req-1' }];`,
      reason: "生成 mock 数据",
    },
    {
      operation: "update_file",
      path: "/src/styles.css",
      content:
        ":root{--bg:#f7fafc;--surface:#ffffff;--text:#14213d;--muted:#64748b;--primary:#2563eb;--border:#dbe4f0;font-family:Inter,system-ui,sans-serif;color:var(--text);background:var(--bg)}[data-theme=\"dark\"]{--bg:#111827;--surface:#1f2937;--text:#f8fafc;--muted:#cbd5e1;--primary:#60a5fa;--border:#334155}body{margin:0;background:var(--bg)}*{box-sizing:border-box}@media (max-width:640px){body{overflow-x:hidden}}",
      reason: "生成业务主题样式",
    },
    {
      operation: "set_entry_file",
      path: "/src/App.tsx",
      reason: "设置 React 入口组件",
    },
  ];
  return operations.map((operation) => ({
    content: "",
    message: "",
    ...operation,
  }));
}

const DESIGN_SEQUENCE_JSON = JSON.stringify({
  models: [DESIGN_SEQUENCE_MODEL],
  designModelTraceability: [
    {
      source: {
        modelId: "sequence:usecase_generate",
        diagramKind: "sequence",
        elementId: "actor_researcher",
        elementKind: "participant",
        label: "研究人员",
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
        elementId: "ui",
        elementKind: "participant",
        label: "Web 页面",
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
        elementId: "api",
        elementKind: "participant",
        label: "编排 API",
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
        elementId: "msg_submit",
        elementKind: "message",
        label: "submitRequirement",
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
        elementId: "msg_start",
        elementKind: "message",
        label: "startRun",
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

const DESIGN_NAVIGATION_JSON = JSON.stringify({
  models: [{ ...PROTOTYPE_MODEL, diagramKind: "navigation", modelId: "navigation", title: "页面导航", summary: "需求界面的实现路由" }],
  designModelTraceability: PROTOTYPE_REQUIREMENT_TRACEABILITY.map((entry) => ({ source: { ...entry.target, diagramKind: "navigation", modelId: "navigation" }, targets: [entry.target] })),
});

const DESIGN_CLASS_AND_TABLE_JSON = JSON.stringify({
  models: [
    {
      ...CLASS_MODEL,
      title: "设计类图",
      summary: "设计阶段静态结构",
      classes: CLASS_MODEL.classes.map((item) => ({
        ...item,
        operations: [
          {
            name: "save",
            returnType: "void",
            visibility: "public",
            parameters: [],
          },
        ],
      })),
    },
    {
      diagramKind: "table",
      title: "表关系图",
      summary: "文本需求与 UML 模型表关系",
      notes: [],
      tables: [
        {
          id: "user",
          name: "需求",
          relationalConstraints: [{ id: "pk_user", type: "primary-key", columnIds: ["id"] }],
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
          ],
        },
        {
          id: "order",
          name: "UML模型",
          relationalConstraints: [{ id: "pk_order", type: "primary-key", columnIds: ["id"] }, { id: "rel_user_order_table", type: "foreign-key", columnIds: ["user_id"], referenceTableId: "user", referenceColumnIds: ["id"] }],
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
            {
              id: "user_id",
              name: "requirement_id",
              dataType: "INT",
              isPrimaryKey: false,
              isForeignKey: true,
              nullable: false,
              references: { tableId: "user", columnId: "id" },
            },
          ],
        },
      ],
      relationships: [
        {
          id: "order.rel_user_order_table",
          type: "one-to-many",
          sourceTableId: "user",
          targetTableId: "order",
          label: "需求生成模型",
        },
      ],
    },
  ],
  designModelTraceability: [
    {
      source: {
        diagramKind: "class",
        elementId: "user",
        elementKind: "class",
        label: "文本需求",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "class",
        elementId: "order",
        elementKind: "class",
        label: "UML模型",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "order",
          elementKind: "class",
          label: "UML模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "class",
        elementId: "rel_user_order",
        elementKind: "relationship",
        label: "生成",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "rel_user_order",
          elementKind: "relationship",
          label: "生成",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "user",
        elementKind: "table",
        label: "需求",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "user.id",
        elementKind: "table-column",
        label: "user.id",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order",
        elementKind: "table",
        label: "UML模型",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "order",
          elementKind: "class",
          label: "UML模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order.id",
        elementKind: "table-column",
        label: "order.id",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "order",
          elementKind: "class",
          label: "UML模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order.user_id",
        elementKind: "table-column",
        label: "UML模型.requirement_id",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order.rel_user_order_table",
        elementKind: "relationship",
        label: "需求生成模型",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "rel_user_order",
          elementKind: "relationship",
          label: "生成",
        },
      ],
    },
  ],
});

function createMockLlmTransport(): LlmTransport {
  return {
    async *streamChatCompletion({messages, responseFormat, runContext }) {
      const prompt = lastPromptText(messages);

      if (prompt.includes("请修复下面无法编译或返回占位 SVG 的 PlantUML")) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        yield JSON.stringify({
          source: [
            "@startuml",
            "actor 研究人员",
            "usecase 生成模型",
            "研究人员 --> 生成模型 : 发起",
            "@enduml",
          ].join("\n"),
        });
        return;
      }

      if ((prompt.includes("请修复下面不符合要求的 UML 结构化模型 JSON 输出") || prompt.includes("修复上下文："))) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        yield USECASE_MODEL_JSON;
        return;
      }

      if (prompt.includes("抽取结构化需求规则")) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        yield RULES_JSON;
        return;
      }

      if (prompt.includes("生成 UML 结构化模型")) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
      }

      yield USECASE_MODEL_JSON;
    },
  };
}

function createRuleNormalizerMockLlmTransport(): LlmTransport {
  return {
    async *streamChatCompletion({messages, responseFormat, runContext }) {
      const prompt = lastPromptText(messages);

      if (prompt.includes("请修复下面无法编译或返回占位 SVG 的 PlantUML")) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        yield JSON.stringify({
          source: [
            "@startuml",
            "actor 用户",
            "usecase 预约座位",
            "用户 --> 预约座位 : 提交",
            "@enduml",
          ].join("\n"),
        });
        return;
      }

      if (prompt.includes("抽取结构化需求规则")) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        yield CLASSIFIED_RULES_JSON;
        return;
      }

      if (prompt.includes("生成 UML 结构化模型")) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
      }

      yield USECASE_MODEL_JSON;
    },
  };
}

async function withCapturedConsoleError(
  callback: (logs: string[]) => Promise<void>,
) {
  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };

  try {
    await callback(logs);
  } finally {
    console.error = originalConsoleError;
  }
}

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
      requirementText: "共享自习室座位预约系统支持微信登录、查座、预约和签到。",
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

test("api runs a design sequence pipeline from the requirement usecase model", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        const prompt = lastPromptText(messages);
        if (prompt.includes("请为已经生成成功的设计阶段 UML 模型补充元素级可追踪关系")) {
          const useCaseId = prompt.includes("uc_filter_date")
            ? "uc_filter_date"
            : "usecase_generate";
          yield traceabilityJsonFor(
            useCaseId,
            useCaseId === "uc_filter_date" ? "日期筛选" : "生成模型",
          );
          return;
        }
        const useCaseId = prompt.includes("uc_filter_date")
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
        if (prompt.includes("请为已经生成成功的设计阶段 UML 模型补充元素级可追踪关系")) {
          yield traceabilityJsonFor("usecase_generate", "生成模型");
          return;
        }
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

test("api rebuilds design after render failure without requesting PlantUML rewrites", async () => {
  let renderAttempts = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        if (prompt.includes("请修复下面无法编译或返回占位 SVG 的 PlantUML")) {
          yield JSON.stringify({
            source: [
              "@startuml",
              "actor 用户",
              "用户 -> 系统 : 提交设计请求",
              "@enduml",
            ].join("\n"),
          });
          return;
        }
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        if (prompt.includes("请修复下面不符合要求的设计阶段 UML 结构化模型 JSON 输出")) {
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
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        assert.match(prompt, /设计阶段顺序图|用例实现设计|修复上下文/);
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
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        if (
          prompt.includes("设计阶段 UML 模型补充元素级可追踪关系") ||
          prompt.includes("修复设计模型元素级可追踪关系")
        ) {
          traceabilityAttempts += 1;
          if (traceabilityAttempts === 1) {
            const invalidTraceability = JSON.parse(DESIGN_SEQUENCE_JSON)
              .designModelTraceability.map((entry: {
                targets: Array<Record<string, unknown>>;
              }, index: number) =>
                index === 0
                  ? {
                      ...entry,
                      targets: [
                        {
                          ...entry.targets[0],
                          diagramKind: "requirements",
                        },
                      ],
                    }
                  : entry,
              );
            yield JSON.stringify({
              designModelTraceability: invalidTraceability,
            });
            return;
          }
          yield JSON.stringify({
            designModelTraceability: JSON.parse(DESIGN_SEQUENCE_JSON)
              .designModelTraceability,
          });
          return;
        }

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

test("api generates an explicit sequence dependency for downstream design diagrams", async () => {
  const prompts: string[] = [];
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        prompts.push(prompt);
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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

test("api generates explicit sequence and class dependencies for design table diagrams", async () => {
  const classAndTable = JSON.parse(DESIGN_CLASS_AND_TABLE_JSON);
  const classOnlyJson = JSON.stringify({
    models: classAndTable.models.filter(
      (model: { diagramKind: string }) => model.diagramKind === "class",
    ),
    designModelTraceability: classAndTable.designModelTraceability.filter(
      (entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "class",
    ),
  });
  const tableOnlyJson = JSON.stringify({
    models: classAndTable.models.filter(
      (model: { diagramKind: string }) => model.diagramKind === "table",
    ),
    designModelTraceability: classAndTable.designModelTraceability.filter(
      (entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "table",
    ),
  });
  const downstreamCalls: string[] = [];
  let llmCallCount = 0;
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({messages, responseFormat, runContext }) {
        const prompt = lastPromptText(messages);
        llmCallCount += 1;
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        if (llmCallCount === 1) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
        if (llmCallCount === 2) {
          downstreamCalls.push("class");
          yield classOnlyJson;
          return;
        }
        assert.match(prompt, /已生成设计阶段上下文模型/);
        assert.match(prompt, /设计阶段静态结构/);
        downstreamCalls.push("table");
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
      selectedDiagrams: ["sequence", "class", "table"],
      requestedDiagrams: ["table"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();
  const snapshot = await waitForRunSnapshot(app, `/api/design-runs/${runId}`);

  assert.equal(snapshot.status, "completed");
  assert.deepEqual(snapshot.selectedDiagrams, ["sequence", "class", "table"]);
  assert.deepEqual(snapshot.requestedDiagrams, ["table"]);
  assert.deepEqual(
    downstreamCalls,
    ["class", "table"],
    JSON.stringify({
      diagramErrors: snapshot.diagramErrors,
      models: snapshot.models.map((model: { diagramKind: string }) => model.diagramKind),
    }),
  );
  assert.deepEqual(
    snapshot.models.map((model: { diagramKind: string }) => model.diagramKind),
    ["sequence", "class", "table"],
  );
  assert.match(
    snapshot.plantUml.find((item: { diagramKind: string }) => item.diagramKind === "table")
      ?.source ?? "",
    /<<FK>>/,
  );

  await app.close();
});

test("api retains successful prerequisites but rejects a table without sources", async () => {
  const classAndTable = JSON.parse(DESIGN_CLASS_AND_TABLE_JSON);
  const classOnlyJson = JSON.stringify({
    models: classAndTable.models.filter(
      (model: { diagramKind: string }) => model.diagramKind === "class",
    ),
    designModelTraceability: classAndTable.designModelTraceability.filter(
      (entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "class",
    ),
  });
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
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        if (llmCallCount === 1) {
          yield DESIGN_SEQUENCE_JSON;
          return;
        }
        if (llmCallCount === 2) {
          yield classOnlyJson;
          return;
        }
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
      selectedDiagrams: ["sequence", "class", "table"],
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
  assert.ok(snapshot.models.some((model: { diagramKind: string }) => model.diagramKind === "class"));
  assert.ok(!snapshot.models.some((model: { diagramKind: string }) => model.diagramKind === "table"));
  assert.ok(!snapshot.designModelTraceability.some((entry: { source: { diagramKind: string } }) => entry.source.diagramKind === "table"));
  assert.equal(llmCallCount, 8, "two successful prerequisites plus six table attempts");

  await app.close();
});


test("api document run embeds PlantUML diagrams as PNG files in DOCX", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages }) {
        assert.match(lastPromptText(messages), /需求规格说明书/);
        yield JSON.stringify({
          sections: [
            {
              level: 1,
              title: "项目引言",
              body: ["说明项目背景，禁止写入成都信息工程大学 软件工程学院等模板外机构名。"],
            },
            {
              level: 1,
              title: "需求概述",
              body: ["说明系统面向的用户与范围。"],
            },
            {
              level: 1,
              title: "需求规定",
              body: [],
            },
            {
              level: 2,
              title: "功能需求",
              body: ["总体功能需求说明。总体用例图如下。"],
              diagramKind: "usecase",
            },
            {
              level: 3,
              title: "用例1：名称（编号）",
              body: ["用例参与者、前置条件、基本流程和异常流程见需求模型。"],
            },
          ],
        });
      },
    },
    pngRenderClient: async (artifact) => ({
      png: VALID_PNG,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 1,
      },
    }),
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      requirementPlantUml: [
        {
          diagramKind: "usecase",
          source: "@startuml\nactor 用户\n",
        },
      ],
      requirementSvgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>usecase</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 24,
            durationMs: 1,
          },
        },
      ],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"artifactKind":"document"/);
  assert.match(events.body, /"type":"completed"/);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.ok(
    !snapshot.missingArtifacts.some((item: string) => item.startsWith("usecase")),
  );

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
  });
  assert.equal(download.statusCode, 200);
  const entries = extractZipEntries(download.rawPayload);
  const mediaPngs = [...entries.keys()].filter((name) =>
    /^word\/media\/.+\.png$/.test(name),
  );
  assert.ok(mediaPngs.length > 0);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  const stylesXml = entries.get("word/styles.xml")?.toString("utf8") ?? "";
  const relsXml =
    entries.get("word/_rels/document.xml.rels")?.toString("utf8") ?? "";
  assert.match(
    download.headers["content-disposition"] ?? "",
    /%E9%9C%80%E6%B1%82%E8%A7%84%E6%A0%BC%E8%AF%B4%E6%98%8E%E4%B9%A6-\d{8}-\d{6}-\d{3}\.docx/,
  );
  assert.doesNotMatch(documentXml, /成都信息工程大学/);
  assert.doesNotMatch(documentXml, /软件工程学院/);
  assert.match(documentXml, /课程设计文档/);
  assert.match(documentXml, /目录/);
  assert.match(documentXml, /TOC/);
  assert.match(documentXml, /Heading1/);
  assert.match(documentXml, /Heading2/);
  assert.match(documentXml, /Heading3/);
  assert.match(documentXml, /2\.3 功能结构/);
  assert.match(documentXml, /2\.4 总体业务流程/);
  assert.match(documentXml, /3 功能需求（用例模型）/);
  assert.match(documentXml, /3\.1 用例图/);
  assert.match(documentXml, /3\.3 用例：生成模型/);
  assert.match(documentXml, /4 数据需求（领域概念模型）/);
  assert.match(documentXml, /编号/);
  assert.match(documentXml, /需求规则/);
  assert.match(documentXml, /模型元素/);
  assert.doesNotMatch(documentXml, /追踪依据/);
  assert.doesNotMatch(documentXml, /图示：/);
  assert.doesNotMatch(documentXml, /当前阶段未明确|待填写|待补充|待完善|后续评审/);
  assert.match(documentXml, /1 项目引言<\/w:t><w:tab\/><w:t(?: [^>]*)?>1<\/w:t>/);
  assert.match(documentXml, /3 功能需求（用例模型）<\/w:t><w:tab\/><w:t(?: [^>]*)?>\d+<\/w:t>/);
  assert.match(documentXml, /<w:pgNumType w:start="1"\/>/);
  assert.match(documentXml, /项目名称：未提供\/待确认/);
  assert.match(documentXml, /文档类型：需求规格说明书/);
  assert.match(documentXml, /文档版本：V1\.0/);
  assert.match(documentXml, /生成日期：\d{4}-\d{2}-\d{2}/);
  assert.match(documentXml, /图 用例图/);
  assert.match(stylesXml, /Times New Roman/);
  assert.match(stylesXml, /SimHei/);
  assert.match(stylesXml, /SimSun/);
  assert.match(stylesXml, /w:sz[^>]+w:val="32"/);
  assert.match(stylesXml, /w:spacing[^>]+w:before="260"/);
  assert.match(stylesXml, /w:spacing[^>]+w:after="260"/);
  assert.match(stylesXml, /w:spacing[^>]+w:line="415"/);
  assert.match(relsXml, /media\/.+\.png/);

  await app.close();
});

test("api software design document uses generic cover without school names", async () => {
  const app = await createTestApiServer();

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "softwareDesignSpec",
      requirementText: "根据设计产物生成软件设计说明书。",
      rules: JSON.parse(RULES_JSON).rules,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementPlantUml: [],
      requirementSvgArtifacts: [],
      designModels: [DESIGN_SEQUENCE_MODEL],
      designPlantUml: [],
      designSvgArtifacts: [],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: false,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"type":"completed"/);

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
  });
  assert.equal(download.statusCode, 200);
  const entries = extractZipEntries(download.rawPayload);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") ?? "";
  assert.doesNotMatch(documentXml, /成都信息工程大学/);
  assert.doesNotMatch(documentXml, /软件工程学院/);
  assert.match(documentXml, /课程设计文档/);
  assert.match(documentXml, /项目名称：未提供\/待确认/);
  assert.match(documentXml, /文档类型：软件设计说明书/);
  assert.match(documentXml, /文档版本：V1\.0/);
  assert.match(documentXml, /2\.1 系统总体逻辑流程设计/);
  assert.match(documentXml, /2\.2 系统架构设计/);
  assert.match(documentXml, /3 用例实现设计 \(Use Case Realization\)/);
  assert.match(documentXml, /3\.1 用例 生成模型 的实现方案/);
  assert.match(documentXml, /5 交互响应与前端组件设计/);
  assert.match(documentXml, /5\.3 跟踪关系/);
  assert.match(documentXml, /界面名称/);
  assert.match(documentXml, /4\.4 设计类跟踪矩阵/);
  assert.match(documentXml, /6 数据库设计/);
  assert.match(documentXml, /6\.2 表的详述/);
  assert.match(documentXml, /6\.3 表与表的关系详述/);
  assert.doesNotMatch(documentXml, /追踪依据/);
  assert.doesNotMatch(documentXml, /图示：/);
  assert.doesNotMatch(documentXml, /当前阶段未明确|待填写|待补充|待完善|后续评审/);

  await app.close();
});

test("api rejects legacy anonymous document workspace runs", async () => {
  const workspaceSuffix = Date.now().toString(36);
  const workspaceAHeaders = {
    "x-uml-workspace-id": `api-isolation-${workspaceSuffix}`,
    "x-uml-workspace-secret": "api-isolation-secret-value-123456",
  };
  const app = await createTestApiServer({ testRunAccessContext: undefined });

  try {
    const startResponse = await startProjectRun(app, {
      method: "POST",
      url: "/api/document-runs",
      headers: workspaceAHeaders,
      payload: {
        documentKind: "requirementsSpec",
        requirementText: "A 工作区需求说明书。",
        rules: [],
        requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
        requirementPlantUml: [],
        requirementSvgArtifacts: [],
        designModels: [],
        designPlantUml: [],
        designSvgArtifacts: [],
        providerSettings: MANAGED_PROVIDER_SETTINGS,
        useAiText: false,
      },
    });
    assert.equal(startResponse.statusCode, 401);
    assertApiErrorCode(startResponse, "AUTHENTICATION_REQUIRED");
  } finally {
    await app.close();
  }
});

test("api document commands reject SVG-only sources without current PlantUML", async () => {
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion() {
        yield JSON.stringify({
          sections: [
            {
              level: 1,
              title: "1 项目引言",
              body: ["说明项目背景。"],
              diagramKind: "usecase",
            },
          ],
        });
      },
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      requirementSvgArtifacts: [
        {
          diagramKind: "usecase",
          svg: "<svg><text>usecase</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: new Date().toISOString(),
            sourceLength: 24,
            durationMs: 1,
          },
        },
      ],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  }, { plantUml: {} });

  assert.equal(startResponse.statusCode, 409);
  assertApiErrorCode(startResponse, "REQUIREMENT_PLANTUML_MISSING");
  await app.close();
});

test("api repairs document content JSON before rendering DOCX", async () => {
  let attempts = 0;
  const chapterAttempts = new Map<string, number>();
  const prompts: string[] = [];
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ messages, runContext }) {
        const prompt = lastPromptText(messages);
        prompts.push(prompt);
        attempts += 1;
        const chapter = runContext?.subtaskId ?? "unknown";
        const count = (chapterAttempts.get(chapter) ?? 0) + 1;
        chapterAttempts.set(chapter, count);
        if (count === 1) {
          yield '{"sections":[{"level":4,"title":"","body":"bad"}]}';
          return;
        }
        assert.match(prompt, /修复上下文/);
        assert.match(prompt, /"level":4/);
        assert.match(prompt, /解析或校验错误/);
        const contextText = prompt.split("当前产物上下文：").at(-1)!.trim();
        const context = JSON.parse(contextText);
        yield JSON.stringify({ sections: context.canonicalSections.map((section: { level: number; title: string }) => ({ ...section, body: ["修复后的说明书正文。"] })) });
      },
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /说明书正文 JSON 结构不合法/);
  assert.match(events.body, /"type":"completed"/);
  assert.equal(attempts, chapterAttempts.size * 2);
  assert.ok(chapterAttempts.size > 1);
  assert.ok([...chapterAttempts.values()].every((count) => count === 2));
  assert.equal(prompts.length, attempts);

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.sections[0].title, "项目引言");
  const repairedSection = snapshot.sections.find(
    (section: { title: string }) => section.title === "需求概述",
  );
  assert.deepEqual(repairedSection?.body, ["修复后的说明书正文。"]);

  await app.close();
});

test("api fails document runs after document content repair attempts are exhausted", async () => {
  let attempts = 0;
  const chapterAttempts = new Map<string, number>();
  const app = await createTestApiServer({
    llmTransport: {
      async *streamChatCompletion({ responseFormat, runContext }) {
        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
        attempts += 1;
        const chapter = runContext?.subtaskId ?? "unknown";
        chapterAttempts.set(chapter, (chapterAttempts.get(chapter) ?? 0) + 1);
        yield '{"sections":[{"level":4,"title":"","body":"bad"}]}';
      },
    },
  });

  const startResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: true,
    },
  });

  assert.equal(startResponse.statusCode, 202);
  const runId = startResponse.json().runId;
  const events = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/events`,
  });
  assert.match(events.body, /"type":"failed"/);
  assert.equal(attempts, chapterAttempts.size * 6);
  assert.ok(chapterAttempts.size > 1);
  assert.ok([...chapterAttempts.values()].every((count) => count === 6));

  const snapshot = (
    await app.inject({
      method: "GET",
      url: `/api/document-runs/${runId}`,
    })
  ).json();
  assert.equal(snapshot.status, "failed");
  assert.match(snapshot.error.message, /generate_document_text structured output failed/);

  await app.close();
});

test("api document run rejects exports before the required models exist", async () => {
  const app = await createTestApiServer();

  const requirementsResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "requirementsSpec",
      requirementText: "根据需求生成说明书。",
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: false,
    },
  });
  assert.equal(requirementsResponse.statusCode, 409);
  assertApiErrorCode(requirementsResponse, "REQUIREMENT_MODELS_MISSING");

  const designResponse = await startProjectRun(app, {
    method: "POST",
    url: "/api/document-runs",
    headers: DOCUMENT_WORKSPACE_HEADERS,
    payload: {
      documentKind: "softwareDesignSpec",
      requirementText: "根据设计产物生成软件设计说明书。",
      requirementModels: [JSON.parse(USECASE_MODEL_JSON).models[0]],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
      useAiText: false,
    },
  });
  assert.equal(designResponse.statusCode, 409);
  assertApiErrorCode(designResponse, "DESIGN_MODELS_MISSING");

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

        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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

        if (prompt.includes("补充元素级可追踪关系")) {
          assert.equal(responseFormat?.type, "json_schema");
          traceabilityAttempts += 1;
          yield JSON.stringify({
            requirementModelTraceability: USECASE_REQUIREMENT_TRACEABILITY,
          });
          return;
        }

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
  assert.equal(snapshot.requirementModelTraceability.length, 3);
  assert.ok(
    snapshot.requirementModelTraceability.every(
      (entry: { target: { elementId: string } }) =>
        entry.target.elementId !== "boundary_platform",
    ),
  );
  assert.ok(
    snapshot.requirementTrace.some(
      (entry: { attempt: number; kind: string; errorMessage?: string }) =>
        entry.attempt === 1 &&
        entry.kind === "parse_error" &&
        /requirementModelTraceability/.test(entry.errorMessage ?? ""),
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
  ).length, 5);
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
          assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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

          assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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

        if (prompt.includes("请修复下面无法编译或返回占位 SVG 的 PlantUML")) {
          yield JSON.stringify({
            source: "@startuml\n|用户|\nstart\n:提交需求;\nstop\n",
          });
          return;
        }

        assert.equal(responseFormat?.type, runContext?.operation === "model_repair" ? "json_object" : "json_schema");
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

test("api rejects invalid start requests with 400", async () => {
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

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "实验平台根据文本需求生成模型和 UML 图。",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "",
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /providerSettings\.providerConfigId/i);

  const designResponse = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    payload: {
      requirementBaseline: TEST_REQUIREMENT_BASELINE,
      requirementModels: JSON.parse(USECASE_MODEL_JSON).models,
      requirementModelTraceability: [],
      selectedDiagrams: ["sequence"],
      providerSettings: MANAGED_PROVIDER_SETTINGS,
    },
  });

  assert.equal(designResponse.statusCode, 400);
  assert.match(designResponse.body, /requirementModelTraceability/i);

  await app.close();
});

test("api reports empty JSON request bodies as 400 instead of 500", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
  });

  const response = await app.inject({
    method: "DELETE",
    url: "/api/projects/project-a/documents/document-a",
    headers: {
      "content-type": "application/json",
    },
  });

  assert.equal(response.statusCode, 400);
  assertApiErrorCode(response, "VALIDATION_FAILED");

  await app.close();
});

test("api proxies manual PlantUML render requests", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "render_owner",
    displayName: "Render Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Render Project",

  });
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => ({
      svg: `<svg><text>${artifact.diagramKind}</text></svg>`,
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: artifact.source.length,
        durationMs: 4,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      diagramKind: "class",
      plantUmlSource: "@startuml\nclass User\n",
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.match(body.svg, /class/);
  assert.equal(body.renderMeta.sourceLength, "@startuml\nclass User\n".length);

  await app.close();
});

test("api rerenders structured use case models without calling the LLM", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "structured_render_owner",
    displayName: "Structured Render Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Structured Render Project",

  });
  let renderedSource = "";
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async (artifact) => {
      renderedSource = artifact.source;
      return {
        svg: `<svg><text>${artifact.diagramKind}:${artifact.source.includes("发起")}</text></svg>`,
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: artifact.source.length,
          durationMs: 4,
        },
      };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/model",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      stage: "requirements",
      model: {
        diagramKind: "usecase",
        title: "登录用例模型",
        summary: "教师登录系统。",
        notes: [],
        actors: [
          {
            id: "actor_teacher",
            name: "教师",
            actorType: "human",
            responsibilities: [],
          },
        ],
        useCases: [
          {
            id: "uc_login",
            systemBoundaryId: "system",
            name: "登录",
            goal: "进入系统",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [{ id: "system", name: "实验平台" }],
        relationships: [
          {
            id: "rel_login",
            type: "association",
            sourceId: "actor_teacher",
            targetId: "uc_login",
            label: "发起",
            description: "教师发起登录。",
          },
        ],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.match(body.plantUmlSource, /actor "教师"/);
  assert.match(body.plantUmlSource, /发起/);
  assert.equal(body.renderMeta.sourceLength, renderedSource.length);
  assert.match(body.svg, /usecase:true/);

  await app.close();
});

test("guest access seed creates a login-ready non-admin guest account without platform billing", async () => {
  const originalEnabled = process.env.UML_ENABLE_GUEST_ACCESS;
  const originalUsername = process.env.UML_GUEST_USERNAME;
  const originalPassword = process.env.UML_GUEST_PASSWORD;
  const originalDisplayName = process.env.UML_GUEST_DISPLAY_NAME;
  const originalDailyLimit = process.env.UML_GUEST_DAILY_LIMIT;
  process.env.UML_ENABLE_GUEST_ACCESS = "true";
  process.env.UML_GUEST_USERNAME = "guest";
  process.env.UML_GUEST_PASSWORD = "guest";
  process.env.UML_GUEST_DISPLAY_NAME = "Guest";
  process.env.UML_GUEST_DAILY_LIMIT = "9999";

  const authStore = createInMemoryAuthStore();
  const app = await createTestApiServer({ authStore });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        identifier: "guest",
        password: "guest",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().user.username, "guest");
    const guest = await authStore.findUserByUsername("guest");
    assert.deepEqual(guest?.systemRoles, []);
    assert.ok(guest);

  } finally {
    await app.close();
    if (originalEnabled === undefined) delete process.env.UML_ENABLE_GUEST_ACCESS;
    else process.env.UML_ENABLE_GUEST_ACCESS = originalEnabled;
    if (originalUsername === undefined) delete process.env.UML_GUEST_USERNAME;
    else process.env.UML_GUEST_USERNAME = originalUsername;
    if (originalPassword === undefined) delete process.env.UML_GUEST_PASSWORD;
    else process.env.UML_GUEST_PASSWORD = originalPassword;
    if (originalDisplayName === undefined) delete process.env.UML_GUEST_DISPLAY_NAME;
    else process.env.UML_GUEST_DISPLAY_NAME = originalDisplayName;
    if (originalDailyLimit === undefined) delete process.env.UML_GUEST_DAILY_LIMIT;
    else process.env.UML_GUEST_DAILY_LIMIT = originalDailyLimit;
  }
});

test("api rejects anonymous manual PlantUML render requests", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => {
      throw new Error("render should not be called");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    payload: {
      diagramKind: "class",
      plantUmlSource: "@startuml\nclass User\n",
    },
  });

  assert.equal(response.statusCode, 401);
  assertApiErrorCode(response, "AUTHENTICATION_REQUIRED");

  await app.close();
});

test("api reports manual PlantUML render failures clearly", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "render_failure_owner",
    displayName: "Render Failure Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Render Failure Project",

  });
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async () => {
      throw new Error("Syntax Error? (line 2)");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      diagramKind: "activity",
      plantUmlSource: "@startuml\nbroken\n",
    },
  });

  assert.equal(response.statusCode, 400);
  assertApiErrorCode(response, "VALIDATION_FAILED");

  await app.close();
});

test("api rejects invalid manual render requests with 400", async () => {
  const authStore = createInMemoryAuthStore();
  const user = await authStore.createUser({
    username: "render_invalid_owner",
    displayName: "Render Invalid Owner",
    passwordHash: "hash",
  });
  assert.ok(user);
  const session = await authStore.createSession({
    userId: user.id,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  const { project } = await authStore.createProject({
    ownerUserId: user.id,
    name: "Render Invalid Project",

  });
  const app = await createTestApiServer({
    authStore,
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/render/svg",
    headers: {
      cookie: `uml_session=${encodeURIComponent(session.id)}`,
      "x-uml-project-id": project.id,
    },
    payload: {
      diagramKind: "unknown",
      plantUmlSource: "",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /diagramKind|plantUmlSource/);

  await app.close();
});

test("api rejects plaintext provider connection tests by default", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (input) => {
    // Public catalog refreshes are independent of the provider access guard.
    if (new URL(input instanceof Request ? input.url : String(input)).hostname === "api.modelpedia.dev") {
      return new Response("catalog unavailable", { status: 503 });
    }
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const app = await createTestApiServer({
      llmTransport: createMockLlmTransport(),
      renderClient: async () => ({
        svg: "<svg />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: 0,
          durationMs: 1,
        },
      }),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/provider/test",
      payload: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "claude-opus-4-6-thinking",
      },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(fetchCalls, 0);
    assertApiErrorCode(response, "RESOURCE_NOT_FOUND");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api production startup requires DATABASE_URL unless stores are injected", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    await assert.rejects(
      () =>
        createTestApiServer({
          nodeEnv: "production",
        }),
      /DATABASE_URL is required in production/,
    );
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});

test("api rejects plaintext provider connection tests in production", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (input) => {
    // Production startup may refresh public metadata without calling the provider.
    if (new URL(input instanceof Request ? input.url : String(input)).hostname === "api.modelpedia.dev") {
      return new Response("catalog unavailable", { status: 503 });
    }
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const app = await createTestApiServer({
      llmTransport: createMockLlmTransport(),
      authStore: createInMemoryAuthStore(),
      providerConfigStore: createProviderConfigStore({
        secret: "test-secret",
      }),
      runRecordStore: createRunRecordStore(),
      documentLibrary: {} as DocumentLibrary,
      renderClient: async () => ({
        svg: "<svg />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: new Date().toISOString(),
          sourceLength: 0,
          durationMs: 1,
        },
      }),
      nodeEnv: "production",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/provider/test",
      payload: {
        apiBaseUrl: "https://ai.comfly.org",
        apiKey: "sk-test",
        model: "claude-opus-4-6-thinking",
      },
    });

    assert.equal(response.statusCode, 404);
    assert.equal(fetchCalls, 0);
    assertApiErrorCode(response, "RESOURCE_NOT_FOUND");

    await app.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api exposes health under root and /api for reverse proxy checks", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });

  const rootHealth = await app.inject({
    method: "GET",
    url: "/health",
  });
  const apiHealth = await app.inject({
    method: "GET",
    url: "/api/health",
  });

  assert.equal(rootHealth.statusCode, 200);
  assert.equal(apiHealth.statusCode, 200);
  assert.equal(rootHealth.json().status, "ok");
  assert.equal(apiHealth.json().status, "ok");

  await app.close();
});

test("api exposes version details under root and /api for deployment checks", async () => {
  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });

  const rootVersion = await app.inject({
    method: "GET",
    url: "/version",
  });
  const apiVersion = await app.inject({
    method: "GET",
    url: "/api/version",
  });

  assert.equal(rootVersion.statusCode, 200);
  assert.equal(apiVersion.statusCode, 200);

  for (const payload of [rootVersion.json(), apiVersion.json()]) {
    assert.equal(payload.status, "ok");
    assert.equal(payload.renderServiceBaseUrl, "http://127.0.0.1:4002");
    assert.equal(payload.features.supportsDesignTableDiagram, true);
    assert.equal(typeof payload.runtimeCwd, "string");
    assert.ok(payload.runtimeCwd.length > 0);
    assert.equal(typeof payload.startedAt, "string");
  }

  await app.close();
});

test("api applies the configured CORS origin allowlist", async () => {
  const originalCorsOrigins = process.env.API_CORS_ORIGINS;
  process.env.API_CORS_ORIGINS = "https://app.example.com,http://localhost:3000";

  const app = await createTestApiServer({
    llmTransport: createMockLlmTransport(),
    renderClient: async () => ({
      svg: "<svg />",
      renderMeta: {
        engine: "plantuml",
        generatedAt: new Date().toISOString(),
        sourceLength: 0,
        durationMs: 1,
      },
    }),
  });

  try {
    const allowed = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://app.example.com" },
    });
    const blocked = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://evil.example.com" },
    });

    assert.equal(allowed.statusCode, 200);
    assert.equal(
      allowed.headers["access-control-allow-origin"],
      "https://app.example.com",
    );
    assert.match(
      String(allowed.headers["access-control-expose-headers"] ?? ""),
      /Content-Disposition/i,
    );
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");
    assert.equal(blocked.statusCode, 200);
    assert.equal(blocked.headers["access-control-allow-origin"], undefined);
  } finally {
    await app.close();
    if (originalCorsOrigins === undefined) {
      delete process.env.API_CORS_ORIGINS;
    } else {
      process.env.API_CORS_ORIGINS = originalCorsOrigins;
    }
  }
});

function getSessionCookie(response: { headers: Record<string, unknown> }) {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : String(raw ?? "");
  assert.match(value, /uml_session=/);
  assert.match(value, /HttpOnly/i);
  assert.match(value, /SameSite=Lax/i);
  return value.split(";")[0];
}

function multipartAvatarPayload({
  boundary,
  contentType,
  fileName,
  content,
}: {
  boundary: string;
  contentType: string;
  fileName: string;
  content: Buffer;
}) {
  return Buffer.concat([
    Buffer.from(
      [
        `--${boundary}`,
        `Content-Disposition: form-data; name="avatar"; filename="${fileName}"`,
        `Content-Type: ${contentType}`,
        "",
        "",
      ].join("\r\n"),
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}
