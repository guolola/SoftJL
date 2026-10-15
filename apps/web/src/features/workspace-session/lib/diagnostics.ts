// Converts run events into bounded diagnostics state for the workspace shell.

import type { RunEvent, RunStage } from "@uml-platform/contracts";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";
import type { DiagnosticEvent, RunDiagnostics } from "../model/session-state";
import { isTerminalRunEvent } from "./run-events";
import { appendTranscriptEvent } from "./run-transcript";

export const MAX_DIAGNOSTIC_STREAM_CHARS = 30_000;

export function createEmptyDiagnostics(): RunDiagnostics {
  return {
    runKind: null,
    runId: null,
    providerModel: null,
    startedAt: null,
    finishedAt: null,
    activeStage: null,
    streamText: "",
    chunkCount: 0,
    stageStartedAt: {},
    stageMessages: {},
    events: [],
    
    
    
    
    
    
    
    
    requirementTrace: [],
    designTrace: [],
    
  };
}

export function formatStageForDiagnostics(stage: RunStage | null) {
  if (!stage) return "等待任务";
  const labels: Record<RunStage, string> = {
    extract_rules: "抽取需求规则",
    generate_models: "生成需求模型",
    generate_design_sequence: "生成用例实现设计",
    generate_design_models: "生成设计模型",
    generate_tests: "生成测试用例",
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    generate_document_text: "生成说明书正文",
    render_document_file: "写入说明书文件",
    generate_plantuml: "生成图源码",
    render_svg: "渲染图像",
    verify_diagram_visual: "视觉检查",
    generate_context: "生成系统环境图",
    generate_business_flow: "生成业务与系统流程图",
    render_business_flow: "渲染业务与系统流程图",
    render_context: "渲染系统环境图",
    generate_implementation: "生成实现方案",
  };
  return labels[stage];
}

export function sanitizeDiagnosticText(text: string) {
  const replacements = [
    ["extract_rules", "抽取需求规则"],
    ["generate_models", "生成需求模型"],
    ["generate_design_sequence", "生成用例实现设计"],
    ["generate_design_models", "生成设计模型"],
    ["generate_tests", "生成测试用例"],
    [ "分析业务逻辑"],
    [ "分析业务背景"],
    [ "规划界面方案"],
    [ "生成界面设计图"],
    [ "解析界面设计图"],
    [ "生成结构化 UI IR"],
    [ "加载前端设计执行器"],
    [ "选择前端设计执行器"],
    [ "规划文件结构"],
    [ "生成代码规格"],
    [ "生成代码文件"],
    [ "制定实现步骤"],
    [ "写入原型文件"],
    [ "检查原型质量"],
    [ "检查设计图还原度"],
    [ "验证渲染预览"],
    [ "验证业务断言"],
    [ "检查预览入口"],
    [ "修复代码输出"],
    ["generate_document_text", "生成说明书正文"],
    ["render_document_file", "写入说明书文件"],
    ["generate_plantuml", "生成图源码"],
    ["render_svg", "渲染图像"],
    ["verify_diagram_visual", "视觉检查"],
    ["PlantUML", "图源码"],
    ["SVG", "图像"],
    [ "代码文件"],
    [ "代码规格"],
    [ "界面设计图"],
    ["uiReferenceSpec", "界面设计图解析"],
    [ "业务逻辑"],
    ["uiFidelityReport", "业务/界面覆盖检查"],
    ["designTokens", "设计 Token"],
    ["componentRegistry", "组件 Registry"],
    ["uiIr", "结构化 UI IR"],
    ["visualDiffReport", "预览验证报告"],
    ["ui-ux-pro-max", "前端设计执行器"],
  ];
  return replacements.reduce(
    (current, [source, target]) => current.split(source).join(target),
    text,
  );
}

export function appendDiagnosticStream(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= MAX_DIAGNOSTIC_STREAM_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_DIAGNOSTIC_STREAM_CHARS);
}

export function isMeaningfulLlmChunkEvent(
  event: RunEvent,
): boolean {
  return event.type === "llm_chunk" && event.chunk.trim().length > 0;
}

export function shouldDisplayDiagnosticEvent(event: RunEvent) {
  return event.type !== "llm_chunk" && event.type !== "run_activity" && event.type !== "stage_finished";
}

