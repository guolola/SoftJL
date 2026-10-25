// Verifies project-aware run route access without depending on future auth routes.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type {
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DesignRunSnapshot,
  DesignSvgArtifact,

  ProjectPermission,
  ProviderSettings,
  RequirementModelTraceabilityEntry,
  RequirementRule,
  RunEvent,
  RunSnapshot,
  SvgArtifact,
} from "@uml-platform/contracts";
import {
  designInputFingerprint,
  snapshotInputFingerprint,
  runTokenConsumptionSchema,
  feasibilityInputsSchema,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../adapters/llm/llm-transport.js";
import {
  createInMemoryLlmScheduler,
  type LlmScheduler,
} from "../../adapters/llm/llm-scheduler.js";
import type { RunQueue } from "../../runs/queue/run-queue.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { resolveDocumentRunInput } from "./run-input-resolution.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import { createRunRecordStore, emitEvent } from "../../runs/records/run-record-store.js";
import type { RunRecord } from "../../runs/records/run-record-store.js";
import {

  createEmptyDesignSnapshot,
  createEmptyDocumentSnapshot,
  createEmptyFeasibilitySnapshot,
  createEmptySnapshot,
} from "../../runs/records/snapshots.js";
import { registerRunRoutes, type RunAccessGuard } from "./register-run-routes.js";
import { ModelCatalog } from "../../provider-configs/model-catalog.js";
import { createProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type {
  ProviderLimitCheckInput,
  ProviderUsageInput,
  ProviderUsageTracker,
} from "../../provider-configs/provider-usage-tracker.js";
import { createGenerationUsageService } from "../../generation/generation-usage.js";
import { buildRequirementBaseline } from "../../runs/baselines/requirement-baseline.js";
import { createInMemoryRunTelemetryStore, type LlmRequestTelemetry } from "../../runs/records/run-telemetry-store.js";

const plaintextProviderSettings: ProviderSettings = {
  apiBaseUrl: "https://ai.comfly.org",
  apiKey: "sk-test",
  model: "gpt-5.5",
};

for (const reasoning of [true, false]) test(`model and document commands persist supported reasoning=${reasoning}`, async t => {
  const catalog = new ModelCatalog("unused-model-catalog.json");
  const supported = { context: 128000, output: 8192, source: "modelpedia" as const, matchedId: "gpt-5.5", updatedAt: null, capabilities: { vision: true, reasoning: true, toolCall: true } };
  catalog.resolve = () => supported;
  const { app, runs } = await createRunRouteTestContext({
    modelCatalog: catalog,
    runAccessGuard: createTestRunAccessGuard({ owner: { start_runs: ["project-a"], manage_documents: ["project-a"] } }),
    loadProjectWorkspace: async () => ({ state: createProjectWorkspaceState() }),
    completeRuns: false,
  });
  t.after(() => app.close());
  const headers = { "x-test-user-id": "owner", "x-test-project-id": "project-a" };
  const commands = [
    { url: "/api/runs", payload: { selectedDiagrams: ["usecase"] } },
    { url: "/api/design-runs", payload: { selectedDiagrams: ["sequence"] } },
    { url: "/api/document-runs", payload: { documentKind: "requirementsSpec" } },
  ];
  for (const { url, payload } of commands) {
    catalog.resolve = () => supported;
    const response = await app.inject({ method: "POST", url, payload: { projectId: "project-a", ...payload, reasoning }, headers });
    assert.equal(response.statusCode, 202, response.body);
    assert.equal((runs.get(response.json().runId)!.snapshot as { reasoning?: boolean }).reasoning, reasoning);
    catalog.resolve = () => ({ ...supported, capabilities: { ...supported.capabilities, reasoning: false } });
    const unsupported = await app.inject({ method: "POST", url, payload: { projectId: "project-a", ...payload, reasoning }, headers });
    assert.equal(unsupported.statusCode, 202, unsupported.body);
    assert.equal((runs.get(unsupported.json().runId)!.snapshot as { reasoning?: boolean }).reasoning, undefined);
  }
});

test("engineering run routes preserve attachments and reasoning, and reject unsupported capabilities before queuing", async t => {
  const catalog = new ModelCatalog("unused-model-catalog.json");
  catalog.resolve = () => ({ context: 128000, output: 8192, source: "modelpedia", matchedId: "gpt-5.5", updatedAt: null, capabilities: { vision: true, reasoning: true, toolCall: true } });
  const { app, runs } = await createRunRouteTestContext({
    modelCatalog: catalog,
    runAccessGuard: createTestRunAccessGuard({ owner: { start_runs: ["project-a"] } }),
    loadProjectWorkspace: async () => ({ state: { requirementText: "", rules: [] } }),
    completeRuns: false,
  });
  t.after(() => app.close());
  const image = { id: "i", name: "flow.png", type: "image", contentType: "image/png", data: "iVBORw0KGgo=" };
  const headers = { "x-test-user-id": "owner", "x-test-project-id": "project-a" };
  const payload = { projectId: "project-a", requirementText: "", selectedDiagrams: [], attachments: [image], reasoning: true };
  const started = await app.inject({ method: "POST", url: "/api/runs", payload, headers });
  assert.equal(started.statusCode, 202, started.body);
  const snapshot = runs.get(started.json().runId)!.snapshot as RunSnapshot;
  assert.deepEqual(snapshot.attachments, [image]);
  assert.equal(snapshot.submittedRequirementText, "");
  assert.equal(snapshot.reasoning, true);
  const prior = runs.size;
  catalog.resolve = () => ({ context: null, output: null, source: "unknown", matchedId: null, updatedAt: null });
  const unsupported = await app.inject({ method: "POST", url: "/api/runs", payload, headers });
  assert.equal(unsupported.statusCode, 400, unsupported.body);
  assert.equal(unsupported.json().error.code, "VALIDATION_FAILED");
  const noVision = await app.inject({ method: "POST", url: "/api/runs", payload: { ...payload, reasoning: false }, headers });
  assert.equal(noVision.statusCode, 400, noVision.body);
  assert.equal(noVision.json().error.code, "VALIDATION_FAILED");
  assert.equal(runs.size, prior);
});

test("run history batches whole-run consumption across workflow types and skips telemetry for progress polling", async t => {
  const analyticsStore = createInMemoryRunTelemetryStore();
  const baseList = analyticsStore.listTelemetry.bind(analyticsStore);
  let reads = 0;
  analyticsStore.listTelemetry = async filters => {
    reads++;
    assert.equal(filters.projectId, "project-a");
    assert.ok(filters.runIds?.length);
    return baseList(filters);
  };
  const { app, runs } = await createRunRouteTestContext({ analyticsStore,
    runAccessGuard: createTestRunAccessGuard({ owner: { view_runs: ["project-a"] } }),
  });
  t.after(() => app.close());
  const snapshots: RunRecord["snapshot"][] = [
    createEmptySnapshot("rules", "需求", []),
    createEmptyFeasibilitySnapshot("feasibility", { projectId: "project-a", selectedArtifacts: ["context"], providerSettings: { providerConfigId: "provider", model: "model" }, rules: [], requirementBaseline: null, inputs: feasibilityInputsSchema.parse({}) }),
    createEmptySnapshot("requirements", "需求", ["usecase"]),
    createEmptyDesignSnapshot("design", { selectedDiagrams: ["sequence"], requirementBaseline: buildRequirementBaseline({ runId: "design", requirementText: "需求", rules: [] }), requirementModels: [], requirementModelTraceability: [] }),
    createEmptyDocumentSnapshot("document", { documentKind: "requirementsSpec", requirementText: "需求" }),
  ];
  for (const [index, snapshot] of snapshots.entries()) {
    snapshot.status = index % 2 ? "failed" : "cancelled";
    runs.set(snapshot.runId, { snapshot, events: [], listeners: new Set(), terminal: true, metadata: { projectId: "project-a", userId: "owner", createdAt: "2026-10-17T00:00:00.000Z" } });
    const entry = { id: `${snapshot.runId}-initial`, runId: snapshot.runId, projectId: "project-a", providerConfigId: "provider", model: "model", taskType: ["requirements_to_uml", "feasibility_analysis", "requirements_to_uml", "design_modeling", "document_generation"][index],
      queuedAt: "2026-10-17T00:00:00.000Z", providerStartedAt: "2026-10-17T00:00:01.000Z", completedAt: "2026-10-17T00:00:02.000Z", outcome: "success",
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 30, reasoningTokens: 5 },
    } as LlmRequestTelemetry;
    await analyticsStore.recordTelemetry(entry);
    await analyticsStore.recordTelemetry({ ...entry, id: `${snapshot.runId}-repair`, providerConfigId: "other-provider", model: "other-model", outcome: "failed", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 0, reasoningTokens: 0 } });
    await analyticsStore.recordTelemetry({ ...entry, id: `${snapshot.runId}-cancel`, outcome: "cancelled", usage: null });
    await analyticsStore.recordTelemetry({ ...entry, id: `${snapshot.runId}-foreign`, projectId: "private" });
  }
  const headers = { "x-test-user-id": "owner" };
  const history = await app.inject({ url: "/api/projects/project-a/runs", headers });
  assert.equal(history.statusCode, 200, history.body);
  assert.equal(reads, 1, "all history rows share one scoped telemetry query");
  assert.equal(history.json().runs.length, 5);
  const expected = { totalTokens: 135, inputTokens: 110, outputTokens: 25, cachedInputTokens: 30, reasoningTokens: 5, calls: 3, unreportedCalls: 1 };
  for (const run of history.json().runs) assert.deepEqual(runTokenConsumptionSchema.parse(run.tokenConsumption), expected);
  const detail = await app.inject({ url: "/api/projects/project-a/runs/design", headers });
  assert.deepEqual(detail.json().run.tokenConsumption, expected);
  assert.equal(reads, 2);
  const progress = await app.inject({ url: "/api/projects/project-a/runs/design?view=progress&includeEvents=true", headers });
  assert.equal(progress.statusCode, 200, progress.body);
  assert.equal(progress.json().run.tokenConsumption, undefined);
  assert.equal(reads, 2, "frequent progress reads must not query consumption");
  const denied = await app.inject({ url: "/api/projects/private/runs/design", headers });
  assert.equal(denied.statusCode, 403);
  assert.equal(reads, 2);
});

function isZodLikeError(error: unknown): error is {
  issues: Array<{ message: string; path: Array<string | number> }>;
} {
  if (error instanceof ZodError) return true;
  const issues = (error as { issues?: unknown } | null)?.issues;
  return (
    Array.isArray(issues) &&
    issues.every((issue) => {
      const candidate = issue as
        | { message?: unknown; path?: unknown }
        | null;
      return (
        typeof candidate?.message === "string" &&
        Array.isArray(candidate.path)
      );
    })
  );
}

