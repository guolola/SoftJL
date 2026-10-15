// Runs fixed feasibility demo data through the real validation and persistence pipeline.
import { feasibilityInputsSchema } from "@uml-platform/contracts";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { LlmTransport } from "../../llm.js";
import type { RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";
import {
  librarySeatFeasibilityContext, librarySeatFeasibilityFlow, librarySeatFeasibilityInputs,
  librarySeatFeasibilityPlan, librarySeatContextSvg, librarySeatFlowSvg,
} from "./fixtures/library-seat-feasibility-fixture.js";
import { offlineReviewImage } from "./fixtures/library-seat-review-images.js";

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
        input.onReasoningChunk?.("演示推理片段：核对本模型的已确认需求、端点和业务约束，图片观察与相似度映射不授权增删。");
        input.onReasoningSummary?.("演示摘要：模型结构与明确引用核对通过。");
        yield JSON.stringify({ passed: true, issues: [], findings: [] });
        return;
      }
      if (Array.isArray(current) && current.some((part) => part.type === "image_url")) {
        const prompt = current.find((part) => part.type === "text");
        const context = prompt?.type === "text" && prompt.text.includes("模型 ID：context\n");
        input.onReasoningChunk?.("演示推理片段：将本次 PNG 与模型及绘图映射核对；只检查结构和业务内容，无法辨认的输入不作为增删依据。");
        input.onReasoningSummary?.(context ? "演示摘要：模型结构通过，部分关系标签无法核实，未启动纠错。" : "演示摘要：流程节点、分支、连线方向与模型一致。");
        yield JSON.stringify(context ? {
          passed: false, issues: [], findings: [{ id: "context:demo-unreadable-label", layer: "image", code: "unreadable-label", category: "check_execution", modelId: "context",
            observation: "演示：部分交互标签不可辨认，无法从图片核实连线归属。",
            evidence: [{ source: "demo-image-observation", reference: "student-notice", detail: "固定待确认案例，不作为自动增删或布局修改依据。" }],
            verification: "unverified", repairable: false }],
        } : { passed: true, issues: [], findings: [] });
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
  const pngRenderClient: PngRenderClient = async (artifact, signal) => {
    throwIfRunCancelled(record); signal?.throwIfAborted();
    const image = offlineReviewImage("feasibility", artifact.modelId ?? artifact.diagramKind);
    if (!image) throw new Error("固定可行性演示未准备对应模型的 PNG");
    return { png: Buffer.from(image.split(",")[1]!, "base64"), renderMeta: {
      engine: "offline-demo", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 0,
    } };
  };
  return { llmTransport, renderClient, pngRenderClient };
}
