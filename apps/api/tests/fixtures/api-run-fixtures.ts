// Supplies authenticated API servers and current model fixtures for integration scenarios.
import { requirementRuleFacts } from "@uml-platform/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import type { InjectOptions } from "fastify";

import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { LlmTransport, StreamChatCompletionInput } from "../../src/adapters/llm/llm-transport.js";
import { createApiServer } from "../../src/index.js";
import { createInMemoryAuthStore } from "../../src/auth/in-memory-auth-store.js";

import { createProviderConfigStore } from "../../src/provider-configs/provider-config-store.js";

import { buildRequirementBaseline } from "../../src/runs/baselines/requirement-baseline.js";
import { designInputFingerprint, snapshotInputFingerprint, type DesignDiagramModelSpec, type DiagramModelSpec } from "@uml-platform/contracts";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../src/adapters/plantuml/model-renderer.js";

import { TEST_RUN_ACCESS_CONTEXT, TEST_PROVIDER_CONFIG_ID, MANAGED_PROVIDER_SETTINGS, RULES_JSON, TEST_REQUIREMENT_BASELINE, CLASSIFIED_RULES_JSON, VALID_PNG, DOCUMENT_WORKSPACE_HEADERS, USECASE_MODEL_JSON, ACTIVITY_MODEL, PROTOTYPE_MODEL, CLASS_MODEL, MULTI_MODEL_JSON, USECASE_REQUIREMENT_TRACEABILITY, PROTOTYPE_REQUIREMENT_TRACEABILITY, CLASS_REQUIREMENT_TRACEABILITY, DESIGN_SEQUENCE_MODEL, DESIGN_SEQUENCE_JSON, DESIGN_NAVIGATION_JSON, DESIGN_CLASS_AND_TABLE_JSON } from "./api-models.js";

export function expectedResponseFormat(context: StreamChatCompletionInput["runContext"]) {
  const modelGeneration = ["extract_rules", "generate_models", "generate_design_models", "generate_design_sequence", "generate_context", "generate_business_flow", "generate_implementation"].includes(context?.stage ?? "");
  return modelGeneration ? "json_schema" : context?.operation === "model_repair" ? "json_object" : "json_schema";
}

export function assertApiErrorCode(response: { json(): unknown }, code: string) {
  const body = response.json() as { error?: { code?: string; retryable?: boolean } };
  assert.equal(body.error?.code, code);
  assert.equal(typeof body.error?.retryable, "boolean");
}

export function managedProviderSettings(model: string) {
  return {
    providerConfigId: TEST_PROVIDER_CONFIG_ID,
    model,
  };
}

export async function createTestApiServer(options?: Parameters<typeof createApiServer>[0]) {
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

export type TestApiServer = Awaited<ReturnType<typeof createTestApiServer>>;

export const fixtureAuthStores = new WeakMap<TestApiServer, ReturnType<typeof createInMemoryAuthStore>>();

export async function startProjectRun(app: TestApiServer, request: InjectOptions & { payload: Record<string, unknown> }, workspaceOverrides: Record<string, unknown> = {}) {
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

export async function waitForRunSnapshot(app: TestApiServer, url: string) {
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

export function lastPromptText(messages: Parameters<LlmTransport["streamChatCompletion"]>[0]["messages"]) {
  const content = messages.at(-1)?.content ?? "";
  if (typeof content === "string") return content;
  return content
    .map((part) => (part.type === "text" ? part.text : part.image_url.url))
    .join("\n");
}

export function extractZipEntries(buffer: Buffer) {
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

export function createMockLlmTransport(): LlmTransport {
  return {
    async *streamChatCompletion({messages, responseFormat, runContext }) {
      const prompt = lastPromptText(messages);

      if (prompt.includes("请基于本对话中上一版完整模型")) {
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        yield USECASE_MODEL_JSON;
        return;
      }

      if (prompt.includes("抽取结构化需求规则")) {
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        yield RULES_JSON;
        return;
      }

      if (prompt.includes("生成 UML 结构化模型")) {
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
      }

      yield USECASE_MODEL_JSON;
    },
  };
}

export function createRuleNormalizerMockLlmTransport(): LlmTransport {
  return {
    async *streamChatCompletion({messages, responseFormat, runContext }) {
      const prompt = lastPromptText(messages);

      if (prompt.includes("抽取结构化需求规则")) {
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
        yield CLASSIFIED_RULES_JSON;
        return;
      }

      if (prompt.includes("生成 UML 结构化模型")) {
        assert.equal(responseFormat?.type, expectedResponseFormat(runContext));
      }

      yield USECASE_MODEL_JSON;
    },
  };
}

export async function withCapturedConsoleError(
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

export { TEST_RUN_ACCESS_CONTEXT, TEST_PROVIDER_CONFIG_ID, MANAGED_PROVIDER_SETTINGS, RULES_JSON, TEST_REQUIREMENT_BASELINE, CLASSIFIED_RULES_JSON, VALID_PNG, DOCUMENT_WORKSPACE_HEADERS, USECASE_MODEL_JSON, ACTIVITY_MODEL, PROTOTYPE_MODEL, CLASS_MODEL, MULTI_MODEL_JSON, USECASE_REQUIREMENT_TRACEABILITY, PROTOTYPE_REQUIREMENT_TRACEABILITY, CLASS_REQUIREMENT_TRACEABILITY, DESIGN_SEQUENCE_MODEL, DESIGN_SEQUENCE_JSON, DESIGN_NAVIGATION_JSON, DESIGN_CLASS_AND_TABLE_JSON } from "./api-models.js";
