// Owns shared LLM text collection and structured output parse diagnostics.
import { type ProviderSettings, type RunInputImage, type RunStage } from "@uml-platform/contracts";
import {
  type ChatCompletionResponseFormat,
  type ChatMessage,
  type LlmTransport,
  type StreamChatCompletionInput,
} from "../../../llm.js";
import { formatParseError } from "../../../normalizers/json/parse-json.js";

const RAW_OUTPUT_LOG_LIMIT = 8000;

export interface LlmChunkHandlers {
  runContext?: StreamChatCompletionInput["runContext"];
  callId?: string;
  onChunk: (chunk: string) => void;
  onStart?: (inputImages?: RunInputImage[]) => void;
  onComplete?: () => void;
  onError?: () => void;
  onReasoningChunk?: (chunk: string) => void;
  onReasoningSummary?: (chunk: string) => void;
  onBlankChunk?: (chunk: string) => void;
  startNoVisibleChunkHeartbeat?: () => () => void;
}

type LlmChunkSink = ((chunk: string) => void) | LlmChunkHandlers;

function inputImages(messages: ChatMessage[]): RunInputImage[] | undefined {
  // Record current user image inputs once per call; do not copy text prompts or credentials.
  const urls = new Set(messages.flatMap((message) => message.role === "user" && Array.isArray(message.content)
    ? message.content.flatMap((part) => part.type === "image_url" ? [part.image_url.url] : []) : []));
  return urls.size ? [...urls].map((url) => ({ url })) : undefined;
}

export type StructuredOutputFailureType =
  | "json_parse"
  | "model_schema"
  | "traceability_schema"
  | "traceability_ref"
  | "empty_selected_model"
  | "external_transport";

function truncateForLog(rawText: string) {
  if (rawText.length <= RAW_OUTPUT_LOG_LIMIT) return rawText;
  return `${rawText.slice(0, RAW_OUTPUT_LOG_LIMIT)}\n...[truncated ${rawText.length - RAW_OUTPUT_LOG_LIMIT} chars]`;
}

function isMeaningfulChunk(chunk: string) {
  return chunk.trim().length > 0;
}

function emitCollectedChunk(sink: LlmChunkSink, chunk: string) {
  if (isMeaningfulChunk(chunk)) {
    if (typeof sink === "function") {
      sink(chunk);
    } else {
      sink.onChunk(chunk);
    }
    return;
  }

  if (typeof sink !== "function") {
    sink.onBlankChunk?.(chunk);
  }
}

export function classifyStructuredOutputFailure(
  error: unknown,
  rawText = "",
): StructuredOutputFailureType {
  const message = formatParseError(error);
  const normalized = `${message}\n${rawText}`.toLowerCase();

  if (
    normalized.includes("fetch failed") ||
    /http\s+5\d\d/.test(normalized) ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("abort") ||
    normalized.includes("refusal") ||
    normalized.includes("refused")
  ) {
    return "external_transport";
  }

  if (
    error instanceof SyntaxError ||
    normalized.includes(" in json at position ") ||
    normalized.includes("unexpected token") ||
    normalized.includes("expected property name")
  ) {
    return "json_parse";
  }

  if (
    normalized.includes("must return at least one model") ||
    normalized.includes("returned no selected models")
  ) {
    return "empty_selected_model";
  }

  const mentionsTraceability =
    normalized.includes("traceability") ||
    normalized.includes("requirementmodeltraceability") ||
    normalized.includes("designmodeltraceability") ||
    normalized.includes('"target"') ||
    normalized.includes('"targets"') ||
    normalized.includes('"source"') ||
    /缺少\s+\d+\s+个(?:需求|设计)元素映射/.test(normalized);

  if (mentionsTraceability) {
    if (
      normalized.includes("invalid_type") ||
      normalized.includes("expected") ||
      normalized.includes("received") ||
      normalized.includes("schema") ||
      normalized.includes("modelid") ||
      normalized.includes("elementid") ||
      normalized.includes("diagramkind")
    ) {
      return "traceability_schema";
    }
    return "traceability_ref";
  }

  return "model_schema";
}

export function logFailedStructuredOutput(
  stage: RunStage,
  model: string,
  error: unknown,
  rawText: string,
  attempt?: number,
) {
  const header = [
    "[llm-structured-output-failed]",
    `stage=${stage}`,
    `model=${model}`,
    attempt ? `attempt=${attempt}` : null,
    `failureType=${classifyStructuredOutputFailure(error, rawText)}`,
    `error=${formatParseError(error)}`,
  ]
    .filter(Boolean)
    .join(" ");

  console.error(
    `${header}\n--- begin raw output ---\n${truncateForLog(rawText)}\n--- end raw output ---`,
  );
}

// LLM structured output repair loops depend on this throwing parse errors after logging raw output.
export async function collectStructuredResult<T>(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  stage: RunStage,
  onChunk: LlmChunkSink,
  parse: (text: string) => T,
  responseFormat?: ChatCompletionResponseFormat | null,
  attempt?: number,
  abortSignal?: AbortSignal,
) {
  let content = "";
  const observer = typeof onChunk === "function" ? undefined : onChunk;
  observer?.onStart?.(inputImages(messages));
  const stopNoVisibleChunkHeartbeat =
    typeof onChunk === "function"
      ? undefined
      : onChunk.startNoVisibleChunkHeartbeat?.();
  try {
    for await (const chunk of llmTransport.streamChatCompletion({
      providerSettings,
      messages,
      responseFormat,
      abortSignal,
      onReasoningChunk: observer?.onReasoningChunk,
      runContext: observer?.runContext ?? { stage },
      onReasoningSummary: observer?.onReasoningSummary,
    })) {
      content += chunk;
      emitCollectedChunk(onChunk, chunk);
    }
  } catch (error) {
    observer?.onError?.();
    throw error;
  } finally {
    stopNoVisibleChunkHeartbeat?.();
  }
  try {
    const result = parse(content);
    observer?.onComplete?.();
    return result;
  } catch (error) {
    observer?.onError?.();
    logFailedStructuredOutput(
      stage,
      providerSettings.model,
      error,
      content,
      attempt,
    );
    throw error;
  }
}

export async function collectTextResult(
  llmTransport: LlmTransport,
  providerSettings: ProviderSettings,
  messages: ChatMessage[],
  onChunk: LlmChunkSink,
  responseFormat?: ChatCompletionResponseFormat | null,
  abortSignal?: AbortSignal,
  onResponseFormatFallback?: StreamChatCompletionInput["onResponseFormatFallback"],
) {
  let content = "";
  const observer = typeof onChunk === "function" ? undefined : onChunk;
  observer?.onStart?.(inputImages(messages));
  const stopNoVisibleChunkHeartbeat =
    typeof onChunk === "function"
      ? undefined
      : onChunk.startNoVisibleChunkHeartbeat?.();
  try {
    for await (const chunk of llmTransport.streamChatCompletion({
      providerSettings,
      messages,
      responseFormat,
      abortSignal,
      onResponseFormatFallback,
      onReasoningChunk: observer?.onReasoningChunk,
      runContext: observer?.runContext,
      onReasoningSummary: observer?.onReasoningSummary,
    })) {
      content += chunk;
      emitCollectedChunk(onChunk, chunk);
    }
    observer?.onComplete?.();
  } catch (error) {
    observer?.onError?.();
    throw error;
  } finally {
    stopNoVisibleChunkHeartbeat?.();
  }
  return content;
}
