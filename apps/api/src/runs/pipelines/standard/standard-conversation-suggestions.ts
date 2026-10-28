// Generates homepage follow-ups through the same managed provider, scheduling and cancellation boundary as the reply.
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { normalizeContext, type Model, type Api, type AssistantMessage } from "@earendil-works/pi-ai";
import type { StandardProjectState } from "@uml-platform/contracts";
import { parseFollowUpSuggestions } from "../../../normalizers/standard/follow-up-suggestions.js";
import { standardPrompt } from "../../../prompt-runtime/standard-runtime.js";
import type { PublishedSnapshot } from "../../../prompt-runtime/store.js";

export async function generateConversationSuggestions(state: StandardProjectState, model: Model<Api>, stream: StreamFn, signal: AbortSignal, language = "zh-CN", snapshot: PublishedSnapshot = {}) {
  signal.throwIfAborted();
  const latest = state.conversation?.at(-1);
  if (latest?.role !== "assistant" || latest.status !== "completed" || !latest.text.trim()
    || state.rounds.at(-1)?.questions.length && !state.rounds.at(-1)?.answers.length) return [];
  const history = state.conversation!.slice(-6).map(item => `${item.role}: ${item.text}`).join("\n\n");
  const prompt = history.length > 24000 ? `${history.slice(0, 2000)}\n\n[...]\n\n${history.slice(-21989)}` : history;
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
  let abort = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(requestSignal.reason);
    requestSignal.addEventListener("abort", abort, { once: true });
    if (requestSignal.aborted) abort();
  });
  const responsePromise = (async () => (await stream({ ...model, reasoning: false }, normalizeContext({
    systemPrompt: `${standardPrompt("standard.suggestions", snapshot)}\n输出语言：${language === "en" ? "English" : "简体中文"}。`,
    messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
  }), { signal: requestSignal, maxTokens: Math.min(1024, model.maxTokens) })).result())();
  let response: AssistantMessage;
  // A queued provider request may not produce an event when its signal expires. Release the
  // successful main reply promptly; the expired queued task checks the signal before any external call.
  try { response = await Promise.race([responsePromise, cancelled]); }
  finally { requestSignal.removeEventListener("abort", abort); }
  if (response.stopReason === "error" || response.stopReason === "aborted") return [];
  return parseFollowUpSuggestions(response.content.filter(part => part.type === "text").map(part => part.text).join(""));
}
