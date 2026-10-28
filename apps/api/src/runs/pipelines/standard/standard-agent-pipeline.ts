// Embeds the actual Pi SDK for a persistent project conversation, tool loop, memory and context compaction.
import { randomUUID } from "node:crypto";
import { ModelRuntime, createAgentSession, SettingsManager } from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { StandardProjectState, ModelCapacity } from "@uml-platform/contracts";
import { restoreStandardSession } from "../../records/standard-agent-session.js";
import { standardPiModel } from "../../../adapters/llm/pi-provider.js";
import { type StandardCommand, type StandardPipelineDependencies } from "./standard-project-pipeline.js";
import { createStandardManagedSummaryExtension, createStandardModelingExtension } from "./standard-agent-extensions.js";
import { loadStandardAgentResources, type StandardAgentExtensionOptions } from "./standard-agent-resources.js";
import { standardTokenUsage } from "../../records/standard-token-usage.js";
import { prepareStandardAgentTurn, standardUserMessageId } from "./standard-agent-turn.js";
import { generateConversationSuggestions } from "./standard-conversation-suggestions.js";
import { resolveStandardGenerationSelection } from "./standard-generation-scope.js";
import { appendStandardGenerationResult } from "../../records/standard-run-messages.js";
import { standardPrompt } from "../../../prompt-runtime/standard-runtime.js";

