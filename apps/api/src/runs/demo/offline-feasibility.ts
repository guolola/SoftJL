// Runs fixed feasibility demo data through the real validation and persistence pipeline.
import { randomUUID } from "node:crypto";
import { feasibilityInputsSchema } from "@uml-platform/contracts";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { LlmTransport } from "../../adapters/llm/llm-transport.js";
import type { RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import {
  librarySeatFeasibilityContext, librarySeatFeasibilityFlow, librarySeatFeasibilityInputs,
  librarySeatFeasibilityPlan, librarySeatContextSvg, librarySeatFlowSvg,
} from "./fixtures/library-seat-feasibility-fixture.js";

export function offlineFeasibilityAdapters(record: RunRecord) {
  if (record.metadata?.offlineDemoFixture !== "library-seat" || !("selectedArtifacts" in record.snapshot)) return null;
  const snapshot = record.snapshot;
  // Retain any filled-in project facts while supplying useful defaults for the fixed demo.
  snapshot.inputs = feasibilityInputsSchema.parse({ ...librarySeatFeasibilityInputs,
    ...Object.fromEntries(Object.entries(snapshot.inputs).filter(([, value]) => value !== "" && value !== null && (!Array.isArray(value) || value.length > 0))),
  });
  const results: Record<string, unknown> = { generate_context: librarySeatFeasibilityContext,
    generate_business_flow: librarySeatFeasibilityFlow, generate_implementation: librarySeatFeasibilityPlan };
  const llmTransport: LlmTransport = {
    async *streamChatCompletion(input) {
      throwIfRunCancelled(record);
      const forced = typeof input.toolChoice === "object" ? input.toolChoice.function.name : undefined;
      const name = forced ?? "validate_model";
      let args: string;
      if (name === "get_upstream_artifact") {
        const schema = input.tools?.find(tool => tool.function.name === name)?.function.parameters as any;
        if (!schema) throw new Error("固定演示缺少上游查询工具契约");
        args = JSON.stringify({ sourceType: schema.properties.sourceType.enum[0], sourceId: schema.properties.sourceId.enum[0] });
      } else {
        const value = results[input.runContext?.stage ?? ""];
        if (!value) throw new Error("固定演示任务缺少对应的可行性产物");
        args = JSON.stringify(value);
      }
      yield args;
      input.onToolCall?.({ id: randomUUID(), type: "function", function: { name, arguments: args } });
    },
  };

  const renderClient: RenderClient = async (artifact) => {
    throwIfRunCancelled(record);
    const svg = artifact.modelId === "feasibility-business-flow" ? librarySeatFlowSvg : librarySeatContextSvg;
    return { svg, renderMeta: { engine: "offline-demo", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 0 } };
  };
  return { llmTransport, renderClient };
}
