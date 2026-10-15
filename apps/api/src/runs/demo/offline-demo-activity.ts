// Emits deliberately paced demo output over the normal durable event stream.
import { randomUUID } from "node:crypto";
import type { RunActivityEvent, RunInputImage, RunStage } from "@uml-platform/contracts";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { throwIfRunCancelled } from "../records/run-cancellation.js";

const diagramNames: Record<string, string> = {
  function: "功能模型", usecase: "用例图", class: "类图", activity: "活动图", deployment: "部署图",
  prototype: "界面模型", analysis: "需求分析模型", architecture: "架构图", sequence: "顺序图", component: "组件图", table: "数据表模型",
};

export interface DemoCall {
  title: string; subtaskId?: string; text: string;
  modelId?: string; operation?: RunActivityEvent["operation"]; round?: number;
  reasoning?: string; summary?: string; inputImages?: RunInputImage[];
}

function demoCalls(record: RunRecord, stage: RunStage): DemoCall[] {
  const snapshot = record.snapshot;
  if (["generate_models", "generate_design_sequence", "generate_design_models"].includes(stage) && "models" in snapshot) {
    const models = snapshot.models.filter((model) => stage === "generate_design_sequence" ? model.diagramKind === "sequence"
      : stage === "generate_design_models" ? model.diagramKind !== "sequence" : true);
    return models.map((model) => {
      const name = diagramNames[model.diagramKind] ?? "模型";
      return { title: `整理${name}`, subtaskId: "modelId" in model && model.modelId ? model.modelId : model.diagramKind,
        text: `已读取演示${name}。${"summary" in model && typeof model.summary === "string" ? model.summary.slice(0, 240) : "该模型的元素与关系将随结果一起展示。"}\n模型整理完成后，将继续准备图形预览。` };
    });
  }
  if (stage === "render_svg" && "svgArtifacts" in snapshot) {
    return [{ title: "准备图形预览",
      text: `本次演示包含 ${snapshot.plantUml.length} 份图形描述与 ${snapshot.svgArtifacts.length} 个已保存预览。\n已保存的预览会保留对应模型的归属，可在生成结果中查看。` }];
  }
  if (stage === "extract_rules" && "rules" in snapshot && "selectedDiagrams" in snapshot) {
    return [{ title: "整理需求规则",
      text: `已从演示数据读取 ${snapshot.rules?.length ?? 0} 条需求规则。\n本次选择 ${snapshot.selectedDiagrams.length} 类模型，后续过程将按步骤展开；多个模型会并行显示。` }];
  }
  
  if ("sections" in snapshot) {
    if (stage === "generate_document_text") return [{ title: "整理文档正文（演示）",
      text: snapshot.sections.slice(0, 2).map((section) => `${section.title}\n${section.body.join("\n").slice(0, 240)}`).join("\n\n") || "当前文档没有可展示的正文。" }];
    if (stage === "render_document_file") return [{ title: "准备文档排版（演示）", text: `已准备 ${snapshot.sections.length} 个章节。\n接下来排版并写入文档文件，文件生成后会提供下载入口。` }];
  }
  return [];
}

function beatDuration() {
  const raw = process.env.UML_DEMO_OFFLINE_STAGE_DELAY_MS;
  const parsed = raw?.trim() ? Number(raw) : NaN;
  // The existing setting now controls each demo beat; zero still keeps automated tests instant.
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 700;
}

async function pause(record: RunRecord, duration: number) {
  // Check cancellation during waits so slowing a demo never delays the stop action.
  for (let remaining = duration; remaining > 0; remaining -= 100) {
    throwIfRunCancelled(record);
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 100)));
  }
  throwIfRunCancelled(record);
}

function chunks(text: string, size: number) {
  const characters = Array.from(text);
  return Array.from({ length: Math.ceil(characters.length / size) }, (_, i) => characters.slice(i * size, (i + 1) * size).join(""));
}

export async function emitOfflineDemoCall(record: RunRecord, stage: RunStage, call: DemoCall) {
  throwIfRunCancelled(record);
  const beat = beatDuration();
  const callId = randomUUID();
  const emit = (phase: RunActivityEvent["phase"], text?: string) => {
    throwIfRunCancelled(record);
    emitEvent(record, { type: "run_activity", eventId: randomUUID(), createdAt: new Date().toISOString(),
      runId: record.snapshot.runId, stage, callId, subtaskId: call.subtaskId, subtaskLabel: call.title,
      modelId: call.modelId, operation: call.operation, round: call.round, format: "text", phase, text,
      ...(phase === "started" && call.inputImages?.length ? { inputImages: call.inputImages } : {}) });
  };
  emit("started");
  await pause(record, beat);
  // Only explicitly supplied fixture reasoning is shown, with its demo label retained.
  if (call.reasoning) {
    emit("thinking");
    for (const text of chunks(call.reasoning, Math.max(18, Math.ceil(Array.from(call.reasoning).length / 3)))) {
      emit("reasoning", text); await pause(record, beat);
    }
  }
  await pause(record, beat * 2);
  for (const text of chunks(call.text, Math.max(18, Math.ceil(Array.from(call.text).length / 8)))) {
    emit("output", text);
    await pause(record, beat);
  }
  if (call.summary) emit("summary", call.summary);
  emit("completed");
  return callId;
}

export async function emitOfflineDemoActivity(record: RunRecord, stage: RunStage) {
  // Independent calls start together and retain their own IDs, just like parallel provider calls.
  await Promise.all(demoCalls(record, stage).map((call) => emitOfflineDemoCall(record, stage, call)));
}