const minimalUseCaseModel = {
  diagramKind: "usecase",
  title: "用例模型",
  summary: "主要参与者和用例",
  notes: [],
  actors: [
    {
      id: "actor-user",
      name: "用户",
      actorType: "human",
      responsibilities: ["使用系统"],
    },
  ],
  useCases: [
    {
      id: "usecase-view",
      systemBoundaryId: "boundary-calendar",
      name: "查看活动",
      goal: "查看公开活动日历",
      preconditions: [],
      postconditions: ["活动列表已展示"],
      primaryActorId: "actor-user",
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [{ id: "boundary-calendar", name: "公众活动日历" }],
  relationships: [
    {
      id: "rel-view",
      sourceId: "actor-user",
      targetId: "usecase-view",
      type: "association",
      label: "查看",
    },
  ],
};

const workspaceRequirementRules: RequirementRule[] = [
  {
    id: "REQ-001",
    type: "functional" as const,
    text: "用户可以查看公开活动日历。",

  },
];

const workspaceRequirementBaseline = buildRequirementBaseline({
  runId: "workspace-baseline",
  requirementText: "用户可以查看公开活动日历。",
  rules: workspaceRequirementRules,
});

const workspaceRequirementTraceability: RequirementModelTraceabilityEntry[] = [
  {
    ruleId: "REQ-001",
    target: {
      diagramKind: "usecase",
      elementId: "usecase-view",
      elementKind: "useCase",
      label: "查看活动",
    },
  },
];

const minimalSequenceDesignModel: DesignDiagramModelSpec = {
  diagramKind: "sequence",
  modelId: "design-sequence-view",
  title: "查看活动时序",
  summary: "用户查询公开活动列表。",
  notes: [],
  participants: [
    {
      id: "participant-user",
      name: "用户",
      participantType: "actor",
    },
    {
      id: "participant-calendar",
      name: "活动服务",
      participantType: "service",
    },
  ],
  messages: [
    {
      id: "message-view",
      type: "sync",
      sourceId: "participant-user",
      targetId: "participant-calendar",
      name: "查看活动",
      parameters: [],
    },
  ],
  fragments: [],
};

const minimalDesignClassModel: DesignDiagramModelSpec = {
  diagramKind: "class",
  modelId: "class",
  title: "设计类图",
  summary: "保留的静态设计上下文。",
  notes: [],
  classes: [],
  interfaces: [],
  enums: [],
  relationships: [],
};

const workspaceDesignTraceability: DesignModelTraceabilityEntry[] = [
  {
    source: {
      diagramKind: "usecase",
      elementId: "usecase-view",
      elementKind: "useCase",
      label: "查看活动",
    },
    targets: [
      {
        modelId: "design-sequence-view",
        diagramKind: "sequence",
        elementId: "message-view",
        elementKind: "message",
        label: "查看活动",
      },
    ],

  },
];

const workspaceRequirementSvg: SvgArtifact = {
  diagramKind: "usecase",
  modelId: "requirement-usecase",
  svg: "<svg><text>usecase</text></svg>",
  renderMeta: {
    engine: "plantuml",
    generatedAt: "2026-06-10T00:00:00.000Z",
    sourceLength: 25,
    durationMs: 12,
  },
};

function workspaceDesignSvg(svg = "<svg><text>sequence</text></svg>"): DesignSvgArtifact {
  return {
    diagramKind: "sequence",
    modelId: "design-sequence-view",
    svg,
    renderMeta: {
      engine: "plantuml",
      generatedAt: "2026-06-10T00:00:00.000Z",
      sourceLength: 38,
      durationMs: 18,
    },
  };
}

function createProjectWorkspaceState(svg = "<svg><text>sequence</text></svg>") {
  return {
    requirementText: "用户可以查看公开活动日历。",
    rules: workspaceRequirementRules,
    requirementBaseline: workspaceRequirementBaseline,
    diagramInputFingerprints: { usecase: snapshotInputFingerprint({ requirementText: "用户可以查看公开活动日历。", rules: workspaceRequirementRules }) },
    models: {
      usecase: minimalUseCaseModel,
    },
    requirementModelTraceability: workspaceRequirementTraceability,
    plantUml: {
      usecase: "@startuml\nactor 用户\n",
    },
    svgArtifacts: {
      usecase: workspaceRequirementSvg,
    },
    designModels: {
      "sequence:view": minimalSequenceDesignModel,
    },
    designModelTraceability: workspaceDesignTraceability,
    designPlantUml: {
      "sequence:view": "@startuml\n用户 -> 活动服务: 查看活动\n",
    },
    designSvgArtifacts: {
      "sequence:view": workspaceDesignSvg(svg),
    },
    generatedDesignDiagramTypes: ["sequence"],
    designInputFingerprints: {
      "sequence:view": designInputFingerprint(
        [minimalUseCaseModel],
        workspaceRequirementTraceability,
      ),
    },

  };
}

test("retired requirement repair endpoints are unavailable and never call the provider", async () => {
  let providerCalls = 0;
  const app = await createRunRouteTestApp({ llmTransport: { async *streamChatCompletion() { providerCalls++; yield "{}"; } } });
  try {
    for (const url of ["/api/runs/requirement-rule-repair", "/api/runs/requirement-rule-repairs"]) {
      const response = await app.inject({ method: "POST", url, payload: {} });
      assert.equal(response.statusCode, 404);
    }
    assert.equal(providerCalls, 0);
  } finally { await app.close(); }
});

function stringHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}

function createTestRunAccessGuard(
  memberships: Record<string, Partial<Record<ProjectPermission, string[]>>>,
): RunAccessGuard {
  return {
    async resolveRunAccess(request) {
      return {
        userId: stringHeader(request, "x-test-user-id"),
        projectId: stringHeader(request, "x-test-project-id"),
      };
    },
    async canAccessProject({ userId, projectId, permission }) {
      return Boolean(
        userId && memberships[userId]?.[permission]?.includes(projectId),
      );
    },
  };
}

async function createRunRouteTestApp(options?: {
  runAccessGuard?: RunAccessGuard;
  providerConfigs?: ReturnType<typeof createProviderConfigStore>;
  resolveProjectName?: (projectId: string) => Promise<string | null | undefined>;
  providerUsageTracker?: ProviderUsageTracker;
  llmTransport?: LlmTransport;
  completeRuns?: boolean;
  documentLibrary?: DocumentLibrary;
  llmScheduler?: LlmScheduler;
  runStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runStagePipeline"];
  runDesignStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDesignStagePipeline"];
  runDocumentStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDocumentStagePipeline"];
  generationUsage?: Parameters<typeof registerRunRoutes>[0]["generationUsage"];
  loadProjectWorkspace?: Parameters<typeof registerRunRoutes>[0]["loadProjectWorkspace"];
  runQueue?: RunQueue;
  modelCatalog?: ModelCatalog;
  analyticsStore?: Parameters<typeof registerRunRoutes>[0]["analyticsStore"];
}) {
  return (await createRunRouteTestContext(options)).app;
}

async function createRunRouteTestContext(options?: {
  runAccessGuard?: RunAccessGuard;
  providerConfigs?: ReturnType<typeof createProviderConfigStore>;
  resolveProjectName?: (projectId: string) => Promise<string | null | undefined>;
  providerUsageTracker?: ProviderUsageTracker;
  llmTransport?: LlmTransport;
  completeRuns?: boolean;
  documentLibrary?: DocumentLibrary;
  llmScheduler?: LlmScheduler;
  runStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runStagePipeline"];
  runDesignStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDesignStagePipeline"];
  runDocumentStagePipeline?: Parameters<typeof registerRunRoutes>[0]["runDocumentStagePipeline"];
  generationUsage?: Parameters<typeof registerRunRoutes>[0]["generationUsage"];
  loadProjectWorkspace?: Parameters<typeof registerRunRoutes>[0]["loadProjectWorkspace"];
  runQueue?: RunQueue;
  modelCatalog?: ModelCatalog;
  analyticsStore?: Parameters<typeof registerRunRoutes>[0]["analyticsStore"];
}) {
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (isZodLikeError(error)) {
      reply.code(400).send({
        message: error.issues
          .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "request";
            return `${path}: ${issue.message}`;
          })
          .join("; "),
      });
      return;
    }
    throw error;
  });
  const runs = createRunRecordStore();
  const noOpLlmTransport = options?.llmTransport ?? ({} as LlmTransport);
  const noOpRenderClient = (async () => {
    throw new Error("render client should not be called by route tests");
  }) as RenderClient;
  const noOpPngRenderClient = noOpRenderClient as PngRenderClient;
  const noOpDocumentLibrary = options?.documentLibrary ?? ({} as DocumentLibrary);
  const defaultProviderConfigs =
    options?.providerConfigs ??
    createProviderConfigStore({
      secret: "test-secret",
    });
  const defaultProvider =
    options?.providerConfigs
      ? null
      : await defaultProviderConfigs.create({
          name: "测试托管模型",
          provider: "openai-compatible",
          baseUrl: "https://ai.comfly.org",
          apiKey: "sk-managed-test",
          defaultModel: "gpt-5.5",
          allowedModels: ["gpt-5.5"],
          modelCapabilities: {
            "gpt-5.5": {
              id: "gpt-5.5",
              category: "text_chat",
              supportsJsonSchema: true,
              supportsJsonObject: true,
              strictJson: true,
              structuredOutputMode: "strict_json",
              modeLabel: "严格 JSON",
              probeStatus: "strict",
              probedAt: "2026-07-29T00:00:00.000Z",
            },
          },
          createdBy: "test",
        });
  const completeQueuedRun = async (record: RunRecord) => {
    if (options?.completeRuns === false) return;
    record.snapshot.status = "completed";
    emitEvent(record, {
      type: "completed",
      snapshot: record.snapshot,
    } as RunEvent);
  };

  app.addHook("preValidation", async (request) => {
    if (!defaultProvider || !request.url.startsWith("/api/")) return;
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    const payload = body as { projectId?: unknown; providerSettings?: unknown };
    if (typeof payload.projectId !== "string" || "providerSettings" in payload) return;
    payload.providerSettings = {
      providerConfigId: defaultProvider.id,
      model: defaultProvider.defaultModel,
    };
  });

  registerRunRoutes({
    app,
    runs,
    documentLibrary: noOpDocumentLibrary,
    llmTransport: noOpLlmTransport,
    renderClient: noOpRenderClient,
    pngRenderClient: noOpPngRenderClient,
    defaultSseAllowOrigin: "http://localhost:3000",
    runStagePipeline: options?.runStagePipeline ?? completeQueuedRun,
    runDesignStagePipeline: options?.runDesignStagePipeline ?? completeQueuedRun,

    runDocumentStagePipeline: options?.runDocumentStagePipeline ?? (async () => undefined),

    runAccessGuard: options?.runAccessGuard ?? createTestRunAccessGuard({}),
    providerConfigs: defaultProviderConfigs,
    resolveProjectName: options?.resolveProjectName,
    providerUsageTracker: options?.providerUsageTracker,
    generationUsage: options?.generationUsage,
    llmScheduler: options?.llmScheduler,
    runQueue: options?.runQueue,
    modelCatalog: options?.modelCatalog,
    analyticsStore: options?.analyticsStore,
    loadProjectWorkspace: options?.loadProjectWorkspace ?? (async () => ({ state: createProjectWorkspaceState() })),
  });

  return { app, runs };
}

