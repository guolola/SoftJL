// Runs fixed feasibility demo data through the real validation and persistence pipeline.
import { feasibilityInputsSchema } from "@uml-platform/contracts";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { LlmTransport } from "../../llm.js";
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
  const results = [
    ...(snapshot.selectedArtifacts.includes("context") ? [librarySeatFeasibilityContext] : []),
    ...(snapshot.selectedArtifacts.includes("business-flow") ? [librarySeatFeasibilityFlow] : []),
    ...(snapshot.selectedArtifacts.includes("implementation") ? [librarySeatFeasibilityPlan] : []),
  ];
  const llmTransport: LlmTransport = {
    async *streamChatCompletion(input) {
      throwIfRunCancelled(record);
      // Review calls must not consume the next fixed generation artifact.
      const current = input.messages.at(-1)?.content;
      if (typeof current === "string" && /^核对 feasibility\.(?:context|activity) 的结构与业务内容。/.test(current)) {
        input.onReasoningChunk?.("演示推理片段：核对本模型的已确认需求、端点和业务约束，相似度映射不授权增删。");
        input.onReasoningSummary?.("演示摘要：模型结构与明确引用核对通过。");
        yield JSON.stringify({ passed: true, issues: [], findings: [] });
        return;
      }
      const result = results.shift();
      if (!result) throw new Error("固定可行性 Mock 数据校验失败，请检查演示需求是否与座位预约场景一致。");
      yield JSON.stringify(result);
    },
  };
  const renderClient: RenderClient = async (artifact) => {
    throwIfRunCancelled(record);
    const svg = artifact.modelId === "feasibility-business-flow" ? librarySeatFlowSvg : librarySeatContextSvg;
    return { svg, renderMeta: { engine: "offline-demo", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 0 } };
  };
  return { llmTransport, renderClient };
}
