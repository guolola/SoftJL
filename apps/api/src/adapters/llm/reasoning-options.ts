// Maps the shared composer reasoning switch to the same provider families as the quick-modeling adapter.
export function reasoningRequestOptions(model: string, reasoning?: boolean): Record<string, unknown> {
  if (reasoning === undefined) return {};
  if (/^(?:deepseek|glm)/i.test(model)) return { thinking: { type: reasoning ? "enabled" : "disabled" } };
  if (/^qwen/i.test(model)) return { enable_thinking: reasoning };
  return { reasoning_effort: reasoning ? "medium" : "none" };
}