async function waitForRunStatus(
  runs: ReturnType<typeof createRunRecordStore>,
  runId: string,
  status: RunRecord["snapshot"]["status"],
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (runs.get(runId)?.snapshot.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(runs.get(runId)?.snapshot.status, status);
}


test("project run snapshots reject unauthenticated and cross-project users", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
      "user-b": { start_runs: ["project-b"], view_runs: ["project-b"] },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  assert.equal(startResponse.statusCode, 202);
  const { runId } = startResponse.json();

  const anonymousSnapshot = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
  });
  assert.equal(anonymousSnapshot.statusCode, 401);

  const crossProjectSnapshot = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-b",
    },
  });
  assert.equal(crossProjectSnapshot.statusCode, 403);

  const ownerSnapshot = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  assert.equal(ownerSnapshot.statusCode, 200);
  assert.equal(ownerSnapshot.json().runId, runId);

  await app.close();
});

test("open provider circuit returns retry timing and safe breaker diagnostics", async () => {
  const providerConfigs = createProviderConfigStore({
    secret: "open-circuit-route-test",
    breakerFailureThreshold: 3,
  });
  const provider = providerConfigs.create({
    name: "Platform Provider",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-open-circuit-route-test",
    defaultModel: "gpt-4.1",
    allowedModels: ["gpt-4.1"],
    createdBy: "admin-user",
  });
  providerConfigs.recordFailure?.(provider.id);
  providerConfigs.recordFailure?.(provider.id);
  providerConfigs.recordFailure?.(provider.id);
  const app = await createRunRouteTestApp({
    providerConfigs,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: { "x-test-user-id": "user-a" },
    payload: {
      projectId: "project-a",
      requirementText: "生成需求规则",
      selectedDiagrams: [],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-4.1",
      },
    },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "PROVIDER_CIRCUIT_OPEN");
  assert.equal(response.json().error.retryable, true);
  assert.equal(response.json().error.params.failureCount, 3);
  assert.ok(response.json().error.params.retryAfterSeconds >= 299);
  assert.equal(typeof response.json().error.params.openedAt, "string");
  assert.equal(typeof response.json().error.params.lastFailureAt, "string");
  assert.equal(response.json().error.params.probeStatus, "cooldown");
  assert.equal(response.json().error.details.breaker.probeStatus, "cooldown");
  assert.doesNotMatch(response.body, /sk-open-circuit-route-test/);
  await app.close();
});

test("project run starts reject frontend plaintext provider credentials", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: plaintextProviderSettings,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /providerSettings\.providerConfigId/i);

  await app.close();
});

test("project run starts can resolve managed provider config secrets", async () => {
  let resolvedProviderSettings: ProviderSettings | null = null;
  const usageInputs: ProviderUsageInput[] = [];
  const limitInputs: ProviderLimitCheckInput[] = [];
  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage(input) {
      usageInputs.push(input);
    },
    async checkLimit(input) {
      limitInputs.push(input);
      return {
        allowed: true,
        usedUnits: 0,
        remainingUnits: input.limit,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      };
    },
  };
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "教学模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "admin",
  });
  const app = Fastify({ logger: false });
  const runs = createRunRecordStore();
  const completeQueuedRun = async (
    record: RunRecord,
    resolved: ProviderSettings,
  ) => {
    resolvedProviderSettings = resolved;
    record.snapshot.status = "completed";
    emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
  };

  registerRunRoutes({
    app,
    runs,
    documentLibrary: {} as DocumentLibrary,
    loadProjectWorkspace: async () => ({ state: createProjectWorkspaceState() }),
    llmTransport: {} as LlmTransport,
    renderClient: (async () => {
      throw new Error("render client should not be called by route tests");
    }) as RenderClient,
    pngRenderClient: (async () => {
      throw new Error("png client should not be called by route tests");
    }) as PngRenderClient,
    defaultSseAllowOrigin: "http://localhost:3000",
    runStagePipeline: completeQueuedRun,
    runDesignStagePipeline: completeQueuedRun,

    runDocumentStagePipeline: async () => undefined,

    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
    providerUsageTracker,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 202);
  assert.deepEqual(resolvedProviderSettings, {
    apiBaseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    model: "gpt-5.5",
    modelCapability: provider.modelCapabilities["gpt-5.5"],
  });
  assert.deepEqual(usageInputs, [
    {
      userId: "user-a",
      projectId: "project-a",
      ipAddress: "127.0.0.1",
      providerConfigId: provider.id,
      taskType: "requirements_to_uml",
      outcome: "success",
    },
  ]);
  assert.deepEqual(limitInputs, [
    {
      userId: "user-a",
      projectId: "project-a",
      ipAddress: "127.0.0.1",
      providerConfigId: provider.id,
      taskType: "requirements_to_uml",
      limit: 60,
      windowSeconds: 60 * 60,
    },
  ]);

  await app.close();
});

test("project run rejects another user's private provider config", async () => {
  let resolvedProviderSettings: ProviderSettings | null = null;
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "用户 A 私有模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-user-a-private",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "user-a",
    scopeType: "user",
    scopeId: "user-a",
  });
  const app = await createRunRouteTestApp({
    providerConfigs,
    runAccessGuard: createTestRunAccessGuard({
      "user-b": { start_runs: ["project-b"], view_runs: ["project-b"] },
    }),
    runStagePipeline: async (_record, resolved) => {
      resolvedProviderSettings = resolved;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-b",
    },
    payload: {
      projectId: "project-b",
      requirementText: "项目 B 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(resolvedProviderSettings, null);
  assert.doesNotMatch(response.body, /user-a-private|sk-user-a-private/);

  await app.close();
});

test("project run rejects project-scoped provider config outside its project", async () => {
  let resolvedProviderSettings: ProviderSettings | null = null;
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "项目 A 私有模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-project-a-private",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "admin",
    scopeType: "project",
    scopeId: "project-a",
  });
  const app = await createRunRouteTestApp({
    providerConfigs,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a", "project-b"],
        view_runs: ["project-a", "project-b"],
      },
    }),
    runStagePipeline: async (_record, resolved) => {
      resolvedProviderSettings = resolved;
    },
  });

  const rejected = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-b",
      requirementText: "项目 B 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-5.5",
      },
    },
  });
  const accepted = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(rejected.statusCode, 400);
  assert.equal(accepted.statusCode, 202);
  assert.deepEqual(resolvedProviderSettings, {
    apiBaseUrl: "https://ai.comfly.org",
    apiKey: "sk-project-a-private",
    model: "gpt-5.5",
    modelCapability: provider.modelCapabilities["gpt-5.5"],
  });

  await app.close();
});

test("project run rejects missing personal provider settings instead of using project defaults", async () => {
  let resolvedProviderSettings: ProviderSettings | null = null;
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "项目默认模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-project-default",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "admin",
  });
  const app = Fastify({ logger: false });
  const runs = createRunRecordStore();
  const completeQueuedRun = async (
    record: RunRecord,
    resolved: ProviderSettings,
  ) => {
    resolvedProviderSettings = resolved;
    record.snapshot.status = "completed";
    emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
  };

  registerRunRoutes({
    app,
    runs,
    documentLibrary: {} as DocumentLibrary,
    loadProjectWorkspace: async () => ({ state: createProjectWorkspaceState() }),
    llmTransport: {} as LlmTransport,
    renderClient: (async () => {
      throw new Error("render client should not be called by route tests");
    }) as RenderClient,
    pngRenderClient: (async () => {
      throw new Error("png client should not be called by route tests");
    }) as PngRenderClient,
    defaultSseAllowOrigin: "http://localhost:3000",
    runStagePipeline: completeQueuedRun,
    runDesignStagePipeline: completeQueuedRun,

    runDocumentStagePipeline: async () => undefined,

    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "PROVIDER_CONFIG_INVALID");
  assert.equal(resolvedProviderSettings, null);
  assert.equal(Array.from(runs.values()).length, 0);

  await app.close();
});

test("project run starts enqueue records instead of executing the pipeline when a run queue is configured", async () => {
  const enqueuedRunIds: string[] = [];
  const runQueue: RunQueue = {
    enabled: true,
    async enqueueRun({ record }) {
      enqueuedRunIds.push(record.snapshot.runId);
    },
    async cancelRun() {
      return undefined;
    },
    attachEventPublisher() {
      return undefined;
    },
    async close() {
      return undefined;
    },
  };
  let pipelineCalls = 0;
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    runQueue,
    runStagePipeline: async () => {
      pipelineCalls += 1;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  const { runId } = response.json() as { runId: string };
  assert.deepEqual(enqueuedRunIds, [runId]);
  assert.equal(pipelineCalls, 0);
  assert.equal(runs.get(runId)?.snapshot.status, "queued");

  await app.close();
});

test("project run starts reject managed provider models not allowed by the config", async () => {
  let pipelineCalls = 0;
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "教学模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "admin",
  });
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
    completeRuns: false,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-6-unapproved",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "PROVIDER_MODEL_NOT_ALLOWED");
  assert.equal(pipelineCalls, 0);

  await app.close();
});

test("anonymous run starts are rejected before provider compatibility checks", async () => {
  const app = await createRunRouteTestApp({
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    payload: {
      requirementText: "匿名本地工作台需求",
      selectedDiagrams: ["usecase"],
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "AUTHENTICATION_REQUIRED");

  await app.close();
});

test("project run starts return 429 and do not call the pipeline when provider quota is exhausted", async () => {
  let pipelineCalls = 0;
  const usageInputs: ProviderUsageInput[] = [];
  const providerConfigs = createProviderConfigStore({
    secret: "test-secret",
  });
  const provider = await providerConfigs.create({
    name: "教学模型",
    provider: "openai-compatible",
    baseUrl: "https://ai.comfly.org",
    apiKey: "sk-managed",
    defaultModel: "gpt-5.5",
    allowedModels: ["gpt-5.5"],
    createdBy: "admin",
  });
  const app = Fastify({ logger: false });
  const runs = createRunRecordStore();
  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage(input) {
      usageInputs.push(input);
    },
    async checkLimit(input) {
      return {
        allowed: false,
        usedUnits: input.limit,
        remainingUnits: 0,
        limit: input.limit,
        windowSeconds: input.windowSeconds,
      };
    },
  };

  registerRunRoutes({
    app,
    runs,
    documentLibrary: {} as DocumentLibrary,
    loadProjectWorkspace: async () => ({ state: createProjectWorkspaceState() }),
    llmTransport: {} as LlmTransport,
    renderClient: (async () => {
      throw new Error("render client should not be called by route tests");
    }) as RenderClient,
    pngRenderClient: (async () => {
      throw new Error("png client should not be called by route tests");
    }) as PngRenderClient,
    defaultSseAllowOrigin: "http://localhost:3000",
    runStagePipeline: async () => {
      pipelineCalls += 1;
    },
    runDesignStagePipeline: async () => undefined,

    runDocumentStagePipeline: async () => undefined,

    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
    }),
    providerConfigs,
    providerUsageTracker,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
      providerSettings: {
        providerConfigId: provider.id,
        model: "gpt-5.5",
      },
    },
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.json().error.code, "RATE_LIMITED");
  assert.equal(pipelineCalls, 0);
  assert.equal(runs.size, 0);
  assert.deepEqual(usageInputs, []);

  await app.close();
});