export function summarizeEvent(event: RunEvent): DiagnosticEvent {
  const at = new Date().toISOString();
  const suffix = `${at}:${Math.random().toString(36).slice(2, 8)}`;
  switch (event.type) {
    case "run_activity":
      return { id: event.eventId, at: event.createdAt, label: formatStageForDiagnostics(event.stage), detail: null };
    case "run_action":
      return { id: event.eventId ?? suffix, at, label: "任务操作", detail: null };
    case "queued":
      return { id: `${suffix}:queued`, at, label: "已排队", detail: "任务已进入队列" };
    case "stage_started":
      return {
        id: `${suffix}:stage_started:${event.stage}`,
        at,
        label: "阶段开始",
        detail: `${formatStageForDiagnostics(event.stage)}已开始`,
      };
    case "stage_finished":
      return { id: event.eventId ?? suffix, at: event.createdAt ?? at, label: "阶段结束", detail: formatStageForDiagnostics(event.stage) };
    case "stage_progress":
      return {
        id: `${suffix}:stage_progress:${event.stage}:${event.progress}`,
        at,
        label: "阶段进度",
        detail: sanitizeDiagnosticText(
          event.message ?? `${formatStageForDiagnostics(event.stage)} ${event.progress}%`,
        ),
      };
    case "artifact_ready":
      return {
        id: `${suffix}:artifact_ready:${event.artifactKind}:${event.diagramKind ?? "all"}`,
        at,
        label: "产物已生成",
        detail:
          event.artifactKind === "document"
            ? "说明书文件已准备好"
            : `${formatStageForDiagnostics(event.stage)}的产物已准备好`,
      };
    
    case "completed":
      if ("files" in event.snapshot) {
        return {
          id: `${suffix}:completed`,
          at,
          label: "任务完成",
          detail: `完成，代码文件 ${Object.keys(event.snapshot.files).length} 个`,
        };
      }
      if ("documentKind" in event.snapshot) {
        return {
          id: `${suffix}:completed`,
          at,
          label: "任务完成",
          detail: `完成，说明书 ${event.snapshot.fileName ?? ""}`,
        };
      }
      return {
        id: `${suffix}:completed`,
        at,
        label: "任务完成",
        detail:
          "svgArtifacts" in event.snapshot
            ? `完成，图像 ${event.snapshot.svgArtifacts.length} 个`
            : "完成",
      };
    case "failed":
      return {
        id: `${suffix}:failed`,
        at,
        label: "任务失败",
        detail: sanitizeDiagnosticText(
          localizeRunFailure(event.error, "生成任务失败，请稍后重试。"),
        ),
      };
    case "cancelled":
      return {
        id: `${suffix}:cancelled`,
        at,
        label: "任务已取消",
        detail: sanitizeDiagnosticText(event.message),
      };
    case "llm_chunk":
      if (!isMeaningfulLlmChunkEvent(event)) {
        return {
          id: `${suffix}:llm_blank_chunk:${event.stage}`,
          at,
          label: "收到空白片段",
          detail: `${formatStageForDiagnostics(event.stage)}等待有效模型输出`,
        };
      }
      return {
        id: `${suffix}:llm_chunk:${event.stage}`,
        at,
        label: "收到模型输出",
        detail: `${formatStageForDiagnostics(event.stage)}收到模型输出`,
      };
  }
}

export function getProgressFromEvent(event: RunEvent) {
  switch (event.type) {
    case "queued":
      return 5;
    case "stage_started":
      switch (event.stage) {
        case "extract_rules":
          return 20;
        case "generate_models":
          return 65;
        case "generate_design_sequence":
          return 45;
        case "generate_design_models":
          return 70;
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        case "generate_document_text":
          return 55;
        case "render_document_file":
          return 90;
        case "generate_plantuml":
          return 80;
        case "render_svg":
          return 95;
      }
      return null;
    case "stage_progress":
      return event.progress;
    case "completed":
      return 100;
    case "failed":
      return 100;
    case "cancelled":
      return 100;
    case "llm_chunk":
    case "artifact_ready":
    
    case "stage_finished":
      return null;
  }
}

export function deriveRunDiagnosticsFromEvent(
  current: RunDiagnostics,
  event: RunEvent,
  diagnosticEvent: DiagnosticEvent,
) {
  const meaningfulChunk = isMeaningfulLlmChunkEvent(event);
  return {
    ...current,
    transcript: appendTranscriptEvent(current.transcript ?? [], event),
    finishedAt: isTerminalRunEvent(event)
      ? diagnosticEvent.at
      : current.finishedAt,
    activeStage: "stage" in event ? event.stage : current.activeStage,
    streamText: meaningfulChunk && event.type === "llm_chunk"
      ? appendDiagnosticStream(current.streamText, event.chunk)
      : current.streamText,
    chunkCount: meaningfulChunk ? current.chunkCount + 1 : current.chunkCount,
    stageStartedAt:
      event.type === "stage_started"
        ? {
            ...current.stageStartedAt,
            [event.stage]: diagnosticEvent.at,
          }
        : current.stageStartedAt,
    stageMessages:
      event.type === "stage_progress" && event.message
        ? { ...current.stageMessages, [event.stage]: event.message }
        : current.stageMessages,
    designTrace:
      event.type === "completed" && "designTrace" in event.snapshot
        ? (event.snapshot.designTrace ?? [])
        : current.designTrace,
    requirementTrace:
      event.type === "completed" && "requirementTrace" in event.snapshot
        ? (event.snapshot.requirementTrace ?? [])
        : current.requirementTrace,
    events: shouldDisplayDiagnosticEvent(event)
      ? [...current.events, diagnosticEvent].slice(-80)
      : current.events,
  } satisfies RunDiagnostics;
}



export function addLocalFailureToRunDiagnostics(
  current: RunDiagnostics,
  detail: string,
  options?: {
    idSuffix?: string;
    label?: string;
  },
) {
  const at = new Date().toISOString();
  return {
    ...current,
    finishedAt: at,
    events: [
      ...current.events,
      {
        id: `${at}:${options?.idSuffix ?? "failed-local"}`,
        at,
        label: options?.label ?? "failed",
        detail,
      },
    ].slice(-80),
  } satisfies RunDiagnostics;
}
