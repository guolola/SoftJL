// Registers project modeling tools and managed compaction through Pi's native extension API.
import { z } from "zod";
import { convertToLlm, serializeConversation, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { StandardProjectState } from "@uml-platform/contracts";
import { createStandardAgentTools } from "./standard-agent-tools.js";
import { standardJsonCall, type StandardCommand, type StandardPipelineDependencies } from "./standard-project-pipeline.js";
import { createStandardResourceReadTool } from "./standard-modeling-knowledge.js";
import { standardAgentTurnContext } from "./standard-agent-context.js";
import { standardPrompt } from "../../../prompt-runtime/standard-runtime.js";

export function createStandardModelingExtension(deps: StandardPipelineDependencies, current: () => StandardProjectState,
  command: StandardCommand, beforeToolCall: () => Promise<void>): ExtensionFactory {
  return pi => {
    // Keep inquiry state local to this Pi session, including when the loader is reloaded.
    const tools = createStandardAgentTools(deps, current, Boolean(command.useRecommendations), command.language);
    pi.registerTool(createStandardResourceReadTool(undefined, deps.promptVersions));
    for (const tool of tools.tools) pi.registerTool(tool);
    pi.on("before_agent_start", event => ({ systemPrompt: `${event.systemPrompt}\n\n${standardAgentTurnContext(command, current())}` }));
    pi.on("tool_call", async () => {
      // Persist the assistant's tool intent before allowing any project mutation.
      await beforeToolCall();
      if (tools.waiting()) return { block: true, reason: "等待用户补充需求" };
    });
  };
}

export function createStandardManagedSummaryExtension(deps: StandardPipelineDependencies,
  current: () => StandardProjectState): ExtensionFactory {
  return pi => {
    pi.on("session_before_compact", async event => {
      event.signal.throwIfAborted();
      await deps.save(state => { state.contextStatus = "compacting"; });
      const preparation = event.preparation;
      // Pi owns the boundary; only the summary request uses the platform's scheduled/billed transport.
      const schema = z.object({ summary: z.string().min(1).max(16000) });
      const { summary } = schema.parse(await standardJsonCall(deps,
        standardPrompt("standard.summary", deps.promptVersions) + '返回 {"summary":"中文摘要"}。',
        { previousSummary: preparation.previousSummary, conversation: serializeConversation(convertToLlm([...preparation.messagesToSummarize, ...preparation.turnPrefixMessages])), memory: current().memory ?? [] }, schema));
      event.signal.throwIfAborted();
      return { compaction: { summary, firstKeptEntryId: preparation.firstKeptEntryId, tokensBefore: preparation.tokensBefore } };
    });
  };
}