test("project run SSE rejects cross-project users before opening the stream", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"], view_runs: ["project-a"] },
      "user-b": { start_runs: ["project-b"], view_runs: ["project-b"] },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  const { runId } = startResponse.json();

  const eventsResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      "x-test-user-id": "user-b",
      origin: "http://localhost:3000",
    },
  });

  assert.equal(eventsResponse.statusCode, 403);
  assert.notEqual(
    eventsResponse.headers["content-type"],
    "text/event-stream; charset=utf-8",
  );

  await app.close();
});

test("legacy no-context run records are not readable anonymously", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({}),
  });
  const legacyRunId = "legacy-no-context-run";

  runs.set(legacyRunId, {
    snapshot: {
      runId: legacyRunId,
      requirementText: "旧匿名运行",
      selectedDiagrams: ["usecase"],
      rules: [],
      models: [],
      requirementModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      currentStage: "extract_rules",
      status: "completed",
      errorMessage: null,
    },
    events: [],
    listeners: new Set(),
    terminal: true,
    metadata: undefined,
  });

  const snapshotResponse = await app.inject({
    method: "GET",
    url: `/api/runs/${legacyRunId}`,
  });

  assert.equal(snapshotResponse.statusCode, 401);
  assert.equal(snapshotResponse.json().error.code, "AUTHENTICATION_REQUIRED");

  await app.close();
});

test("project run starts require start_runs permission", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "viewer-a": { view_runs: ["project-a"] },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "viewer-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });

  assert.equal(response.statusCode, 403);

  await app.close();
});

test("project run history lists only runs for an authorized project member", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a", "project-b"],
        view_runs: ["project-a"],
      },
      "user-b": {
        view_runs: ["project-b"],
      },
    }),
  });

  const projectA = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  const projectB = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-b",
      requirementText: "项目 B 的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  assert.equal(projectA.statusCode, 202);
  assert.equal(projectB.statusCode, 202);

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const crossProjectHistory = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-b",
    },
  });

  assert.equal(history.statusCode, 200);
  assert.equal(history.json().runs.length, 1);
  const projectRun = history.json().runs[0];
  assert.equal(projectRun.runId, projectA.json().runId);
  assert.equal(projectRun.projectId, "project-a");
  assert.equal(projectRun.stage, "completed");
  assert.equal(projectRun.createdByUserId, "user-a");
  assert.equal(typeof projectRun.startedAt, "string");
  assert.equal(typeof projectRun.updatedAt, "string");
  assert.equal(projectRun.terminal, true);
  assert.equal(crossProjectHistory.statusCode, 403);

  await app.close();
});

test("retired code generation routes return normal 404 responses", async () => {
  const app = await createRunRouteTestApp();
  for (const [method, url] of [["POST", "/api/code-runs"], ["GET", "/api/code-runs/old-run"], ["GET", "/api/code-runs/old-run/events"]] as const) {
    const response = await app.inject({ method, url, ...(method === "POST" ? { payload: {} } : {}) });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error, "Not Found");
  }
  await app.close();
});

test("project run history exposes run kind for each snapshot type", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        view_runs: ["project-a"],
      },
    }),
  });
  const metadata = {
    userId: "user-a",
    projectId: "project-a",
    createdAt: "2026-05-22T02:00:00.000Z",
  };
  const records: RunRecord[] = [
    {
      snapshot: {
        ...createEmptySnapshot("run-requirements", "需求", ["usecase"]),
        currentStage: "render_svg",
        status: "completed",
      },
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata,
    },
    {
      snapshot: {
        ...createEmptyDesignSnapshot("run-design", {
          selectedDiagrams: ["sequence"],
          requirementBaseline: buildRequirementBaseline({
            runId: "run-design",
            requirementText: "需求",
            rules: [],
          }),
          requirementModels: [],
          requirementModelTraceability: [],
        }),
        currentStage: "render_svg",
        status: "completed",
      },
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata,
    },

    {
      snapshot: {
        ...createEmptyDocumentSnapshot("run-document", {
          documentKind: "requirementsSpec",
          requirementText: "需求",
        }),
        currentStage: "render_document_file",
        status: "completed",
      },
      events: [],
      listeners: new Set(),
      terminal: true,
      metadata,
    },
  ];
  for (const record of records) {
    runs.set(record.snapshot.runId, record);
  }

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(history.statusCode, 200);
  const runKinds = Object.fromEntries(
    history.json().runs.map((run: { runId: string; runKind: string }) => [
      run.runId,
      run.runKind,
    ]),
  );
  assert.deepEqual(runKinds, {
    "run-document": "document",

    "run-design": "design",
    "run-requirements": "requirements",
  });

  await app.close();
});

test("project run history exposes snapshot and document capabilities without embedding snapshots", async () => {
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
        manage_documents: ["project-a"],
      },
      "viewer-a": {
        view_runs: ["project-a"],
        view_documents: ["project-a"],
      },
    }),
    runDocumentStagePipeline: async (record) => {
      record.documentBuffer = Buffer.from("requirements document");
      Object.assign(record.snapshot, {
        status: "completed",
        currentStage: "render_document_file",
        documentId: "doc-1",
        fileName: "requirements.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 12,
        missingArtifacts: ["用例图：缺少可嵌入图片源"],
      });
      emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
    },
  });

  const started = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      useAiText: false,
    },
  });
  assert.equal(started.statusCode, 202);

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
  });
  assert.equal(history.statusCode, 200);
  const run = history.json().runs[0];
  assert.equal(run.snapshotAvailable, true);
  assert.equal("canRestore" in run, false);
  assert.equal(run.documentDownloadAvailable, true);
  assert.equal(run.missingArtifactCount, 1);
  assert.deepEqual(run.missingArtifactSummary, ["用例图：缺少可嵌入图片源"]);
  assert.equal("snapshot" in run, false);

  const viewerDownload = await app.inject({
    method: "GET",
    url: `/api/document-runs/${run.runId}/download`,
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });
  assert.equal(viewerDownload.statusCode, 200);

  await app.close();
});

