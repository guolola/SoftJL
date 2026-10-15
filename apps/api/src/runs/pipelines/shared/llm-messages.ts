// Builds chat message payloads used by pipeline LLM calls.

import { JSON_ONLY_SYSTEM_PROMPT } from "@uml-platform/prompts";
import { type ChatMessage } from "../../../llm.js";

export function createMessages(prompt: string): ChatMessage[] {
  return [
    { role: "system", content: JSON_ONLY_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
}
