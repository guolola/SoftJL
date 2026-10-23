// Builds chat message payloads used by pipeline LLM calls.

import { JSON_ONLY_SYSTEM_PROMPT } from "@uml-platform/prompts";
import { type ChatMessage } from "../../../adapters/llm/llm-transport.js";

export function createMessages(prompt: string): ChatMessage[] {
  return [
    { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
}