test("project document run history detail and download use current library file name", async () => {
  const currentDocument = {
    id: "doc-renamed",
    workspaceId: "project-project-a",
    projectId: "project-a",
    createdByUserId: "user-a",
    documentKind: "requirementsSpec",
    title: "需求规格说明书",
    fileName: "requirements-renamed.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 21,
    version: 1,
    status: "active",
    sourceRunId: "run-document",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:05:00.000Z",
  };
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
        manage_documents: ["project-a"],
        view_documents: ["project-a"],
      },
    }),
    documentLibrary: {
      async getDocument(workspaceId, documentId) {
        return workspaceId === "project-project-a" && documentId === "doc-renamed"
          ? currentDocument
          : null;
      },
    } as DocumentLibrary,
    runDocumentStagePipeline: async (record) => {
      record.documentBuffer = Buffer.from("requirements document");
      Object.assign(record.snapshot, {
        status: "completed",
        currentStage: "render_document_file",
        documentId: "doc-renamed",
        fileName: "requirements-original.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 21,
      });
      emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
    },
  });

  const started = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      useAiText: false,
    },
  });
  assert.equal(started.statusCode, 202);
  const runId = started.json().runId as string;

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: { "x-test-user-id": "user-a" },
  });
  const detail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${runId}`,
    headers: { "x-test-user-id": "user-a" },
  });
  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
    headers: { "x-test-user-id": "user-a" },
  });

  assert.equal(history.statusCode, 200);
  assert.equal(history.json().runs[0].documentId, "doc-renamed");
  assert.equal(history.json().runs[0].documentFileName, "requirements-renamed.docx");
  assert.equal(history.json().runs[0].documentVersion, 1);
  assert.equal(history.json().runs[0].documentStatus, "active");
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().run.documentFileName, "requirements-renamed.docx");
  assert.equal(detail.json().snapshot.fileName, "requirements-original.docx");
  assert.equal(download.statusCode, 200);
  assert.match(
    download.headers["content-disposition"] as string,
    /requirements-renamed\.docx/u,
  );

  await app.close();
});

test("deleted project document disables source run history download even when run buffer remains", async () => {
  const deletedDocument = {
    id: "doc-deleted",
    workspaceId: "project-project-a",
    projectId: "project-a",
    createdByUserId: "user-a",
    documentKind: "requirementsSpec",
    title: "需求规格说明书",
    fileName: "requirements-deleted.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 21,
    version: 1,
    status: "deleted",
    sourceRunId: "run-document",
    createdAt: "2026-06-21T00:00:00.000Z",
    updatedAt: "2026-06-21T00:05:00.000Z",
  };
  let bufferLookups = 0;
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
        manage_documents: ["project-a"],
        view_documents: ["project-a"],
      },
    }),
    documentLibrary: {
      async getDocument(workspaceId, documentId, options) {
        return workspaceId === "project-project-a" &&
          documentId === "doc-deleted" &&
          options?.includeDeleted
          ? deletedDocument
          : null;
      },
      async getDocumentBuffer() {
        bufferLookups += 1;
        return Buffer.from("deleted document");
      },
    } as DocumentLibrary,
    runDocumentStagePipeline: async (record) => {
      record.documentBuffer = Buffer.from("in-memory deleted document");
      Object.assign(record.snapshot, {
        status: "completed",
        currentStage: "render_document_file",
        documentId: "doc-deleted",
        fileName: "requirements-original.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 21,
      });
      emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
    },
  });

  const started = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      useAiText: false,
    },
  });
  assert.equal(started.statusCode, 202);
  const runId = started.json().runId as string;

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: { "x-test-user-id": "user-a" },
  });
  const detail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${runId}`,
    headers: { "x-test-user-id": "user-a" },
  });
  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${runId}/download`,
    headers: { "x-test-user-id": "user-a" },
  });

  assert.equal(history.statusCode, 200);
  assert.equal(history.json().runs[0].documentDownloadAvailable, false);
  assert.equal(history.json().runs[0].documentStatus, "deleted");
  assert.equal(history.json().runs[0].documentRestoreAvailable, true);
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().run.documentDownloadAvailable, false);
  assert.equal(detail.json().run.documentStatus, "deleted");
  assert.equal(download.statusCode, 409);
  assert.equal(download.json().error.code, "DOCUMENT_RESTORE_REQUIRED");
  assert.equal(bufferLookups, 0);

  await app.close();
});

test("document run download falls back to persisted project document after run buffer is gone", async () => {
  const persistedDocument = Buffer.from("persisted requirements document");
  const documentLookups: Array<{ workspaceId: string; documentId: string }> = [];
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
        manage_documents: ["project-a"],
      },
      "viewer-a": {
        view_runs: ["project-a"],
        view_documents: ["project-a"],
      },
    }),
    documentLibrary: {
      async getDocument(workspaceId, documentId) {
        return workspaceId === "project-project-a" && documentId === "doc-persisted"
          ? {
              id: "doc-persisted",
              workspaceId,
              projectId: "project-a",
              createdByUserId: "user-a",
              documentKind: "requirementsSpec",
              title: "需求规格说明书",
              fileName: "persisted-requirements-renamed.docx",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              byteLength: persistedDocument.byteLength,
              version: 2,
              status: "active",
              sourceRunId: "run-document",
              createdAt: "2026-06-21T00:00:00.000Z",
              updatedAt: "2026-06-21T00:05:00.000Z",
            }
          : null;
      },
      async getDocumentBuffer(workspaceId, documentId) {
        documentLookups.push({ workspaceId, documentId });
        return documentId === "doc-persisted" ? persistedDocument : null;
      },
    } as DocumentLibrary,
    runDocumentStagePipeline: async (record) => {
      Object.assign(record.snapshot, {
        status: "completed",
        currentStage: "render_document_file",
        documentId: "doc-persisted",
        fileName: "persisted-requirements.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: persistedDocument.byteLength,
      });
      emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
    },
  });

  const started = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
      "x-test-project-id": "project-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      useAiText: false,
    },
  });
  assert.equal(started.statusCode, 202);

  const download = await app.inject({
    method: "GET",
    url: `/api/document-runs/${started.json().runId}/download`,
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });

  assert.equal(download.statusCode, 200);
  assert.equal(download.body, persistedDocument.toString());
  assert.match(
    download.headers["content-disposition"] as string,
    /persisted-requirements-renamed\.docx/u,
  );
  assert.deepEqual(documentLookups, [
    { workspaceId: "project-project-a", documentId: "doc-persisted" },
  ]);

  await app.close();
});

test("failed document runs with saved artifacts are not exposed as completed downloads", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "viewer-a": {
        view_runs: ["project-a"],
        view_documents: ["project-a"],
      },
    }),
  });
  const snapshot = createEmptyDocumentSnapshot("run-doc-failed", {
    documentKind: "requirementsSpec",
    requirementText: "失败后仍残留 DOCX 的说明书",
  });
  Object.assign(snapshot, {
    status: "failed",
    currentStage: "render_document_file",
    documentId: "doc-failed",
    fileName: "failed-requirements.docx",
    byteLength: 12,
    error: {
      code: "RUN_INTERNAL_ERROR",
      message: "证据包组装失败",
      category: "internal",
      retryable: true,
    },
  } satisfies Partial<typeof snapshot>);
  runs.set(snapshot.runId, {
    snapshot,
    events: [],
    listeners: new Set(),
    terminal: true,
    documentBuffer: Buffer.from("failed document"),
    metadata: {
      projectId: "project-a",
      userId: "user-a",
      createdAt: "2026-06-21T00:00:00.000Z",
      completedAt: "2026-06-21T00:01:00.000Z",
    },
  });

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });
  const download = await app.inject({
    method: "GET",
    url: "/api/document-runs/run-doc-failed/download",
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });

  assert.equal(history.statusCode, 200);
  assert.equal(history.json().runs[0].status, "failed");
  assert.equal(history.json().runs[0].documentDownloadAvailable, false);
  assert.equal(download.statusCode, 409);
  assert.equal(download.json().error.code, "DOCUMENT_RUN_NOT_COMPLETED");

  await app.close();
});

test("project run history marks terminal running records as interrupted", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
    completeRuns: false,
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "中断的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  const runId = response.json().runId as string;
  const record = runs.get(runId);
  assert.ok(record);
  record.snapshot.status = "running";
  record.snapshot.currentStage = "generate_models";
  record.terminal = true;

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(history.statusCode, 200);
  assert.equal(history.json().runs[0].status, "interrupted");
  assert.equal(history.json().runs[0].stage, "generate_models");

  await app.close();
});

test("project run history deletes only authorized terminal project records", async () => {
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
      "user-b": {
        start_runs: ["project-b"],
        view_runs: ["project-b"],
      },
    }),
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "待删除的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  const runId = startResponse.json().runId as string;

  const crossProjectDelete = await app.inject({
    method: "DELETE",
    url: `/api/projects/project-a/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-b",
    },
  });
  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/api/projects/project-a/runs/${runId}`,
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(crossProjectDelete.statusCode, 403);
  assert.equal(deleteResponse.statusCode, 204);
  assert.deepEqual(history.json().runs, []);

  await app.close();
});

test("project run history clears authorized terminal project records", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
      "user-b": {
        start_runs: ["project-b"],
        view_runs: ["project-b"],
      },
    }),
  });

  const startProjectRun = async (
    projectId: string,
    userId: string,
    requirementText: string,
  ) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: {
        "x-test-user-id": userId,
      },
      payload: {
        projectId,
        requirementText,
        selectedDiagrams: ["usecase"],
      },
    });
    assert.equal(response.statusCode, 202);
    const runId = response.json().runId as string;
    await waitForRunStatus(runs, runId, "completed");
    return runId;
  };

  const projectARunIds = [
    await startProjectRun("project-a", "user-a", "项目 A 需求 1"),
    await startProjectRun("project-a", "user-a", "项目 A 需求 2"),
  ];
  const projectBRunId = await startProjectRun(
    "project-b",
    "user-b",
    "项目 B 需求",
  );

  const crossProjectClear = await app.inject({
    method: "DELETE",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-b",
    },
  });
  const clearResponse = await app.inject({
    method: "DELETE",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const projectAHistory = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const projectBHistory = await app.inject({
    method: "GET",
    url: "/api/projects/project-b/runs",
    headers: {
      "x-test-user-id": "user-b",
    },
  });

  assert.equal(crossProjectClear.statusCode, 403);
  assert.equal(clearResponse.statusCode, 200);
  assert.deepEqual(
    clearResponse.json().deletedRunIds.sort(),
    projectARunIds.sort(),
  );
  assert.deepEqual(projectAHistory.json().runs, []);
  assert.deepEqual(
    projectBHistory.json().runs.map((run: { runId: string }) => run.runId),
    [projectBRunId],
  );

  await app.close();
});

test("project run history clear rejects active project records without deleting terminal records", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
    completeRuns: false,
  });

  const terminalSnapshot = createEmptySnapshot(
    "run-terminal",
    "已完成的需求",
    ["usecase"],
  );
  terminalSnapshot.status = "completed";
  const terminalRecord: RunRecord = {
    snapshot: terminalSnapshot,
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: {
      projectId: "project-a",
      userId: "user-a",
      createdAt: "2026-06-20T01:00:00.000Z",
    },
  };
  runs.set(terminalSnapshot.runId, terminalRecord);
  emitEvent(terminalRecord, {
    type: "completed",
    snapshot: terminalSnapshot,
  } as RunEvent);

  const activeResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "运行中的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  assert.equal(activeResponse.statusCode, 202);
  const activeRunId = activeResponse.json().runId as string;

  const clearResponse = await app.inject({
    method: "DELETE",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(clearResponse.statusCode, 409);
  assert.deepEqual(clearResponse.json().error.details.activeRunIds, [activeRunId]);
  assert.deepEqual(
    history.json().runs.map((run: { runId: string }) => run.runId).sort(),
    [activeRunId, "run-terminal"].sort(),
  );

  await app.close();
});

test("project document commands preserve the type and identity of custom-ID requirement sources", async () => {
  const workspace = createProjectWorkspaceState();
  const result = await resolveDocumentRunInput(
    { projectId: "project-a", documentKind: "requirementsSpec" },
    undefined,
    async () => ({ state: {
      ...workspace,
      models: { "custom-usecase": { ...minimalUseCaseModel, modelId: "custom-usecase" } },
      plantUml: { "custom-usecase": "@startuml\nactor 用户\n" },
      svgArtifacts: { "custom-usecase": { ...workspaceRequirementSvg, modelId: "custom-usecase" } },
    } }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.input.requirementPlantUml, [{ diagramKind: "usecase", modelId: "custom-usecase", source: "@startuml\nactor 用户\n" }]);
});

test("project document runs do not require legacy workspace credentials", async () => {
  let capturedWorkspaceId = "";
  const app = await createRunRouteTestApp({
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        manage_documents: ["project-a"],
      },
    }),
    runDocumentStagePipeline: async (
      _record,
      _input,
      _documentLibrary,
      workspaceId,
    ) => {
      capturedWorkspaceId = workspaceId;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "requirementsSpec",
      useAiText: true,
    },
  });

  assert.equal(response.statusCode, 202);
  assert.equal(capturedWorkspaceId, "project-project-a");

  await app.close();
});

test("repeated requirement model starts retain the project baseline identity", async () => {
  const state = createProjectWorkspaceState();
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({ "user-a": { start_runs: ["project-a"] } }),
    loadProjectWorkspace: async () => ({ state }),
  });
  const ids: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const response = await app.inject({ method: "POST", url: "/api/runs",
        headers: { "x-test-user-id": "user-a" }, payload: { projectId: "project-a", selectedDiagrams: ["usecase"] } });
      assert.equal(response.statusCode, 202, response.body);
      ids.push(response.json().runId);
      const snapshot = runs.get(ids.at(-1)!)!.snapshot as RunSnapshot;
      assert.deepEqual(snapshot.requirementBaseline, state.requirementBaseline);
      assert.equal(snapshot.requirementBaseline!.runId, "workspace-baseline");
    }
    assert.notEqual(ids[0], ids[1]);
  } finally { await app.close(); }
});

test("project design start command loads complete workspace input with large svg artifacts", async () => {
  const largeSvg = `<svg>${"x".repeat(1024 * 1024 + 32)}</svg>`;
  const loadedProjectIds: string[] = [];
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
      },
    }),
    loadProjectWorkspace: async (projectId) => {
      loadedProjectIds.push(projectId);
      return { state: createProjectWorkspaceState(largeSvg) };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      selectedDiagrams: ["class"],
      requestedDiagrams: ["class"],
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  assert.deepEqual(loadedProjectIds, ["project-a"]);
  const record = runs.get(response.json().runId);
  assert.ok(record);
  const snapshot = record.snapshot as DesignRunSnapshot;
  assert.equal(record.metadata?.projectId, "project-a");
  assert.equal(snapshot.status, "queued");
  assert.deepEqual(snapshot.selectedDiagrams, ["class"]);
  assert.deepEqual(snapshot.requestedDiagrams, ["class"]);
  assert.equal(snapshot.requirementBaseline.runId, "workspace-baseline");
  assert.equal(snapshot.requirementModels[0]?.diagramKind, "usecase");
  assert.equal(snapshot.requirementModelTraceability[0]?.ruleId, "REQ-001");
  assert.equal(snapshot.models[0]?.modelId, "design-sequence-view");
  assert.deepEqual(Object.keys(snapshot.designModelTraceability[0]!), ["source", "targets"]);
  assert.equal(snapshot.plantUml[0]?.source.includes("活动服务"), true);
  assert.equal(snapshot.svgArtifacts[0]?.svg, largeSvg);

  await app.close();
});

test("project design start command expands missing design dependencies before queuing", async () => {
  const state = {
    ...createProjectWorkspaceState(),
    designModels: {},
    designModelTraceability: [],
    designPlantUml: {},
    designSvgArtifacts: {},
  };
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
      },
    }),
    loadProjectWorkspace: async () => ({ state }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      selectedDiagrams: ["deployment"],
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  const snapshot = runs.get(response.json().runId)?.snapshot as DesignRunSnapshot;
  assert.deepEqual(snapshot.selectedDiagrams, [
    "class",
    "component",
    "deployment",
  ]);
  assert.deepEqual(snapshot.requestedDiagrams, ["deployment"]);
  assert.deepEqual(snapshot.models, []);
  assert.deepEqual(snapshot.plantUml, []);
  assert.deepEqual(snapshot.svgArtifacts, []);

  await app.close();
});

test("project design start command rejects stale requirement model sources before queuing", async () => {
  const staleWorkspaceState = createProjectWorkspaceState();
  const oldRequirementFingerprint = snapshotInputFingerprint({
    requirementText: "用户可以查看公开活动日历。",
    rules: workspaceRequirementRules,
  });
  staleWorkspaceState.requirementText = "用户可以查看公开活动日历，并按城市筛选。";
  staleWorkspaceState.requirementInputFingerprint = oldRequirementFingerprint;
  staleWorkspaceState.diagramInputFingerprints = {
    usecase: oldRequirementFingerprint,
  };
  staleWorkspaceState.generatedDiagramTypes = ["usecase"];
  staleWorkspaceState.rulesVersion = 2;
  staleWorkspaceState.diagramVersions = { usecase: 1 };
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
      },
    }),
    loadProjectWorkspace: async () => ({ state: staleWorkspaceState }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      selectedDiagrams: ["sequence"],
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "REQUIREMENT_MODELS_STALE");
  assert.deepEqual(response.json().error.details.diagramKinds, ["usecase"]);
  assert.equal(runs.size, 0);

  await app.close();
});

test("project design start command rejects custom-ID stale sources using the legacy shared fingerprint", async () => {
  const staleWorkspaceState = { ...createProjectWorkspaceState(), models: { "custom-usecase": { ...minimalUseCaseModel, modelId: "custom-usecase" } } };
  const oldRequirementFingerprint = snapshotInputFingerprint({
    requirementText: "用户可以查看公开活动日历。",
    rules: workspaceRequirementRules,
  });
  staleWorkspaceState.requirementText = "用户可以查看公开活动日历，并按城市筛选。";
  staleWorkspaceState.requirementInputFingerprint = oldRequirementFingerprint;
  staleWorkspaceState.diagramInputFingerprints = {};
  staleWorkspaceState.generatedDiagramTypes = ["usecase"];
  staleWorkspaceState.rulesVersion = 2;
  staleWorkspaceState.diagramVersions = {};
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
      },
    }),
    loadProjectWorkspace: async () => ({ state: staleWorkspaceState }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      selectedDiagrams: ["sequence"],
    },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "REQUIREMENT_MODELS_STALE");
  assert.deepEqual(response.json().error.details.diagramKinds, ["usecase"]);
  assert.equal(runs.size, 0);

  await app.close();
});

test("project-scoped generation commands reject incomplete workspace state before queuing", async () => {
  const cases = [
    {
      label: "requirements without requirement source",
      state: {
        ...createProjectWorkspaceState(),
        requirementText: "   ",
      },
      url: "/api/runs",
      payload: {
        projectId: "project-a",
        selectedDiagrams: ["usecase"],
      },
      code: "REQUIREMENT_SOURCE_MISSING",
    },
    {
      label: "design without requirement traceability",
      state: {
        ...createProjectWorkspaceState(),
        requirementModelTraceability: [],
      },
      url: "/api/design-runs",
      payload: {
        projectId: "project-a",
        selectedDiagrams: ["sequence"],
      },
      code: "REQUIREMENT_TRACEABILITY_MISSING",
    },


    {
      label: "requirements spec without requirement PlantUML",
      state: {
        ...createProjectWorkspaceState(),
        plantUml: {},
      },
      url: "/api/document-runs",
      payload: {
        projectId: "project-a",
        documentKind: "requirementsSpec",
        useAiText: false,
      },
      code: "REQUIREMENT_PLANTUML_MISSING",
    },
  ];

  for (const entry of cases) {
    const { app, runs } = await createRunRouteTestContext({
      completeRuns: false,
      runAccessGuard: createTestRunAccessGuard({
        "user-a": {
          start_runs: ["project-a"],
          manage_documents: ["project-a"],
        },
      }),
      loadProjectWorkspace: async () => ({ state: entry.state }),
    });

    const response = await app.inject({
      method: "POST",
      url: entry.url,
      headers: {
        "x-test-user-id": "user-a",
      },
      payload: entry.payload,
    });

    assert.equal(response.statusCode, 409, entry.label);
    assert.equal(response.json().error.code, entry.code, entry.label);
    assert.equal(runs.size, 0, entry.label);

    await app.close();
  }
});

test("project design start command filters old records for the replacing design kind", async () => {
  const state = createProjectWorkspaceState();
  state.designModels = {
    ...state.designModels,
    class: minimalDesignClassModel,
  };
  state.designPlantUml = {
    ...state.designPlantUml,
    class: "@startuml\nclass ExistingDesign\n",
  };
  state.designSvgArtifacts = {
    ...state.designSvgArtifacts,
    class: {
      diagramKind: "class",
      modelId: "class",
      svg: "<svg><text>class</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-06-10T00:00:00.000Z",
        sourceLength: 38,
        durationMs: 18,
      },
    },
  };
  state.designModelTraceability = [
    ...state.designModelTraceability,
    {
      source: {
        diagramKind: "usecase",
        elementId: "usecase-view",
        elementKind: "useCase",
        label: "查看活动",
      },
      targets: [
        {
          modelId: "class",
          diagramKind: "class",
          elementId: "ExistingDesign",
          elementKind: "class",
          label: "ExistingDesign",
        },
      ],

    },
  ];
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
      },
    }),
    loadProjectWorkspace: async () => ({ state }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      selectedDiagrams: ["sequence"],
      requestedDiagrams: ["sequence"],
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  const snapshot = runs.get(response.json().runId)?.snapshot as DesignRunSnapshot;
  assert.deepEqual(snapshot.models.map((model) => model.diagramKind), ["class"]);
  assert.deepEqual(snapshot.plantUml.map((artifact) => artifact.diagramKind), [
    "class",
  ]);
  assert.deepEqual(
    snapshot.svgArtifacts.map((artifact) => artifact.diagramKind),
    ["class"],
  );
  assert.equal(
    snapshot.designModelTraceability.some((entry) =>
      entry.targets.some((target) => target.diagramKind === "sequence"),
    ),
    false,
  );

  await app.close();
});

test("full generation payloads are rejected before queuing", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({ "user-a": { start_runs: ["project-a"], manage_documents: ["project-a"] } }),
  });
  const requests = [
    { url: "/api/runs", payload: { selectedDiagrams: ["usecase"], rules: workspaceRequirementRules } },
    { url: "/api/design-runs", payload: { selectedDiagrams: ["sequence"], requirementBaseline: workspaceRequirementBaseline,
      requirementModels: [minimalUseCaseModel], requirementModelTraceability: workspaceRequirementTraceability } },
    { url: "/api/document-runs", payload: { documentKind: "requirementsSpec", requirementText: "调用者提供的产物" } },
  ];
  for (const { url, payload } of requests) {
    const response = await app.inject({ method: "POST", url, headers: { "x-test-user-id": "user-a" },
      payload: { projectId: "project-a", ...payload } });
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal(runs.size, 0);
  await app.close();
});

test("project requirements start command builds current pipeline input from workspace", async () => {
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
      },
    }),
    loadProjectWorkspace: async () => ({ state: createProjectWorkspaceState() }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      selectedDiagrams: ["usecase"],
      analysisTargetUseCaseIds: ["usecase-view"],
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  const record = runs.get(response.json().runId);
  assert.ok(record);
  const snapshot = record.snapshot as RunSnapshot;
  assert.equal(snapshot.requirementText, "用户可以查看公开活动日历。");
  assert.deepEqual(snapshot.selectedDiagrams, ["usecase"]);
  assert.equal(snapshot.rules[0]?.id, "REQ-001");
  assert.equal(snapshot.models[0]?.diagramKind, "usecase");
  assert.equal(snapshot.requirementModelTraceability[0]?.ruleId, "REQ-001");
  assert.deepEqual(snapshot.analysisTargetUseCaseIds, ["usecase-view"]);

  await app.close();
});

test("project rules extraction accepts unsaved text when the workspace text is empty", async () => {
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": { start_runs: ["project-a"] },
    }),
    loadProjectWorkspace: async () => ({
      state: { ...createProjectWorkspaceState(), requirementText: "" },
    }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: { "x-test-user-id": "user-a" },
    payload: {
      projectId: "project-a",
      selectedDiagrams: [],
      requirementText: "读者可以预约座位。",
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  const record = runs.get(response.json().runId);
  assert.ok(record);
  assert.equal(record.snapshot.requirementText, "读者可以预约座位。");
  assert.deepEqual(record.snapshot.rules, []);
  await app.close();
});

test("project requirements analysis commands reject missing saved usecase models without starting runs", async () => {
  const workspaceState = {
    ...createProjectWorkspaceState(),
    models: {},
    requirementModelTraceability: [],
    plantUml: {},
    svgArtifacts: {},
  };
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({ "user-a": { start_runs: ["project-a"] } }),
    loadProjectWorkspace: async () => ({ state: workspaceState }),
  });
  try {
    for (const selectedDiagrams of [["analysis"], ["usecase", "analysis"]]) {
      const response = await app.inject({
        method: "POST", url: "/api/runs", headers: { "x-test-user-id": "user-a" },
        payload: { projectId: "project-a", selectedDiagrams },
      });
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(response.json().error.code, selectedDiagrams.length > 1 ? "MODEL_GENERATION_BATCH_CONFLICT" : "REQUIREMENT_MODELS_MISSING");
      if (selectedDiagrams.length === 1) assert.deepEqual(response.json().error.details.missingDiagrams, ["usecase"]);
    }
    assert.equal(runs.size, 0);
  } finally { await app.close(); }
});


test("project software design document command rejects incomplete design chain metadata", async () => {
  let documentPipelineCalled = false;
  const brokenState = {
    ...createProjectWorkspaceState(),
    designModelTraceability: [],
    designInputFingerprints: {},
  };
  const { app } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        manage_documents: ["project-a"],
      },
    }),
    loadProjectWorkspace: async () => ({ state: brokenState }),
    runDocumentStagePipeline: async () => {
      documentPipelineCalled = true;
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/document-runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      documentKind: "softwareDesignSpec",
      useAiText: false,
    },
  });

  assert.equal(response.statusCode, 409, response.body);
  assert.equal(response.json().error.code, "DESIGN_MODELS_INVALID");
  assert.equal(documentPipelineCalled, false);

  await app.close();
});

test("offline demo project start commands complete fixed artifacts without provider usage", async () => {
  const demoProjectId = "project-library-seat-demo";
  const previousDemoProjects = process.env.UML_DEMO_OFFLINE_PROJECT_IDS;
  const previousDemoProjectNames = process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS;
  const previousDemoStageDelay = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  process.env.UML_DEMO_OFFLINE_PROJECT_IDS = "";
  process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = "图书馆座位预约系统";
  process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = "0";
  let providerUsageCalls = 0;
  let providerLimitCalls = 0;
  let capturedDocumentInput:
    | Parameters<
        NonNullable<
          Parameters<typeof registerRunRoutes>[0]["runDocumentStagePipeline"]
        >
      >[1]
    | undefined;
  let capturedDocumentProvider: ProviderSettings | undefined;
  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage() {
      providerUsageCalls += 1;
      throw new Error("offline demo must not record provider usage");
    },
    async checkLimit() {
      providerLimitCalls += 1;
      throw new Error("offline demo must not check provider limits");
    },
  };
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: [demoProjectId],
        manage_documents: [demoProjectId],
      },
    }),
    providerUsageTracker,
    resolveProjectName: async (projectId) =>
      projectId === demoProjectId ? "图书馆座位预约系统" : "普通项目",
    loadProjectWorkspace: async () => ({ state: createProjectWorkspaceState() }),
    runDocumentStagePipeline: async (record, input, _documentLibrary, _workspaceId, providerSettings) => {
      capturedDocumentInput = input;
      capturedDocumentProvider = providerSettings;
      record.snapshot.status = "completed";
      emitEvent(record, { type: "completed", snapshot: record.snapshot } as RunEvent);
    },
  });

  try {
    const requirementResponse = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: {
        "x-test-user-id": "user-a",
      },
      payload: {
        projectId: demoProjectId,
        selectedDiagrams: ["usecase"],
      },
    });
    assert.equal(requirementResponse.statusCode, 202, requirementResponse.body);
    const requirementRunId = requirementResponse.json().runId;
    await waitForRunStatus(runs, requirementRunId, "completed");
    const requirementSnapshot = runs.get(requirementRunId)?.snapshot as RunSnapshot;
    assert.equal(requirementSnapshot.status, "completed");
    assert.equal(requirementSnapshot.rules.length, 11);
    assert.equal(
      requirementSnapshot.models.every((model) => model.diagramKind === "usecase"),
      true,
    );
    assert.deepEqual(
      requirementSnapshot.plantUml.map((artifact) => artifact.diagramKind),
      ["usecase"],
    );
    const usecasePlantUml = requirementSnapshot.plantUml.find(
      (artifact) => artifact.diagramKind === "usecase",
    );
    assert.ok(usecasePlantUml);
    assert.match(usecasePlantUml.source, /@startuml/);
    assert.match(usecasePlantUml.source, /actor "学生"/);
    assert.match(usecasePlantUml.source, /usecase "提交预约"/);
    const usecaseSvg = requirementSnapshot.svgArtifacts.find(
      (artifact) => artifact.diagramKind === "usecase",
    );
    assert.ok(usecaseSvg);
    assert.equal(usecaseSvg.renderMeta.engine, "plantuml");
    assert.equal(usecaseSvg.svg.includes("固定演示图"), false);
    assert.equal(usecaseSvg.svg.includes("离线演示 SVG"), false);

    const designResponse = await app.inject({
      method: "POST",
      url: "/api/design-runs",
      headers: {
        "x-test-user-id": "user-a",
      },
      payload: {
        projectId: demoProjectId,
        selectedDiagrams: ["sequence"],
      },
    });
    assert.equal(designResponse.statusCode, 202, designResponse.body);
    const designRunId = designResponse.json().runId;
    await waitForRunStatus(runs, designRunId, "completed");
    const designSnapshot = runs.get(designRunId)?.snapshot as DesignRunSnapshot;
    assert.equal(designSnapshot.status, "completed");
    assert.equal(
      designSnapshot.models.every((model) => model.diagramKind === "sequence"),
      true,
    );
    assert.equal(designSnapshot.designModelTraceability.length > 0, true);
    assert.equal(
      designSnapshot.designModelTraceability.every(
        (entry) => entry.source.diagramKind === "sequence",
      ),
      true,
    );

    const documentResponse = await app.inject({
      method: "POST",
      url: "/api/document-runs",
      headers: {
        "x-test-user-id": "user-a",
      },
      payload: {
        projectId: demoProjectId,
        documentKind: "softwareDesignSpec",
        useAiText: true,
      },
    });
    assert.equal(documentResponse.statusCode, 202, documentResponse.body);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(capturedDocumentInput);
    assert.equal(capturedDocumentInput.useAiText, false);
    assert.equal(
      capturedDocumentInput.requirementSvgArtifacts.some(
        (artifact) => artifact.diagramKind === "usecase",
      ),
      true,
    );
    const documentUsecaseSvg = capturedDocumentInput.requirementSvgArtifacts.find(
      (artifact) => artifact.diagramKind === "usecase",
    );
    assert.ok(documentUsecaseSvg);
    assert.equal(documentUsecaseSvg.renderMeta.engine, "plantuml");
    assert.equal(capturedDocumentInput.designModels.length > 0, true);
    assert.equal(capturedDocumentProvider?.model, "offline-demo-fixed-artifacts");
    assert.equal(providerUsageCalls, 0);
    assert.equal(providerLimitCalls, 0);
  } finally {
    if (previousDemoProjects === undefined) {
      delete process.env.UML_DEMO_OFFLINE_PROJECT_IDS;
    } else {
      process.env.UML_DEMO_OFFLINE_PROJECT_IDS = previousDemoProjects;
    }
    if (previousDemoProjectNames === undefined) {
      delete process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS;
    } else {
      process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = previousDemoProjectNames;
    }
    if (previousDemoStageDelay === undefined) {
      delete process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
    } else {
      process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS = previousDemoStageDelay;
    }
    await app.close();
  }
});

test("offline demo project name patterns do not affect unmatched projects", async () => {
  const previousDemoProjects = process.env.UML_DEMO_OFFLINE_PROJECT_IDS;
  const previousDemoProjectNames = process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS;
  process.env.UML_DEMO_OFFLINE_PROJECT_IDS = "";
  process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = "图书馆座位预约系统";
  let providerUsageCalls = 0;
  let providerLimitCalls = 0;
  const providerUsageTracker: ProviderUsageTracker = {
    async recordUsage(_input: ProviderUsageInput) {
      providerUsageCalls += 1;
    },
    async checkLimit(_input: ProviderLimitCheckInput) {
      providerLimitCalls += 1;
      return { allowed: true };
    },
  };
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: true,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["ordinary-project"],
      },
    }),
    providerUsageTracker,
    resolveProjectName: async () => "普通项目",
    loadProjectWorkspace: async () => ({ state: createProjectWorkspaceState() }),
  });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: {
        "x-test-user-id": "user-a",
      },
      payload: {
        projectId: "ordinary-project",
        selectedDiagrams: ["usecase"],
      },
    });

    assert.equal(response.statusCode, 202, response.body);
    await waitForRunStatus(runs, response.json().runId, "completed");
    assert.equal(providerLimitCalls, 1);
    assert.equal(providerUsageCalls, 1);
  } finally {
    if (previousDemoProjects === undefined) {
      delete process.env.UML_DEMO_OFFLINE_PROJECT_IDS;
    } else {
      process.env.UML_DEMO_OFFLINE_PROJECT_IDS = previousDemoProjects;
    }
    if (previousDemoProjectNames === undefined) {
      delete process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS;
    } else {
      process.env.UML_DEMO_OFFLINE_PROJECT_NAME_PATTERNS = previousDemoProjectNames;
    }
    await app.close();
  }
});


test("project run history supports detail and status filters for authorized members", async () => {
  const { app, runs } = await createRunRouteTestContext({
    completeRuns: false,
    runAccessGuard: createTestRunAccessGuard({
      "user-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
  });

  const completedRun = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "已完成的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  const failedRun = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "user-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "失败的需求",
      selectedDiagrams: ["class"],
    },
  });
  const completedRunId = completedRun.json().runId as string;
  const completedRecord = runs.get(completedRunId);
  assert.ok(completedRecord);
  completedRecord.snapshot.status = "completed";
  emitEvent(completedRecord, {
    type: "completed",
    snapshot: completedRecord.snapshot,
  } as RunEvent);
  const failedRunId = failedRun.json().runId as string;
  const failedRecord = runs.get(failedRunId);
  assert.ok(failedRecord);
  failedRecord.snapshot.status = "failed";
  failedRecord.snapshot.error = {
    code: "RUN_INTERNAL_ERROR",
    message: "LLM repair exhausted",
    category: "internal",
    retryable: false,
  };
  failedRecord.snapshot.diagramErrors.class = {
    stage: "render_svg",
    error: {
      code: "RUN_RENDER_FAILED",
      message: "PlantUML repair failed for class",
      category: "external",
      retryable: true,
    },
  };
  emitEvent(failedRecord, {
    type: "failed",
    error: failedRecord.snapshot.error,
  });

  const history = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs?status=failed",
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const detail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${failedRunId}`,
    headers: {
      "x-test-user-id": "user-a",
    },
  });
  const detailWithEvents = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${failedRunId}?includeEvents=true`,
    headers: {
      "x-test-user-id": "user-a",
    },
  });

  assert.equal(completedRun.statusCode, 202);
  assert.equal(failedRun.statusCode, 202);
  assert.equal(history.statusCode, 200);
  assert.deepEqual(
    history.json().runs.map((run: { runId: string }) => run.runId),
    [failedRunId],
  );
  assert.equal(history.json().runs[0].errorMessage, "LLM repair exhausted");
  assert.deepEqual(history.json().runs[0].selectedDiagrams, ["class"]);
  assert.equal(history.json().runs[0].diagramErrorCount, 1);
  assert.deepEqual(history.json().runs[0].diagramErrorSummary, [
    {
      diagramId: "class",
      stage: "render_svg",
      message: "PlantUML repair failed for class",
      error: {
        code: "RUN_RENDER_FAILED",
        message: "PlantUML repair failed for class",
        category: "external",
        retryable: true,
      },
    },
  ]);
  assert.equal(history.json().runs[0].partialFailure, true);
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().snapshot.runId, failedRunId);
  assert.equal(detail.json().snapshot.status, "failed");
  assert.equal(detail.json().events, undefined);
  assert.equal(detailWithEvents.json().events.at(-1).type, "failed");

  await app.close();
});

test("project task progress avoids transferring provider output or snapshots while full history and access checks remain available", async () => {
  const { app, runs } = await createRunRouteTestContext({ runAccessGuard: createTestRunAccessGuard({ "user-a": { view_runs: ["project-a"] } }) });
  const snapshot = createEmptySnapshot("large-history", "需求正文", ["usecase"]); snapshot.status = "completed";
  const started: RunEvent = { type: "run_activity", runId: snapshot.runId, callId: "call", eventId: "start", createdAt: "2026-10-12T00:00:00Z", stage: "generate_models", phase: "started", format: "technical" };
  const events: RunEvent[] = [started, ...Array.from({ length: 5000 }, (_, index): RunEvent => ({ ...started, eventId: `thought-${index}`, phase: "reasoning", text: "大量思考正文".repeat(10) })), { type: "completed", eventId: "terminal", snapshot }].map((event, index) => ({ ...event, sequence: index + 1, createdAt: "2026-10-12T00:00:00Z" }));
  runs.set(snapshot.runId, { snapshot, events, listeners: new Set(), terminal: true, metadata: { projectId: "project-a", userId: "user-a", createdAt: "2026-10-12T00:00:00Z" } });
  const url = `/api/projects/project-a/runs/${snapshot.runId}`;
  const progress = await app.inject({ method: "GET", url: `${url}?includeEvents=true&view=progress`, headers: { "x-test-user-id": "user-a" } });
  assert.equal(progress.statusCode, 200); assert.equal(progress.json().snapshot, undefined);
  assert.equal(progress.json().events.length, 2); assert.ok(progress.body.length < 10000); assert.doesNotMatch(progress.body, /大量思考正文|需求正文/);
  const full = await app.inject({ method: "GET", url: `${url}?includeEvents=true`, headers: { "x-test-user-id": "user-a" } });
  assert.equal(full.statusCode, 200); assert.equal(full.json().events.length, 5002); assert.equal(full.json().snapshot.requirementText, "需求正文");
  const denied = await app.inject({ method: "GET", url: `${url}?includeEvents=true&view=progress`, headers: { "x-test-user-id": "outsider" } });
  assert.equal(denied.statusCode, 403); assert.equal(events.length, 5002);
  await app.close();
});

test("project run cancel requires start permission, cancels scheduled work, records a terminal event, and is not repeatable", async () => {
  const cancelledRunIds: string[] = [];
  const { app } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "runner-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
      "viewer-a": {
        view_runs: ["project-a"],
      },
    }),
    completeRuns: false,
    llmScheduler: {
      run: async (_context, task) => task(),
      stream: (_context, task) => task(),
      cancelRun: (runId) => {
        cancelledRunIds.push(runId);
      },
      snapshot: () => ({ running: 0, queued: 0 }),
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "runner-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "可取消的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  const runId = startResponse.json().runId as string;

  const viewerCancel = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${runId}/cancel`,
    headers: {
      "x-test-user-id": "viewer-a",
    },
  });
  const cancel = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${runId}/cancel`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const duplicateCancel = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${runId}/cancel`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const detail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${runId}?includeEvents=true`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const sseHistory = await app.inject({
    method: "GET",
    url: `/api/runs/${runId}/events`,
    headers: {
      "x-test-user-id": "runner-a",
      origin: "http://localhost:3000",
    },
  });

  assert.equal(viewerCancel.statusCode, 403);
  assert.equal(cancel.statusCode, 200);
  assert.equal(cancel.json().action, "cancel");
  assert.equal(cancel.json().status, "cancelled");
  assert.deepEqual(cancelledRunIds, [runId]);
  assert.equal(duplicateCancel.statusCode, 409);
  assert.equal(detail.json().snapshot.status, "cancelled");
  assert.equal(detail.json().events.at(-1).type, "cancelled");
  assert.match(sseHistory.body, /"type":"queued"/);
  assert.match(sseHistory.body, /"type":"cancelled"/);

  await app.close();
});

test("project retry accepts a completed batch with failed diagrams and preserves its scope", async () => {
  const requirementText = "用户可以查看图书并接收通知。";
  const pipelineRunIds: string[] = [];
  const { app, runs } = await createRunRouteTestContext({
    loadProjectWorkspace: async () => ({ state: { requirementText, rules: [] } }),
    runAccessGuard: createTestRunAccessGuard({ "runner-a": { start_runs: ["project-a"], view_runs: ["project-a"] } }),
    completeRuns: false,
    runStagePipeline: async (record) => { pipelineRunIds.push(record.snapshot.runId); },
  });
  try {
    const headers = { "x-test-user-id": "runner-a" };
    const start = await app.inject({ method: "POST", url: "/api/runs", headers, payload: { projectId: "project-a", requirementText, selectedDiagrams: ["usecase", "activity"] } });
    assert.equal(start.statusCode, 202, start.body);
    const source = runs.get(start.json().runId)!;
    assert.ok("diagramErrors" in source.snapshot);
    source.snapshot.diagramErrors.activity = { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "render", retryable: true, message: "绘图器故障" } };
    source.snapshot.status = "completed";
    emitEvent(source, { type: "completed", snapshot: source.snapshot } as RunEvent);
    const retry = await app.inject({ method: "POST", url: `/api/projects/project-a/runs/${source.snapshot.runId}/retry`, headers });
    assert.equal(retry.statusCode, 202, retry.body);
    const next = runs.get(retry.json().runId)!.snapshot as RunSnapshot;
    assert.deepEqual(next.selectedDiagrams, ["activity"]);
    assert.deepEqual(next.requestedDiagrams, ["activity"]);
    assert.ok(pipelineRunIds.includes(next.runId));
    assert.equal(source.snapshot.status, "completed");
  } finally { await app.close(); }
});

test("task retries start their pipeline while retired history reruns return 404", async () => {
  const pipelineRunIds: string[] = [];
  const { app } = await createRunRouteTestContext({
    loadProjectWorkspace: async () => ({ state: { requirementText: "需要重试的需求", rules: [] } }),
    runAccessGuard: createTestRunAccessGuard({
      "runner-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
    completeRuns: false,
    runStagePipeline: async (record) => {
      pipelineRunIds.push(record.snapshot.runId);
    },
  });

  const startResponse = await app.inject({
    method: "POST",
    url: "/api/runs",
    headers: {
      "x-test-user-id": "runner-a",
    },
    payload: {
      projectId: "project-a",
      requirementText: "需要重试的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  const sourceRunId = startResponse.json().runId as string;
  await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${sourceRunId}/cancel`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });

  const retry = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${sourceRunId}/retry`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const rerun = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/${sourceRunId}/rerun`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const retryDetail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${retry.json().runId}`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const sourceDetail = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/${sourceRunId}?includeEvents=true`,
    headers: {
      "x-test-user-id": "runner-a",
    },
  });
  const projectRuns = await app.inject({
    method: "GET",
    url: "/api/projects/project-a/runs",
    headers: {
      "x-test-user-id": "runner-a",
    },
  });

  assert.equal(retry.statusCode, 202);
  assert.equal(rerun.statusCode, 404);
  assert.notEqual(retry.json().runId, sourceRunId);
  assert.equal(retry.json().sourceRunId, sourceRunId);
  assert.equal(retryDetail.json().snapshot.status, "queued");
  assert.equal(retryDetail.json().snapshot.requirementText, "需要重试的需求");
  assert.equal(retryDetail.json().run.sourceRunId, sourceRunId);
  assert.equal(retryDetail.json().run.sourceAction, "retry");
  assert.equal(retryDetail.json().run.sourceRunStatus, "cancelled");
  assert.equal(sourceDetail.json().snapshot.status, "cancelled");
  assert.deepEqual(sourceDetail.json().run.derivedRunIds, [
    retry.json().runId,
  ]);
  assert.equal(sourceDetail.json().run.latestAction, "retry");
  assert.equal(sourceDetail.json().run.latestActionRunId, retry.json().runId);
  assert.equal(sourceDetail.json().events.at(-1).type, "run_action");
  const runs = projectRuns.json().runs as Array<{
    runId: string;
    sourceRunId: string | null;
    sourceAction: string | null;
    sourceRunStatus: string | null;
    derivedRunIds: string[];
    latestAction: string | null;
    latestActionRunId: string | null;
  }>;
  const sourceSummary = runs.find((run) => run.runId === sourceRunId);
  const retrySummary = runs.find((run) => run.runId === retry.json().runId);
  assert.deepEqual(sourceSummary?.derivedRunIds, [
    retry.json().runId,
  ]);
  assert.equal(sourceSummary?.latestAction, "retry");
  assert.equal(sourceSummary?.latestActionRunId, retry.json().runId);
  assert.equal(retrySummary?.sourceRunId, sourceRunId);
  assert.equal(retrySummary?.sourceAction, "retry");
  assert.equal(retrySummary?.sourceRunStatus, "cancelled");
  assert.deepEqual(pipelineRunIds, [
    sourceRunId,
    retry.json().runId,
  ]);

  await app.close();
});

