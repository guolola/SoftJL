// Pins the persisted reasoning choice across every LLM call, including repair and review calls.
import type { LlmTransport } from "../../../adapters/llm/llm-transport.js";

export function withRunReasoning(transport: LlmTransport, reasoning?: boolean): LlmTransport {
  if (reasoning === undefined) return transport;
  return { streamChatCompletion: input => transport.streamChatCompletion({ ...input, reasoning }) };
}
