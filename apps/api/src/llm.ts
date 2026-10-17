// Provides LLM transport helpers, provider request shaping, and response parsing boundaries for API pipelines.
import type { ProviderSettings } from "@uml-platform/contracts";
import OpenAI, { APIError } from "openai";
import { reasoningRequestOptions } from "./adapters/llm/reasoning-options.js";
import { assertManagedProviderBaseUrlResolvesPublicly, normalizeManagedProviderBaseUrl, type ProviderHostnameResolver, } from "./provider-configs/provider-url-policy.js";
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming, ChatCompletionMessageParam, } from "openai/resources/chat/completions";
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string | Array<{
        type: "text";
        text: string;
    } | {
        type: "image_url";
        image_url: {
            url: string;
        };
    }>;
}
export interface JsonObjectResponseFormat {
    type: "json_object";
}
export interface JsonSchemaResponseFormat {
    type: "json_schema";
    json_schema: {
        name: string;
        strict: true;
        schema: Record<string, unknown>;
    };
}
export type ChatCompletionResponseFormat = JsonObjectResponseFormat | JsonSchemaResponseFormat;
export interface ResponseFormatFallbackEvent {
    from: "strict_json";
    to: "json_object";
    status: number;
    reason: string;
}
export interface StreamChatCompletionInput {
    // Explicit output reservation used by engineering context admission checks.
    maxOutputTokens?: number;
    // Internal per-call attribution survives concurrent pipeline stage changes.
    runContext?: {
        stage?: import("@uml-platform/contracts").RunStage;
        diagramKind?: string;
        subtaskId?: string;
        subtaskLabel?: string;
    };
    providerSettings: ProviderSettings;
    reasoning?: boolean;
    messages: ChatMessage[];
    responseFormat?: ChatCompletionResponseFormat | null;
    abortSignal?: AbortSignal;
    onResponseFormatFallback?: (event: ResponseFormatFallbackEvent) => void;
    onTokenUsage?: (usage: StreamTokenUsage) => void;
    onReasoningChunk?: (chunk: string) => void;
    // The provider's raw reasoning and its optional public summary remain separate streams.
    onReasoningSummary?: (chunk: string) => void;
    onUsageUnavailable?: (reason: string) => void;
}
export interface StreamTokenUsage {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    reasoningTokens: number | null;
    totalTokens: number | null;
}
export interface LlmTransport {
    streamChatCompletion(input: StreamChatCompletionInput): AsyncIterable<string>;
}
export interface ProviderDiscoveredModel {
    id: string;
    object?: string;
    created?: number | null;
    ownedBy?: string | null;
}
interface OpenAiRequestOptions {
    signal?: AbortSignal;
}
type OpenAiChatCompletionResult = ChatCompletion | AsyncIterable<ChatCompletionChunk>;
interface OpenAiCompatibleClient {
    chat: {
        completions: {
            create: (body: ChatCompletionCreateParamsStreaming | ChatCompletionCreateParamsNonStreaming, options?: OpenAiRequestOptions) => Promise<OpenAiChatCompletionResult>;
        };
    };
    models: {
        list: (options?: OpenAiRequestOptions) => Promise<{
            data?: unknown[];
        }>;
    };
}
export type OpenAiCompatibleClientFactory = (input: {
    apiKey: string;
    baseURL: string;
    timeoutMs: number;
}) => OpenAiCompatibleClient;
export interface RealProviderClientOptions {
    responseTimeoutMs?: number;
    clientFactory?: OpenAiCompatibleClientFactory;
    resolveHostname?: ProviderHostnameResolver;
}
const DEFAULT_LLM_RESPONSE_TIMEOUT_MS = 300000;
function resolveChatCompletionsUrl(baseUrl: string) {
    return new URL("/v1/chat/completions", baseUrl).toString();
}
export function resolveOpenAiBaseUrl(baseUrl: string) {
    const url = new URL(baseUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    if (!normalizedPath || normalizedPath === "/") {
        url.pathname = "/v1";
    }
    else if (normalizedPath.toLowerCase().endsWith("/v1")) {
        url.pathname = normalizedPath;
    }
    else {
        url.pathname = `${normalizedPath}/v1`;
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
}
export class ProviderHttpError extends Error {
    readonly status: number;
    readonly detail: string | null;
    constructor({ status, detail, message, }: {
        status: number;
        detail: string | null;
        message: string;
    }) {
        super(message);
        this.name = "ProviderHttpError";
        this.status = status;
        this.detail = detail;
    }
}
async function normalizeOpenAiCompatibleErrorResponse(response: Response) {
    if (response.ok)
        return response;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json"))
        return response;
    try {
        const payload = JSON.parse(await response.clone().text()) as {
            error?: unknown;
            message?: unknown;
        };
        if (payload.error !== undefined)
            return response;
        if (typeof payload.message !== "string" || !payload.message.trim()) {
            return response;
        }
        const headers = new Headers(response.headers);
        headers.set("content-type", "application/json");
        return new Response(JSON.stringify({ error: { message: payload.message.trim() } }), {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
    catch {
        return response;
    }
}
function blockProviderRedirectResponse(response: Response) {
    if (response.status < 300 || response.status >= 400)
        return response;
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify({
        error: {
            message: "Provider request redirected; configure the final reviewed public HTTPS endpoint",
        },
    }), {
        status: 400,
        statusText: "Provider Redirect Blocked",
        headers,
    });
}
function createOpenAiCompatibleClient({ apiKey, baseURL, timeoutMs, }: {
    apiKey: string;
    baseURL: string;
    timeoutMs: number;
}): OpenAiCompatibleClient {
    const client = new OpenAI({
        apiKey,
        baseURL,
        timeout: timeoutMs,
        maxRetries: 0,
        fetch: async (input, init) => normalizeOpenAiCompatibleErrorResponse(blockProviderRedirectResponse(await fetch(input, { ...init, redirect: "manual" }))),
    });
    return {
        chat: {
            completions: {
                create: (body, options) => client.chat.completions.create(body as ChatCompletionCreateParamsStreaming, options) as unknown as Promise<OpenAiChatCompletionResult>,
            },
        },
        models: {
            list: (options) => client.models.list(options) as unknown as Promise<{
                data?: unknown[];
            }>,
        },
    };
}
async function assertProviderBaseUrlSafe(baseUrl: string, resolveHostname?: ProviderHostnameResolver) {
    // Revalidate immediately before outbound traffic so saved domains cannot later resolve to private infrastructure.
    return assertManagedProviderBaseUrlResolvesPublicly(baseUrl, resolveHostname);
}
function summarizeErrorText(text: string) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized)
        return null;
    return normalized.slice(0, 240);
}
async function readErrorDetail(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";
    const rawText = await response.text();
    const textSummary = summarizeErrorText(rawText);
    if (contentType.includes("application/json")) {
        try {
            const payload = JSON.parse(rawText) as {
                message?: unknown;
                error?: {
                    message?: unknown;
                } | unknown;
            };
            if (typeof payload.message === "string" && payload.message.trim()) {
                return payload.message.trim();
            }
            if (typeof payload.error === "object" &&
                payload.error !== null &&
                "message" in payload.error &&
                typeof payload.error.message === "string" &&
                payload.error.message.trim()) {
                return payload.error.message.trim();
            }
        }
        catch {
            // Fall back to raw text summary below.
        }
    }
    return textSummary;
}
function readOpenAiErrorDetail(error: unknown) {
    const payload = (error ?? {}) as {
        error?: unknown;
        message?: unknown;
    };
    const nestedError = payload.error;
    if (typeof nestedError === "string") {
        return summarizeErrorText(nestedError);
    }
    if (typeof nestedError === "object" && nestedError !== null) {
        const nestedMessage = (nestedError as {
            message?: unknown;
        }).message;
        if (typeof nestedMessage === "string" && nestedMessage.trim()) {
            return summarizeErrorText(nestedMessage);
        }
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
        return summarizeErrorText(payload.message);
    }
    return null;
}
function readOpenAiErrorStatus(error: unknown) {
    if (error instanceof APIError && typeof error.status === "number") {
        return error.status;
    }
    const status = (error as {
        status?: unknown;
    } | null)?.status;
    return typeof status === "number" ? status : null;
}
function timeoutError(timeoutMs: number) {
    return new Error(`LLM request timed out after ${timeoutMs}ms`);
}
function effectiveResponseFormat(responseFormat: ChatCompletionResponseFormat | null | undefined) {
    if (responseFormat === null)
        return null;
    return responseFormat ?? { type: "json_object" as const };
}
function isJsonSchemaResponseFormat(responseFormat: ChatCompletionResponseFormat | null): responseFormat is JsonSchemaResponseFormat {
    return responseFormat?.type === "json_schema";
}
function shouldRetryJsonSchemaAsJsonObject(status: number, detail: string | null) {
    if (status !== 400 && status !== 422)
        return false;
    const normalized = (detail ?? "").toLowerCase();
    if (!normalized)
        return false;
    const mentionsSchema = normalized.includes("response_format") ||
        normalized.includes("json_schema") ||
        normalized.includes("json schema") ||
        normalized.includes("schema") ||
        normalized.includes("strict");
    const looksUnsupported = normalized.includes("unsupported") ||
        normalized.includes("not support") ||
        normalized.includes("not supported") ||
        normalized.includes("does not support") ||
        normalized.includes("invalid") ||
        normalized.includes("unrecognized") ||
        normalized.includes("unknown") ||
        normalized.includes("not allowed") ||
        normalized.includes("not permitted");
    return mentionsSchema && looksUnsupported;
}
function shouldRetryWithoutStreamUsage(status: number, detail: string | null) {
    if (status !== 400 && status !== 422)
        return false;
    const normalized = (detail ?? "").toLowerCase();
    if (!normalized)
        return false;
    const mentionsUsage = normalized.includes("stream_options") ||
        normalized.includes("include_usage") || normalized.includes("include usage");
    const looksUnsupported = normalized.includes("unsupported") ||
        normalized.includes("not support") || normalized.includes("invalid") ||
        normalized.includes("unrecognized") || normalized.includes("unknown") ||
        normalized.includes("not allowed") || normalized.includes("unexpected");
    return mentionsUsage && looksUnsupported;
}
function formatHttpProviderError(prefix: string, status: number, detail: string | null) {
    return detail
        ? `${prefix} with HTTP ${status}: ${detail}`
        : `${prefix} with HTTP ${status}`;
}
function toProviderHttpError(error: unknown, prefix: string) {
    const status = readOpenAiErrorStatus(error);
    if (status === null)
        return null;
    const detail = readOpenAiErrorDetail(error);
    return new ProviderHttpError({
        status,
        detail,
        message: formatHttpProviderError(prefix, status, detail),
    });
}
function normalizeProviderError(error: unknown, prefix: string) {
    return toProviderHttpError(error, prefix) ?? (error instanceof Error ? error : new Error(String(error)));
}
function warnJsonSchemaFallback(model: string, status: number, detail: string | null) {
    console.warn([
        "[llm-json-schema-fallback]",
        `model=${model}`,
        `status=${status}`,
        `reason=${summarizeErrorText(detail ?? "") ?? "provider rejected json_schema"}`,
    ].join(" "));
}
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timer = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            timedOut = true;
            onTimeout();
            reject(timeoutError(timeoutMs));
        }, timeoutMs);
    });
    try {
        return await Promise.race([promise, timer]);
    }
    catch (error) {
        if (timedOut) {
            throw timeoutError(timeoutMs);
        }
        throw error;
    }
    finally {
        if (timeout)
            clearTimeout(timeout);
    }
}
async function* withIdleTimeout<T>(source: AsyncIterable<T>, timeoutMs: number, onTimeout: () => void) {
    const iterator = source[Symbol.asyncIterator]();
    let timedOut = false;
    try {
        while (true) {
            const result = await withTimeout(iterator.next(), timeoutMs, () => {
                timedOut = true;
                onTimeout();
            });
            if (result.done)
                return;
            yield result.value;
        }
    }
    finally {
        if (timedOut) {
            void iterator.return?.().catch(() => undefined);
        }
    }
}
export async function* parseChatCompletionSse(response: Response) {
    if (!response.ok) {
        const detail = await readErrorDetail(response);
        throw new Error(detail
            ? `LLM request failed with HTTP ${response.status}: ${detail}`
            : `LLM request failed with HTTP ${response.status}`);
    }
    if (!response.body) {
        throw new Error("LLM response body is empty");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        while (true) {
            const separatorIndex = buffer.indexOf("\n\n");
            if (separatorIndex < 0)
                break;
            const rawBlock = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            const data = rawBlock
                .split(/\r?\n/)
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n")
                .trim();
            if (!data)
                continue;
            if (data === "[DONE]")
                return;
            const payload = JSON.parse(data);
            const text = payload.choices?.[0]?.delta?.content ??
                payload.choices?.[0]?.message?.content ??
                "";
            if (text) {
                yield text as string;
            }
        }
    }
}
function asChatMessages(messages: ChatMessage[]) {
    return messages as ChatCompletionMessageParam[];
}
function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
    return (typeof value === "object" &&
        value !== null &&
        Symbol.asyncIterator in value);
}
function tokenCount(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}
export function normalizeStreamTokenUsage(value: unknown): StreamTokenUsage | null {
    if (!value || typeof value !== "object")
        return null;
    const usage = value as Record<string, unknown>;
    const inputDetails = (usage.prompt_tokens_details ?? usage.input_tokens_details) as Record<string, unknown> | undefined;
    const outputDetails = (usage.completion_tokens_details ?? usage.output_tokens_details) as Record<string, unknown> | undefined;
    const inputTokens = tokenCount(usage.prompt_tokens ?? usage.input_tokens);
    const outputTokens = tokenCount(usage.completion_tokens ?? usage.output_tokens);
    const cachedInputTokens = tokenCount(inputDetails?.cached_tokens ?? usage.cache_read_input_tokens);
    const reasoningTokens = tokenCount(outputDetails?.reasoning_tokens ?? usage.reasoning_tokens);
    const reportedTotal = tokenCount(usage.total_tokens);
    const totalTokens = reportedTotal ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
    if ([inputTokens, outputTokens, cachedInputTokens, reasoningTokens, totalTokens].every((item) => item === null))
        return null;
    return { inputTokens, outputTokens, cachedInputTokens, reasoningTokens, totalTokens };
}
const providerActivityHeartbeat = Symbol("provider-activity-heartbeat");
async function* extractChatCompletionText(stream: AsyncIterable<ChatCompletionChunk>, observer: Pick<StreamChatCompletionInput, "onTokenUsage" | "onReasoningChunk" | "onReasoningSummary" | "onUsageUnavailable"> = {}) {
    let usageSeen = false;
    for await (const chunk of stream) {
        const rawChunk = chunk as unknown as Record<string, unknown>;
        const usage = normalizeStreamTokenUsage(rawChunk.usage);
        if (usage) {
            usageSeen = true;
            observer.onTokenUsage?.(usage);
        }
        const choice = chunk.choices?.[0] as {
            delta?: {
                content?: unknown;
                reasoning?: unknown;
                reasoning_content?: unknown;
                reasoning_summary?: unknown;
            };
            message?: {
                content?: unknown;
            };
        } | undefined;
        const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
        if (typeof reasoning === "string" && reasoning) {
            observer.onReasoningChunk?.(reasoning);
            // Reasoning-only chunks still count as provider activity for the idle timeout.
            yield providerActivityHeartbeat;
        }
        const summary = choice?.delta?.reasoning_summary;
        if (typeof summary === "string" && summary) {
            observer.onReasoningSummary?.(summary);
            yield providerActivityHeartbeat;
        }
        const text = choice?.delta?.content ?? choice?.message?.content ?? "";
        if (typeof text === "string" && text) {
            yield text;
        }
    }
    if (!usageSeen)
        observer.onUsageUnavailable?.("provider_stream_did_not_return_usage");
}
function createStreamingChatCompletionBody({ providerSettings, messages, responseFormat, includeUsage = true, reasoning, maxOutputTokens, }: {
    providerSettings: ProviderSettings;
    messages: ChatMessage[];
    responseFormat: ChatCompletionResponseFormat | null;
    includeUsage?: boolean;
    reasoning?: boolean;
    maxOutputTokens?: number;
}): ChatCompletionCreateParamsStreaming {
    return {
        model: providerSettings.model,
        messages: asChatMessages(messages),
        stream: true,
        ...reasoningRequestOptions(providerSettings.model, reasoning),
        ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
        temperature: 0.2,
        ...(maxOutputTokens === undefined ? {} : /^(?:o[134]|gpt-5)(?:[-.]|$)/i.test(providerSettings.model)
            ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }),
        ...(responseFormat === null ? {} : { response_format: responseFormat }),
        tools: [],
        tool_choice: "none",
    } as ChatCompletionCreateParamsStreaming;
}
function createNonStreamingChatCompletionBody({ model, messages, responseFormat, temperature = 0, }: {
    model: string;
    messages: ChatMessage[];
    responseFormat?: ChatCompletionResponseFormat | null;
    temperature?: number;
}): ChatCompletionCreateParamsNonStreaming {
    return {
        model,
        messages: asChatMessages(messages),
        stream: false,
        temperature,
        ...(responseFormat === null || responseFormat === undefined
            ? {}
            : { response_format: responseFormat }),
        tools: [],
        tool_choice: "none",
    } as ChatCompletionCreateParamsNonStreaming;
}
function normalizeProviderModel(value: unknown): ProviderDiscoveredModel | null {
    if (typeof value !== "object" || value === null)
        return null;
    const record = value as {
        id?: unknown;
        object?: unknown;
        created?: unknown;
        owned_by?: unknown;
        ownedBy?: unknown;
    };
    if (typeof record.id !== "string" || !record.id.trim())
        return null;
    return {
        id: record.id.trim(),
        object: typeof record.object === "string" && record.object.trim()
            ? record.object.trim()
            : undefined,
        created: typeof record.created === "number" && Number.isFinite(record.created)
            ? record.created
            : undefined,
        ownedBy: typeof record.owned_by === "string" && record.owned_by.trim()
            ? record.owned_by.trim()
            : typeof record.ownedBy === "string" && record.ownedBy.trim()
                ? record.ownedBy.trim()
                : undefined,
    };
}
export async function runOpenAiCompatibleChatCompletionHealthcheck({ apiBaseUrl, apiKey, model, responseFormat, responseTimeoutMs = DEFAULT_LLM_RESPONSE_TIMEOUT_MS, clientFactory = createOpenAiCompatibleClient, resolveHostname, }: {
    apiBaseUrl: string;
    apiKey: string;
    model: string;
    responseFormat?: ChatCompletionResponseFormat | null;
    responseTimeoutMs?: number;
    clientFactory?: OpenAiCompatibleClientFactory;
    resolveHostname?: ProviderHostnameResolver;
}) {
    const safeBaseUrl = await assertProviderBaseUrlSafe(apiBaseUrl, resolveHostname);
    const abortController = new AbortController();
    const client = clientFactory({
        apiKey,
        baseURL: resolveOpenAiBaseUrl(safeBaseUrl),
        timeoutMs: responseTimeoutMs,
    });
    try {
        await withTimeout(client.chat.completions.create(createNonStreamingChatCompletionBody({
            model,
            messages: [{ role: "user", content: "只回复 JSON：{\"ok\":true}" }],
            responseFormat,
            temperature: 0,
        }), { signal: abortController.signal }), responseTimeoutMs, () => abortController.abort());
    }
    catch (error) {
        throw normalizeProviderError(error, "Provider test failed");
    }
}
export async function probeOpenAiCompatibleStreamingChat({ apiBaseUrl, apiKey, model, messages, responseFormat, abortSignal, responseTimeoutMs = 30000, clientFactory = createOpenAiCompatibleClient, resolveHostname, }: {
    apiBaseUrl: string;
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    responseFormat?: ChatCompletionResponseFormat | null;
    abortSignal?: AbortSignal;
    responseTimeoutMs?: number;
    clientFactory?: OpenAiCompatibleClientFactory;
    resolveHostname?: ProviderHostnameResolver;
}) {
    const safeBaseUrl = await assertProviderBaseUrlSafe(apiBaseUrl, resolveHostname);
    const abortController = new AbortController();
    const abortHandler = () => abortController.abort();
    if (abortSignal) {
        if (abortSignal.aborted) {
            abortController.abort();
        }
        else {
            abortSignal.addEventListener("abort", abortHandler, { once: true });
        }
    }
    const client = clientFactory({
        apiKey,
        baseURL: resolveOpenAiBaseUrl(safeBaseUrl),
        timeoutMs: responseTimeoutMs,
    });
    try {
        const response = await withTimeout(client.chat.completions.create(createStreamingChatCompletionBody({
            providerSettings: { apiBaseUrl, apiKey, model },
            messages,
            responseFormat: responseFormat ?? null,
        }), { signal: abortController.signal }), responseTimeoutMs, () => abortController.abort());
        if (!isAsyncIterable<ChatCompletionChunk>(response)) {
            throw new Error("Provider probe response stream is not iterable");
        }
        let content = "";
        for await (const text of withIdleTimeout(extractChatCompletionText(response), responseTimeoutMs, () => abortController.abort())) {
            if (text === providerActivityHeartbeat)
                continue;
            content += text;
            if (content.length > 4096)
                break;
        }
        return content;
    }
    catch (error) {
        throw normalizeProviderError(error, "Provider model probe failed");
    }
    finally {
        if (abortSignal) {
            abortSignal.removeEventListener("abort", abortHandler);
        }
    }
}
export async function listOpenAiCompatibleModels({ apiBaseUrl, apiKey, abortSignal, options = {}, }: {
    apiBaseUrl: string;
    apiKey: string;
    abortSignal?: AbortSignal;
    options?: RealProviderClientOptions;
}): Promise<ProviderDiscoveredModel[]> {
    const safeBaseUrl = await assertProviderBaseUrlSafe(apiBaseUrl, options.resolveHostname);
    const responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_LLM_RESPONSE_TIMEOUT_MS;
    const clientFactory = options.clientFactory ?? createOpenAiCompatibleClient;
    const abortController = new AbortController();
    const abortHandler = () => abortController.abort();
    if (abortSignal) {
        if (abortSignal.aborted) {
            abortController.abort();
        }
        else {
            abortSignal.addEventListener("abort", abortHandler, { once: true });
        }
    }
    try {
        const client = clientFactory({
            apiKey,
            baseURL: resolveOpenAiBaseUrl(safeBaseUrl),
            timeoutMs: responseTimeoutMs,
        });
        const response = await withTimeout(client.models.list({ signal: abortController.signal }), responseTimeoutMs, () => abortController.abort());
        const rawModels = Array.isArray(response.data) ? response.data : [];
        return rawModels.flatMap((model) => {
            const normalized = normalizeProviderModel(model);
            return normalized ? [normalized] : [];
        });
    }
    catch (error) {
        throw normalizeProviderError(error, "Provider model discovery failed");
    }
    finally {
        if (abortSignal) {
            abortSignal.removeEventListener("abort", abortHandler);
        }
    }
}
export function createRealLlmTransport(options: RealProviderClientOptions = {}): LlmTransport {
    return {
        async *streamChatCompletion({ providerSettings, maxOutputTokens, reasoning, messages, responseFormat, abortSignal, onResponseFormatFallback, onTokenUsage, onReasoningChunk, onReasoningSummary, onUsageUnavailable, }: StreamChatCompletionInput) {
            const safeBaseUrl = normalizeManagedProviderBaseUrl(providerSettings.apiBaseUrl);
            const responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_LLM_RESPONSE_TIMEOUT_MS;
            const clientFactory = options.clientFactory ?? createOpenAiCompatibleClient;
            const client = clientFactory({
                apiKey: providerSettings.apiKey,
                baseURL: resolveOpenAiBaseUrl(safeBaseUrl),
                timeoutMs: responseTimeoutMs,
            });
            const requestResponseFormat = effectiveResponseFormat(responseFormat);
            let activeAbortController = new AbortController();
            let cleanupExternalAbort: (() => void) | undefined;
            const replaceActiveAbortController = () => {
                cleanupExternalAbort?.();
                activeAbortController = new AbortController();
                if (!abortSignal)
                    return;
                if (abortSignal.aborted) {
                    activeAbortController.abort();
                    return;
                }
                const controller = activeAbortController;
                const abortHandler = () => controller.abort();
                abortSignal.addEventListener("abort", abortHandler, { once: true });
                cleanupExternalAbort = () => abortSignal.removeEventListener("abort", abortHandler);
            };
            replaceActiveAbortController();
            const requestCompletionStream = async (nextResponseFormat: ChatCompletionResponseFormat | null, includeUsage = true) => {
                await assertProviderBaseUrlSafe(safeBaseUrl, options.resolveHostname);
                const response = await withTimeout(client.chat.completions.create(createStreamingChatCompletionBody({
                    providerSettings,
                    messages,
                    responseFormat: nextResponseFormat,
                    includeUsage,
                    reasoning,
                    maxOutputTokens,
                }), { signal: activeAbortController.signal }), responseTimeoutMs, () => activeAbortController.abort());
                if (!isAsyncIterable<ChatCompletionChunk>(response)) {
                    throw new Error("LLM response stream is not iterable");
                }
                return response;
            };
            try {
                let stream: AsyncIterable<ChatCompletionChunk>;
                const requestWithUsageFallback = async (nextResponseFormat: ChatCompletionResponseFormat | null) => {
                    try {
                        return await requestCompletionStream(nextResponseFormat, true);
                    }
                    catch (error) {
                        const httpError = toProviderHttpError(error, "LLM request failed");
                        if (!httpError || !shouldRetryWithoutStreamUsage(httpError.status, httpError.detail)) {
                            throw error;
                        }
                        onUsageUnavailable?.("provider_rejected_stream_usage");
                        replaceActiveAbortController();
                        return requestCompletionStream(nextResponseFormat, false);
                    }
                };
                try {
                    stream = await requestWithUsageFallback(requestResponseFormat);
                }
                catch (error) {
                    const httpError = toProviderHttpError(error, "LLM request failed");
                    if (isJsonSchemaResponseFormat(requestResponseFormat) &&
                        httpError &&
                        shouldRetryJsonSchemaAsJsonObject(httpError.status, httpError.detail)) {
                        warnJsonSchemaFallback(providerSettings.model, httpError.status, httpError.detail);
                        onResponseFormatFallback?.({
                            from: "strict_json",
                            to: "json_object",
                            status: httpError.status,
                            reason: summarizeErrorText(httpError.detail ?? "")
                                ?? "provider rejected json_schema",
                        });
                        replaceActiveAbortController();
                        try {
                            stream = await requestWithUsageFallback({ type: "json_object" });
                        }
                        catch (retryError) {
                            throw normalizeProviderError(retryError, "LLM request failed");
                        }
                    }
                    else {
                        throw httpError ?? normalizeProviderError(error, "LLM request failed");
                    }
                }
                for await (const text of withIdleTimeout(extractChatCompletionText(stream, { onTokenUsage, onReasoningChunk, onReasoningSummary, onUsageUnavailable }), responseTimeoutMs, () => activeAbortController.abort())) {
                    if (text === providerActivityHeartbeat)
                        continue;
                    yield text;
                }
            }
            finally {
                cleanupExternalAbort?.();
            }
        },
    };
}
export { resolveChatCompletionsUrl };