test("removed run evidence and review routes return 404", async () => {
  const { app } = await createRunRouteTestContext();
  const legacyEvidencePath = ["evi", "dence"].join("");
  const legacyReviewPath = ["review", "decisions"].join("-");

  const evidenceResponse = await app.inject({
    method: "GET",
    url: `/api/projects/project-a/runs/run-legacy/${legacyEvidencePath}`,
  });
  const reviewResponse = await app.inject({
    method: "POST",
    url: `/api/projects/project-a/runs/run-legacy/${legacyReviewPath}`,
    payload: {
      reviewItemId: "REV-001",
      decision: "approved",
      comment: "legacy request",
    },
  });

  assert.equal(evidenceResponse.statusCode, 404);
  assert.equal(reviewResponse.statusCode, 404);

  await app.close();
});


test("guest project run starts return 429 after the visitor daily generation limit", async () => {
  let pipelineCalls = 0;
  const generationUsage = createGenerationUsageService({
    guestUsername: "guest",
    guestDailyLimit: 1,
    now: () => new Date("2026-05-25T08:00:00.000Z"),
  });
  const app = await createRunRouteTestApp({
    generationUsage,
    runAccessGuard: {
      async resolveRunAccess(request) {
        return {
          userId: "guest-user",
          projectId: stringHeader(request, "x-test-project-id"),
          username: "guest",
        };
      },
      async canAccessProject({ projectId }) {
        return projectId === "project-a";
      },
    },
    runStagePipeline: async () => {
      pipelineCalls += 1;
    },
  });

  const first = await app.inject({
    method: "POST",
    url: "/api/runs",
    remoteAddress: "203.0.113.10",
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  assert.equal(first.statusCode, 202);

  const second = await app.inject({
    method: "POST",
    url: "/api/runs",
    remoteAddress: "203.0.113.10",
    payload: {
      projectId: "project-a",
      requirementText: "项目 A 的需求",
      selectedDiagrams: ["usecase"],
    },
  });
  assert.equal(second.statusCode, 429);
  assert.equal(second.json().error.code, "RATE_LIMITED");
  assert.equal(pipelineCalls, 1);

  await app.close();
});

test("design LLM scheduler completion keeps the subtask running while output is parsed", async () => {
  const { app, runs } = await createRunRouteTestContext({
    runAccessGuard: createTestRunAccessGuard({
      "reviewer-a": {
        start_runs: ["project-a"],
        view_runs: ["project-a"],
      },
    }),
    llmScheduler: createInMemoryLlmScheduler({
      globalConcurrency: 1,
      providerConcurrency: 1,
      projectConcurrency: 1,
      userConcurrency: 1,
      runConcurrency: 1,
    }),
    llmTransport: {
      async *streamChatCompletion() {
        yield "{}";
      },
    },
    runDesignStagePipeline: async (record, providerSettings, llmTransport) => {
      record.snapshot.status = "running";
      record.snapshot.currentStage = "generate_design_models";
      for await (const _chunk of llmTransport.streamChatCompletion({
        providerSettings,
        messages: [
          {
            role: "user",
            content: "只生成以下设计图类型：\nclass",
          },
        ],
      })) {
        // The route-level scheduler emits status events while the pipeline consumes output.
      }
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/design-runs",
    headers: { "x-test-user-id": "reviewer-a" },
    payload: {
      projectId: "project-a",
      selectedDiagrams: ["class"],
    },
  });

  assert.equal(response.statusCode, 202, response.body);
  const record = runs.get(response.json().runId);
  assert.ok(record);
  const startedAt = Date.now();
  while (
    Date.now() - startedAt < 1000 &&
    !record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.message === "模型调用完成，正在解析结果",
    )
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(
    record.events.some(
      (event) =>
        event.type === "stage_progress" &&
        event.subtaskId === "class" &&
        event.subtaskStatus === "running" &&
        event.message === "模型调用完成，正在解析结果",
    ),
  );

  await app.close();
});
