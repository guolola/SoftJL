// Rejects oversized engineering requests without discarding business facts.
import type { ModelCapacity } from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "../../../adapters/llm/llm-transport.js";
import { createRunError, RunPipelineError } from "./errors.js";
import { getEncoding, getEncodingNameForModel, type Tiktoken, type TiktokenModel } from "js-tiktoken";

const encodings = new Map<string, Tiktoken>();
function countTextTokens(text: string, model: string) {
  try {
    // Use only tokenizer mappings supplied by the library, never infer an
    // encoding for an unknown provider/model from a similar-looking name.
    const name = getEncodingNameForModel(model.replace(/^openai\//, "") as TiktokenModel);
    let tokenizer = encodings.get(name);
    if (!tokenizer) { tokenizer = getEncoding(name); encodings.set(name, tokenizer); }
    return { tokens: tokenizer.encode(text, [], []).length, method: name };
  } catch {
    // Provider tokenizers differ. This character estimate is diagnostic only,
    // never sufficient evidence to reject a request before contacting the provider.
    const characters = [...text];
    const ascii = characters.filter(character => character.codePointAt(0)! < 128).length;
    return { tokens: Math.ceil((ascii / 4 + characters.length - ascii) * 1.2), method: "character-estimate" };
  }
}

export function engineeringContextBudget(input: StreamChatCompletionInput, capacity?: ModelCapacity) {
  const context = capacity?.context ?? null;
  // Images reserve a separate diagnostic allowance, never their base64 byte length.
  let images = 0;
  const messages = input.messages.map(message => ({ ...message, content: typeof message.content === "string" ? message.content : message.content.flatMap(part => {
    if (part.type === "image_url") { images++; return []; }
    return [part];
  }) }));
  const counted = countTextTokens(JSON.stringify({ messages, responseFormat: input.responseFormat, tools: input.tools, toolChoice: input.toolChoice }), input.providerSettings.model);
  const estimatedInput = counted.tokens + 1024 + images * 8192;
  const enforceable = context !== null && counted.method !== "character-estimate" && images === 0;
  // The catalog owns output capacity. Only a reliable input count can reduce it
  // to the remaining context; provider-specific estimates stay diagnostic.
  const limits = [input.maxOutputTokens, capacity?.output,
    enforceable ? Math.max(1, context - estimatedInput) : undefined,
  ].filter((value): value is number => value !== undefined && value !== null);
  const output = limits.length ? Math.max(1, Math.min(...limits)) : null;
  return { context, output, estimatedInput, tokenMethod: counted.method, estimated: true,
    enforceable,
    capacitySource: capacity?.context ? capacity.source : "unknown" };
}

export function withEngineeringContextBudget(transport: LlmTransport, capacity?: ModelCapacity): LlmTransport {
  return { async *streamChatCompletion(input) {
    const budget = engineeringContextBudget(input, capacity);
    const exceeded = () => new RunPipelineError(createRunError("RUN_CONTEXT_LIMIT_EXCEEDED",
      `上下文容量不足：输入估算 ${(budget.estimatedInput / 1000).toFixed(1)}k，${budget.output === null ? "输出容量未知" : `输出预留 ${(budget.output / 1000).toFixed(1)}k`}，${budget.context === null ? "模型容量未知" : `容量 ${(budget.context / 1000).toFixed(1)}k`}。请选择更大上下文模型或缩小范围；估算不用于计费。`,
      { details: { contextBudget: budget } },
    ));
    if (budget.enforceable && budget.context !== null && budget.estimatedInput + (budget.output ?? 0) > budget.context) throw exceeded();
    try { yield* transport.streamChatCompletion({ ...input, ...(budget.output === null ? {} : { maxOutputTokens: budget.output }) }); }
    catch (error) {
      // Provider-specific tokenizers and image accounting may differ from estimates.
      if (error instanceof Error && /context_length_exceeded|maximum context length|context window|too many tokens|input.*token.*limit/i.test(error.message)) throw exceeded();
      throw error;
    }
  } };
}
