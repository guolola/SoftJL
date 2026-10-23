// Routes Pi native tool calls through the platform scheduler, provider policy and privacy-safe usage telemetry.
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import { randomUUID } from "node:crypto";
import { createAssistantMessageEventStream, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { ProviderSettings, ModelCapacity } from "@uml-platform/contracts";
import type { LlmScheduler, LlmScheduleContext } from "./llm-scheduler.js";
import type { RunTelemetryStore } from "../../runs/records/run-telemetry-store.js";
import { assertManagedProviderBaseUrlResolvesPublicly, normalizeManagedProviderBaseUrl } from "../../provider-configs/provider-url-policy.js";
import { resolveOpenAiBaseUrl } from "./llm-transport.js";
import { normalizeRunError } from "../../runs/pipelines/shared/errors.js";

function safePiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  // Preserve a recognizable, body-free overflow marker so Pi can compact and recover.
  if (/context[_ ](?:length|window)|maximum context|too many tokens|prompt is too long/i.test(message)) return "maximum context length exceeded";
  return normalizeRunError(error).message;
}

export function standardContextBudget(capacity?: ModelCapacity) {
  // Use the matched capacity automatically. An explicit operator budget may only reduce it.
  const configured = Number(process.env.UML_STANDARD_CONTEXT_TOKENS);
  const available = capacity?.context ?? 48000;
  return Number.isFinite(configured) && configured >= 1024 ? Math.min(Math.floor(configured), available) : available;
}

export function standardPiModel(settings: ProviderSettings, capacity?: ModelCapacity): Model<"openai-completions"> {
  const contextWindow = standardContextBudget(capacity);
  const reasoning = capacity?.capabilities?.reasoning === true;
  const deepseek = /^deepseek/i.test(settings.model);
  const qwen = /^qwen/i.test(settings.model);
  const zai = /^glm/i.test(settings.model);
  return { id: settings.model, name: settings.model, provider: "uml-managed", api: "openai-completions",
    baseUrl: resolveOpenAiBaseUrl(normalizeManagedProviderBaseUrl(settings.apiBaseUrl)), reasoning, input: capacity?.capabilities?.vision ? ["text", "image"] : ["text"],
    thinkingLevelMap: { off: "none" },
    contextWindow, maxTokens: Math.min(8192, capacity?.output ?? 8192, Math.floor(contextWindow / 3)), cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: reasoning, maxTokensField: "max_tokens",
      ...(deepseek ? { thinkingFormat: "deepseek" as const, requiresReasoningContentOnAssistantMessages: true }
        : qwen ? { thinkingFormat: "qwen" as const } : zai ? { thinkingFormat: "zai" as const } : {}) } };
}

export function createStandardPiStream(input: {
  settings: ProviderSettings; scheduler: LlmScheduler; context: LlmScheduleContext; signal: AbortSignal;
  beforeRequest: () => Promise<unknown>; analyticsStore?: RunTelemetryStore;
}): StreamFn {
  return (model, context, options) => {
    const output = createAssistantMessageEventStream();
    const queued = Date.now(); let started: number | null = null; let first: number | null = null; let last: number | null = null;
    let response: AssistantMessage | undefined;
    const signal = AbortSignal.any([input.signal, ...(options?.signal ? [options.signal] : []), AbortSignal.timeout(300000)]);
    void input.scheduler.run(input.context, async () => {
      signal.throwIfAborted();
      await input.beforeRequest();
      await assertManagedProviderBaseUrlResolvesPublicly(input.settings.apiBaseUrl);
      started = Date.now();
      for await (const event of streamSimple(model as Model<"openai-completions">, context, { ...options, signal, apiKey: input.settings.apiKey, maxRetryDelayMs: 5000,
        onPayload: async (payload, selected) => {
          const body = await options?.onPayload?.(payload, selected) ?? payload;
          // DeepSeek's UI exposes only its native thinking enabled/disabled switch.
          // Pi's internal enabled level must not become an unverified reasoning_effort parameter.
          if (selected.reasoning && selected.compat && "thinkingFormat" in selected.compat && selected.compat.thinkingFormat === "deepseek"
            && body && typeof body === "object") delete (body as Record<string, unknown>).reasoning_effort;
          return body;
        } })) {
        if (event.type === "text_delta" || event.type === "toolcall_delta") { first ??= Date.now(); last = Date.now(); }
        if (event.type === "done") response = event.message;
        if (event.type === "error") {
          response = { ...event.error, errorMessage: safePiError(new Error(event.error.errorMessage || "模型服务请求失败")) };
          output.push({ ...event, error: response });
        } else output.push(event);
      }
      if (!response) throw new Error("模型服务没有返回完整回复，请重试");
    }).catch(error => {
      response = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: signal.aborted ? "aborted" : "error", errorMessage: safePiError(error), timestamp: Date.now() };
      output.push({ type: "error", reason: signal.aborted ? "aborted" : "error", error: response });
    }).finally(async () => {
      output.end(response);
      const completed = Date.now(); const usage = response?.usage;
      await input.analyticsStore?.recordTelemetry({
        id: randomUUID(), runId: input.context.runId, projectId: input.context.projectId ?? null,
        userId: input.context.userId ?? null, providerConfigId: input.context.providerConfigId ?? null,
        model: model.id, taskType: input.context.taskType, stage: "standard_agent", diagramKind: null, subtaskId: null, requestedModelCount: null,
        queuedAt: new Date(queued).toISOString(), providerStartedAt: started ? new Date(started).toISOString() : null,
        firstReasoningAt: null, firstVisibleAt: first ? new Date(first).toISOString() : null, lastVisibleAt: last ? new Date(last).toISOString() : null,
        completedAt: new Date(completed).toISOString(), queueMs: started ? started - queued : null,
        providerTtftMs: first && started ? first - started : null, ttftMs: first ? first - queued : null,
        reasoningMs: null, decodeMs: first && last ? last - first : null, totalMs: completed - queued,
        usage: usage ? { inputTokens: usage.input, outputTokens: usage.output, cachedInputTokens: usage.cacheRead, reasoningTokens: null, totalTokens: usage.totalTokens } : null,
        outcome: signal.aborted ? "cancelled" : response?.stopReason === "error" ? "failed" : "success",
        statusCode: null, errorCategory: response?.stopReason === "error" ? "platform_provider" : null, retryCount: 0, formatFallbackCount: 0,
        usageUnavailableReason: usage ? null : "provider_usage_missing",
      });
    }).catch(() => { /* Analytics failure must not leave an already completed agent stream open. */ });
    return output;
  };
}