export async function runStandardAgent(projectId: string, command: StandardCommand, initial: StandardProjectState,
  deps: StandardPipelineDependencies & StandardAgentExtensionOptions & { stream: StreamFn; signal: AbortSignal; capacity?: ModelCapacity }) {
  let current = initial;
  const save: StandardPipelineDependencies["save"] = async update => { current = await deps.save(update); return current; };
  const userMessageId = standardUserMessageId(command, current);
  if (!current.conversation?.some(message => message.id === userMessageId)) {
    await save(state => { prepareStandardAgentTurn(projectId, command, state, userMessageId); });
  }
  const message = current.conversation!.find(message => message.id === userMessageId)!.text;
  // Structured selections were applied with the durable user turn; never reinterpret their display copy.
  const selection = command.answers?.length || current.unsupportedDiagramRequest ? undefined : resolveStandardGenerationSelection(command.message ?? "", current.generationScope?.status === "awaiting_selection");
  if (selection) await save(state => {
    // Scope describes this request, not every model ever generated; existing outputs are retained separately.
    state.generationScope = { status: "confirmed", kinds: selection };
  });
  // Scope consent is host-enforced, while the Agent owns the questions and invokes
  // ask_questions to render the actual interactive inquiry.
  if (!current.generationScope && !Object.keys(current.diagrams).length) {
    await save(state => {
      state.generationScope = { status: "awaiting_selection", kinds: ["function", "usecase", "activity"] };
    });
  }
  const manager = restoreStandardSession(projectId, current.piSession);
  const model = standardPiModel(deps.settings, deps.capacity);
  // Keep the installed SDK's credentials and model catalog isolated from host configuration.
  const modelRuntime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), modelsPath: null, allowModelNetwork: false });
  modelRuntime.registerProvider(model.provider, { api: "openai-completions", baseUrl: model.baseUrl, apiKey: deps.settings.apiKey, models: [model] });
  await modelRuntime.setRuntimeApiKey(model.provider, deps.settings.apiKey);
  const settings = SettingsManager.inMemory({ compaction: { enabled: true, reserveTokens: Math.min(10000, Math.floor(model.contextWindow / 3)), keepRecentTokens: Math.min(12000, Math.floor(model.contextWindow / 4)) }, retry: { enabled: false }, enableSkillCommands: false });
  const prompt = standardPrompt("standard.agent", deps.promptVersions);
  let calls = 0; let writes = Promise.resolve(); let writeFailure: unknown; let assistantId = ""; let partial = ""; let reasoning = ""; let lastSave = 0; let messageStartedAt = 0;
  const beforeToolCall = async () => {
    await writes; deps.signal.throwIfAborted(); if (writeFailure) throw writeFailure;
  };
  const loader = await loadStandardAgentResources(manager.getCwd(), settings, prompt, {
    additionalExtensionPaths: deps.additionalExtensionPaths,
    extensionFactories: [
      createStandardModelingExtension({ ...deps, save }, () => current, command, beforeToolCall),
      createStandardManagedSummaryExtension({ ...deps, save }, () => current),
      ...(deps.extensionFactories ?? []),
    ],
  }, deps.promptVersions);
  const { session } = await createAgentSession({ cwd: manager.getCwd(), model, modelRuntime,
    noTools: "builtin", resourceLoader: loader, sessionManager: manager, settingsManager: settings, thinkingLevel: command.reasoning && model.reasoning ? "medium" : "off" });
  let firstTokenAt: number | undefined; let totalChunks = 0;
  const persist = (update?: (state: StandardProjectState) => void) => {
    writes = writes.then(async () => {
      // Pi appends message_end after notifying subscribers; read the tree in this queued continuation.
      const saved = { entries: structuredClone(manager.getEntries()), leafId: manager.getLeafId() };
      const usage = standardTokenUsage(saved.entries, session.getContextUsage(), model.id, model.contextWindow);
      if (current.conversation?.at(-1)?.role === "user") usage.lastCall = null;
      usage.capacity = deps.capacity;
      await save(state => { state.piSession = saved; state.tokenUsage = usage; update?.(state); });
    }).catch(error => { writeFailure = error; session.agent.abort(); });
  };
  session.agent.streamFunction = async (...args) => {
    await writes; if (writeFailure) throw writeFailure;
    deps.signal.throwIfAborted();
    if (++calls > 20) throw new Error("本轮处理步骤较多，已保留成果，请继续发送消息");
    return deps.stream(...args);
  };
  session.agent.toolExecution = "sequential";
  const abort = () => { session.agent.abort(); session.abortCompaction(); };
  deps.signal.addEventListener("abort", abort, { once: true });
  const unsubscribe = session.subscribe(event => {
    if (event.type === "message_start" && event.message.role === "assistant") { assistantId = randomUUID(); partial = ""; reasoning = ""; lastSave = 0; messageStartedAt = Date.now(); firstTokenAt = undefined; totalChunks = 0; }
    if (event.type === "message_update") {
      const delta = event.assistantMessageEvent;
      if ((delta.type === "text_delta" || delta.type === "thinking_delta" || delta.type === "toolcall_delta") && delta.delta.length) {
        firstTokenAt ??= Date.now(); totalChunks++;
      }
    }
    if (event.type === "message_update" && ["text_delta", "thinking_delta"].includes(event.assistantMessageEvent.type)) {
      const delta = event.assistantMessageEvent;
      if (delta.type === "text_delta") partial += delta.delta;
      if (delta.type === "thinking_delta") reasoning += delta.delta;
      if (Date.now() - lastSave > 700) { lastSave = Date.now(); const id = assistantId, text = partial, thought = reasoning;
        persist(state => { state.conversation ??= []; const item = state.conversation.find(item => item.id === id); if (item) item.text = text;
          else state.conversation.push({ id, role: "assistant", text, status: "streaming", createdAt: new Date().toISOString() });
          state.conversation.find(item => item.id === id)!.reasoning = thought; }); }
    }
    if (event.type === "message_end") {
      const response = event.message;
      if (response.role === "assistant") {
        const text = response.content.filter(item => item.type === "text").map(item => item.text).join(""); const id = assistantId;
        const thought = response.content.filter(item => item.type === "thinking").map(item => item.thinking).join("");
        const toolCalls = response.content.filter(item => item.type === "toolCall").map(item => ({ id: item.id, name: item.name, status: "running" as const }));
        const durationMs = Date.now() - messageStartedAt;
        const tokenCount = Number.isFinite(response.usage.output) && response.usage.totalTokens > 0 ? response.usage.output : undefined;
        const generationMs = firstTokenAt === undefined ? undefined : Date.now() - firstTokenAt;
        const timing = { streamStartTime: messageStartedAt, totalStreamTime: durationMs, totalChunks, toolCallCount: toolCalls.length,
          ...(firstTokenAt === undefined ? {} : { firstTokenTime: firstTokenAt - messageStartedAt }),
          ...(tokenCount === undefined ? {} : { tokenCount }),
          ...(tokenCount && generationMs ? { tokensPerSecond: tokenCount * 1000 / generationMs } : {}) };
        persist(state => { const item = state.conversation?.find(item => item.id === id);
          const fields = { text, reasoning: thought, tools: toolCalls, timing, status: response.stopReason === "error" || response.stopReason === "aborted" ? "failed" as const : "completed" as const };
          if (item) Object.assign(item, fields);
          else if (text || thought || toolCalls.length) { state.conversation ??= []; state.conversation.push({ id, role: "assistant", ...fields, createdAt: new Date().toISOString() }); } });
      } else persist();
    }
    if (event.type === "tool_execution_end") {
      const { toolCallId, isError } = event;
      persist(state => { for (const message of state.conversation ?? []) { const tool = message.tools?.find(item => item.id === toolCallId); if (tool) tool.status = isError ? "failed" : "completed"; } });
    }
    if (event.type === "compaction_end") persist(state => { state.contextStatus = "ready"; if (event.result) state.compactionCount = (state.compactionCount ?? 0) + 1; });
  });
  try {
    await session.bindExtensions({});
    persist(); await writes;
    // Quotes and text files are labelled reference material; image bytes use Pi's native image input.
    const referenceText = [command.quote ? `引用资料：\n${command.quote.text}` : "", ...(command.attachments ?? []).filter(item => item.type === "document").map(item => `附件 ${item.name}（资料）：\n${item.text}`)].filter(Boolean).join("\n\n");
    const images = (command.attachments ?? []).filter(item => item.type === "image").map(item => ({ type: "image" as const, data: item.data, mimeType: item.contentType }));
    await session.prompt([referenceText, message].filter(Boolean).join("\n\n"), { expandPromptTemplates: false, images });
    await writes; if (writeFailure) throw writeFailure;
    deps.signal.throwIfAborted();
    if (session.agent.state.errorMessage) throw new Error(session.agent.state.errorMessage);
    persist(state => { state.contextStatus = "ready"; appendStandardGenerationResult(state); }); await writes;
    if (writeFailure) throw writeFailure;
    // Follow-ups are optional: an unavailable auxiliary call must never turn a successful reply into a failed run.
    const replyId = current.conversation?.at(-1)?.id;
    const suggestions = await generateConversationSuggestions(current, model, deps.stream, deps.signal, command.language, deps.promptVersions).catch(() => []);
    deps.signal.throwIfAborted();
    if (suggestions.length) await save(state => {
      const latest = state.conversation?.at(-1);
      if (latest && latest.id === replyId && latest.status === "completed") latest.suggestions = suggestions;
    });
  } finally { unsubscribe(); deps.signal.removeEventListener("abort", abort); session.dispose(); await modelRuntime.removeRuntimeApiKey(model.provider); }
}
