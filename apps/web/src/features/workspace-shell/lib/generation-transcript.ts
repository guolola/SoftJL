// Projects ordered run events into user-readable steps, keeping parallel calls and retries separate.
import type { DiagramVisualReview, RunEvent, RunInputImage, RunStage } from "@uml-platform/contracts";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";
import { formatStageForDiagnostics, sanitizeDiagnosticText } from "../../workspace-session/lib/diagnostics";
import { isConfirmedVisualReview, visualReviewDetail } from "../../workspace-session/lib/visual-review-message";
import type { GenerationSubtask } from "../../workspace-session/model/session-state";

export type TranscriptStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "pending_review";
export interface TranscriptCall {
  id: string;
  stage?: RunStage;
  subtaskId?: string;
  title: string;
  status: TranscriptStatus;
  startedAt?: string;
  finishedAt?: string;
  output: string;
  reasoning?: string;
  inputImages?: RunInputImage[];
  summary: string;
  thinking: boolean;
  technical: boolean;
  message?: string;
  review?: DiagramVisualReview;
  operation?: string;
  round?: number;
}
export interface TranscriptStep {
  id?: string;
  stage: RunStage;
  title: string;
  messages: string[];
  calls: TranscriptCall[];
  entries?: Array<{ kind: "message"; text: string } | { kind: "call"; id: string }>;
  status: TranscriptStatus;
  finished?: boolean;
}

const order: RunStage[] = [
  "extract_rules", "generate_models", "generate_design_sequence", "generate_design_models",
  "generate_plantuml", "render_svg", "verify_diagram_visual",  
     
      
     
     
  "generate_document_text", "render_document_file", "generate_context", "render_context", "generate_business_flow", "render_business_flow", "generate_implementation", "generate_tests",
];
const feasibilityStages = new Set<RunStage>([
  "generate_context", "render_context", "generate_business_flow",
  "render_business_flow", "generate_implementation",
]);
const diagrams: Record<string, string> = {
  function: "功能模型", usecase: "用例图", class: "类图", activity: "活动图", deployment: "部署图",
  prototype: "界面模型", analysis: "需求分析模型", architecture: "架构图", sequence: "顺序图", component: "组件图", table: "数据表模型",
};

export function readableTaskText(text: string) {
  return sanitizeDiagnosticText(text)
    .replace(/https?:\/\/[^\s，。；）)]+/g, "服务地址")
    .replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/gi, "处理步骤")
    .replace(/\b[A-Za-z0-9_]{80,}\b/g, "详细信息已省略")
    .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, "处理信息")
    .replace(/\b(?:usecase|class|activity|deployment|prototype|analysis|architecture|sequence|component)\b/g, (word) => diagrams[word] ?? word);
}

function label(stage: RunStage) {
  const overrides: Partial<Record<RunStage, string>> = {
     
     generate_plantuml: "生成图形描述",
    render_svg: "生成图形预览", verify_diagram_visual: "视觉检查", render_document_file: "排版并生成文档",
     
  };
  return overrides[stage] ?? formatStageForDiagnostics(stage);
}

function callTitle(stage: RunStage, subtaskId?: string, subtaskLabel?: string) {
  if (subtaskLabel) return readableTaskText(subtaskLabel);
  const diagram = subtaskId?.split(":")[0];
  return diagram && diagrams[diagram] ? diagrams[diagram] : label(stage);
}

function newCall(id: string, title: string, at?: string, subtaskId?: string): TranscriptCall {
  return { id, title, subtaskId, startedAt: at, status: "running", output: "", reasoning: "", summary: "", thinking: false, technical: true };
}

function visualProgressMessage(status: TranscriptStatus, skipped = false) {
  if (skipped) return "视觉检查已跳过";
  if (status === "failed") return "视觉检查未完成，可重试。";
  if (status === "completed" || status === "pending_review") return "视觉检查已结束";
  return "正在检查模型与图形";
}

// Surface a real natural-language summary while JSON is arriving, without displaying its wire structure.
export function readableOutput(call: TranscriptCall) {
  if (!call.technical) return call.output;
  if (call.stage === "generate_document_text") {
    const paragraphs: string[] = [];
    // Document body arrays contain prose. Decode only those strings, including the
    // current incomplete string, so JSON scaffolding never enters the conversation.
    for (const match of call.output.matchAll(/"body"\s*:\s*\[/g)) {
      let cursor = match.index! + match[0].length;
      while (cursor < call.output.length) {
        while (/[\s,]/.test(call.output[cursor] ?? "") && cursor < call.output.length) cursor++;
        if (call.output[cursor] !== '"') break;
        const start = ++cursor;
        while (cursor < call.output.length && call.output[cursor] !== '"') {
          cursor += call.output[cursor] === "\\" ? 2 : 1;
        }
        try { paragraphs.push(JSON.parse(`"${call.output.slice(start, Math.min(cursor, call.output.length))}"`)); }
        catch { /* A split escape sequence is rendered when its next chunk arrives. */ }
        cursor++;
      }
    }
    return paragraphs.join("\n\n");
  }
  const match = /"summary"\s*:\s*"((?:\\.|[^"\\])*)/.exec(call.output);
  if (!match) return "";
  try { return readableTaskText(JSON.parse(`"${match[1]}"`) as string); }
  catch { return ""; }
}

export function projectGenerationTranscript(events: RunEvent[], fallbackStatus = "running", subtasks: GenerationSubtask[] = [], currentVisualReviews: Record<string, DiagramVisualReview> = {}, options: { includeContent?: boolean } = {}) {
  // The drawer keeps lifecycle state without projecting streamed text or large review findings.
  const includeContent = options.includeContent ?? true;
  const repairSubtask = subtasks.find((subtask) => subtask.id === "repair_rules");
  const rulesOnly = Boolean(repairSubtask) || events.some((event) =>
    event.type === "completed" && "selectedDiagrams" in event.snapshot &&
    Array.isArray(event.snapshot.selectedDiagrams) && event.snapshot.selectedDiagrams.length === 0,
  );
  const steps: TranscriptStep[] = [];
  const currentSteps = new Map<RunStage, TranscriptStep>();
  const startedOrder = new Map<TranscriptCall, number>();
  const mirrorOrder = new Map<TranscriptCall, number>();
  let eventIndex = 0;
  const seen = new Set<string>();
  let status = fallbackStatus;
  let finalMessage = "";
  let terminalAt: string | undefined;
  let lastStage: RunStage | undefined;
  let completed: Extract<RunEvent, { type?: "completed" }> | undefined;
  const getStep = (stage: RunStage) => {
    if (!currentSteps.has(stage)) {
      const step: TranscriptStep = { id: `${stage}:${steps.filter((item) => item.stage === stage).length}`, stage, title: label(stage), messages: [], calls: [], entries: [], status: "running", finished: false };
      steps.push(step);
      currentSteps.set(stage, step);
    }
    return currentSteps.get(stage)!;
  };
  const getCall = (step: TranscriptStep, id: string, at?: string, subtaskId?: string, subtaskLabel?: string) => {
    let call = step.calls.find((item) => item.id === id);
    if (!call) {
      call = newCall(id, callTitle(step.stage, subtaskId, subtaskLabel), at, subtaskId);
      call.stage = step.stage;
      startedOrder.set(call, eventIndex);
      step.calls.push(call); step.entries?.push({ kind: "call", id });
    }
    return call;
  };
  const activityStages = new Set(events.flatMap((event) => event.type === "run_activity" ? [event.stage] : []));
  const lifecycleStages = new Set(events.flatMap((event) => event.type === "stage_finished" || (event.type === "stage_started" && event.tracksCompletion) ? [event.stage] : []));
  const activityIds = new Set(events.flatMap((event) => event.type === "run_activity" ? [event.callId] : []));
  const legacyDemoSummaryCalls = new Set(events.flatMap((event) =>
    event.type === "run_activity" && event.phase === "summary" && event.format === "text" &&
    event.text?.includes("演示思考摘要") ? [event.callId] : [],
  ));
  for (const event of events) {
    eventIndex++;
    if (event.eventId && seen.has(event.eventId)) continue;
    if (event.eventId) seen.add(event.eventId);
    if (completed) break;
    // Empty diagram selections still emit an internal generate_models phase.
    if (rulesOnly && "stage" in event && event.stage === "generate_models") continue;
    const at = event.createdAt;
    if (event.type === "run_activity") {
      const step = getStep(event.stage);
      const call = getCall(step, event.callId, at, event.subtaskId, event.subtaskLabel);
      if (event.operation) {
        call.operation = event.operation; call.round = event.round;
        const operationNames = { structure_check: "结构核对", model_repair: "结构纠错", render_repair: "重建图形", visual_check: event.round ? "视觉复查" : "视觉检查" };
        call.title = `${callTitle(event.stage, event.subtaskId, event.subtaskLabel)} · ${operationNames[event.operation]}${event.round ? ` · 第 ${event.round} 轮` : ""}`;
      }
      call.technical = event.format === "technical";
      if (event.inputImages?.length) call.inputImages = [...new Map([...(call.inputImages ?? []), ...event.inputImages].map((image) => [image.url, image])).values()];
      if (event.phase === "output") { if (includeContent) call.output += event.text ?? ""; call.thinking = false; }
      if (event.phase === "reasoning") { if (includeContent) call.reasoning = (call.reasoning ?? "") + (event.text ?? ""); call.thinking = true; }
      if (event.phase === "summary" && !legacyDemoSummaryCalls.has(event.callId)) {
        if (includeContent) call.summary += event.text ?? "";
        call.thinking = true;
      }
      // A thinking marker alone contains no provider reasoning to display.
      if (event.phase === "completed" || event.phase === "failed") {
        call.status = event.phase; call.finishedAt = at; call.thinking = false;
      }
      continue;
    }
    if (event.type === "stage_started") {
      if (event.stage === "verify_diagram_visual" && lastStage && lastStage !== event.stage) {
        const previousVisual = currentSteps.get(event.stage);
        if (previousVisual && !previousVisual.finished) {
          previousVisual.finished = true;
          previousVisual.status = "completed";
          currentSteps.delete(event.stage);
        }
      }
      // Older feasibility runs have no stage_finished events; the next sequential
      // stage start is the completion boundary for the previous stage.
      if (lastStage && lastStage !== event.stage &&
          feasibilityStages.has(lastStage) && feasibilityStages.has(event.stage)) {
        const previous = currentSteps.get(lastStage);
        if (previous && !previous.finished) {
          previous.finished = true;
          previous.status = "completed";
          for (const call of previous.calls) {
            if (call.status === "running" || call.status === "queued") {
              call.status = "completed";
              call.finishedAt = at;
              call.thinking = false;
            }
          }
        }
      }
      lastStage = event.stage;
      // A later verification/repair pass is a new step, rather than rewriting history.
      if (currentSteps.get(event.stage)?.finished && lifecycleStages.has(event.stage)) currentSteps.delete(event.stage);
      getStep(event.stage);
    } else if (event.type === "stage_finished") {
      const step = getStep(event.stage);
      step.finished = true;
      step.status = event.status;
      for (const call of step.calls) {
        if (["running", "queued"].includes(call.status)) {
          call.status = event.status; call.finishedAt = at; call.thinking = false;
        }
      }
    } else if (event.type === "stage_progress") {
      const step = getStep(event.stage);
      const subtaskId = event.subtaskId ?? event.modelId ?? event.diagramKind;
      const text = !includeContent && event.stage === "verify_diagram_visual"
        ? visualProgressMessage(event.subtaskStatus === "repairing" || event.subtaskStatus === "rendering" ? "running" : event.subtaskStatus ?? "running", Boolean(event.message?.includes("跳过")))
        : event.message ? readableTaskText(event.message) : "";
      if (subtaskId) {
        const call = getCall(step, `${event.stage}:${subtaskId}`, at, subtaskId, event.subtaskLabel);
        call.status = event.subtaskStatus === "repairing" || event.subtaskStatus === "rendering" ? "running" : event.subtaskStatus ?? "running";
        call.message = text;
        mirrorOrder.set(call, eventIndex);
        if (["completed", "failed", "pending_review"].includes(call.status)) call.finishedAt = at;
      } else if (text && !step.messages.includes(text)) {
        step.messages.push(text);
        step.entries?.push({ kind: "message", text });
      }
    } else if (event.type === "llm_chunk" && !activityStages.has(event.stage)) {
      const call = getCall(getStep(event.stage), `${event.stage}:legacy`, at);
      if (includeContent) {
        call.output += event.chunk;
        call.technical = /^[\s]*[[{`]/.test(call.output);
      }
    } else if (event.type === "artifact_ready") {
      const step = getStep(event.stage);
      const subtaskId = event.subtaskId ?? event.modelId ?? event.diagramKind;
      if (subtaskId) {
        const call = getCall(step, `${event.stage}:${subtaskId}`, at, subtaskId, event.subtaskLabel);
        call.status = event.subtaskStatus === "pending_review" ? "pending_review" : "completed";
        call.finishedAt = at;
        mirrorOrder.set(call, eventIndex);
      } else {
        // Older streams have no finish event. Only known aggregate artifacts close a stage.
        const legacyBoundary = ({ extract_rules: "requirementBaseline", generate_models: "model", generate_design_models: "model",     render_document_file: "document" } as Partial<Record<RunStage, string>>)[event.stage];
        if (!lifecycleStages.has(event.stage) && event.artifactKind === legacyBoundary) {
          step.finished = true; step.status = "completed";
        }
        const artifactNames: Record<string, string> = {
          rules: "整理需求规则", requirementBaseline: "确认需求基线", businessLogic: "整理业务逻辑",
          document: "生成可下载文档",  
           
           
        };
        if (artifactNames[event.artifactKind] && !activityStages.has(event.stage)) {
          const call = getCall(step, `${event.stage}:artifact:${event.artifactKind}`, undefined);
          call.title = artifactNames[event.artifactKind]; call.status = "completed"; call.finishedAt = at;
        }
        
      }
    } else if (event.type === "completed") {
      terminalAt = at;
      completed = event; status = "completed";
      const snapshot = event.snapshot;
      const failures = "diagramErrors" in snapshot ? Object.keys(snapshot.diagramErrors ?? {}).length : 0;
      if ("diagramErrors" in snapshot) for (const [id, failure] of Object.entries(snapshot.diagramErrors ?? {})) {
        if (!failure) continue;
        const stage = failure.stage ?? "generate_models";
        const call = getCall(getStep(stage), `${stage}:${id}`, at, id);
        call.status = "failed"; call.message = "此模型未能完成生成，可重试。"; call.finishedAt = at;
        mirrorOrder.set(call, eventIndex);
      }
      if (failures) { status = "failed"; finalMessage = `生成结束，${failures} 个模型未完成，可重试失败项。`; }
      else if ("documentKind" in snapshot) finalMessage = `文档已生成${snapshot.fileName ? `：${snapshot.fileName}` : ""}。`;
      else if ("svgArtifacts" in snapshot) {
        const visualReviews = "visualReviews" in snapshot ? Object.entries(snapshot.visualReviews ?? {}) : [];
        const pending = visualReviews.filter(([id, review]) => (review.status === "pending_review" || review.status === "not_completed") && !isConfirmedVisualReview(review, currentVisualReviews[id])).length;
        const skipped = visualReviews.filter(([, review]) => review.status === "skipped").length;
        finalMessage = `已生成 ${event.previewCount ?? snapshot.svgArtifacts.length} 个图形预览。${includeContent && pending ? `${pending} 个视觉检查待确认。` : ""}${skipped ? `${skipped} 个视觉检查已跳过。` : ""}`;
      }
      else finalMessage = "生成完成，可以查看结果。";
    } else if (event.type === "failed" || event.type === "cancelled") {
      terminalAt = at;
      status = event.type;
      finalMessage = event.type === "failed"
        ? readableTaskText(localizeRunFailure(event.error, "生成任务失败，请稍后重试。"))
        : "任务已停止，已完成的过程保留。";
      break;
    }
  }
  const startupValidation = subtasks.find(
    (subtask) => subtask.id === "start_validation",
  );
  if (startupValidation) {
    const step = getStep("extract_rules");
    step.title = readableTaskText(startupValidation.label);
    const call = getCall(
      step,
      "extract_rules:start_validation",
      undefined,
      undefined,
      startupValidation.label,
    );
    call.title = readableTaskText(startupValidation.label);
    call.status = startupValidation.status as TranscriptStatus;
    if (startupValidation.status === "failed") {
      const localizedMessage = startupValidation.messageCode
        ? localizeRunFailure(
            {
              code: startupValidation.messageCode,
              params: startupValidation.messageParams,
            },
            "生成任务失败，请稍后重试。",
          )
        : "生成任务失败，请稍后重试。";
      call.message = localizedMessage;
      finalMessage = localizedMessage;
      status = "failed";
    }
  }
  if (repairSubtask && (currentSteps.get("extract_rules")?.finished || repairSubtask.status !== "queued")) {
    const repairActive = ["queued", "running", "repairing", "rendering"].includes(repairSubtask.status);
    if (repairActive) {
      status = "running";
      finalMessage = "";
      completed = undefined;
    }
    const repairStatus: TranscriptStatus = repairActive ? "running" : repairSubtask.status as TranscriptStatus;
    const call: TranscriptCall = {
      id: "local:repair_rules", title: repairSubtask.label, status: repairStatus,
      output: "", summary: "", thinking: false, technical: false,
      message: repairSubtask.status === "pending_review"
        ? `${repairSubtask.pendingReviewCount ?? 1} 条需求规则修复结果待确认`
        : repairSubtask.errorMessage ?? repairSubtask.message ?? undefined,
    };
    steps.push({
      id: "local:repair_rules", stage: "extract_rules", title: repairSubtask.label,
      messages: [], calls: [call], entries: [{ kind: "call", id: call.id }],
      status: repairStatus, finished: !repairActive,
    });
  }
  const terminal = !["queued", "running", "idle"].includes(status);
  for (const step of steps) {
    // Apply confirmed artifact/review state without showing unstarted placeholder steps.
    for (const subtask of currentSteps.get(step.stage) === step ? subtasks : []) {
      const prefix = `${step.stage}:`;
      if (!subtask.id.startsWith(prefix) && subtask.id !== step.stage) continue;
      if (subtask.status === "queued" && !step.calls.some((call) => call.subtaskId === subtask.id.slice(prefix.length))) continue;
      const rawId = subtask.id.startsWith(prefix) ? subtask.id.slice(prefix.length) : subtask.id;
      const call = getCall(step, `${step.stage}:${rawId}`, undefined, rawId, subtask.label);
      call.title = readableTaskText(subtask.label);
      call.status = ["repairing", "rendering"].includes(subtask.status) ? "running" : subtask.status as TranscriptStatus;
      if (subtask.status === "pending_review") {
        const savedReview = step.stage === "verify_diagram_visual" && completed && "visualReviews" in completed.snapshot
          ? completed.snapshot.visualReviews?.[rawId]
          : undefined;
        call.message = !includeContent && step.stage === "verify_diagram_visual"
          ? visualProgressMessage("pending_review")
          : visualReviewDetail(savedReview) ?? subtask.message ?? `有 ${subtask.pendingReviewCount ?? 1} 条追踪关系需复核`;
      }
      else if (subtask.status === "failed") {
        call.message = subtask.messageCode
          ? localizeRunFailure(
              { code: subtask.messageCode, params: subtask.messageParams },
              "生成任务失败，请稍后重试。",
            )
          : "此模型未能完成生成，可重试。";
      }
    }
    for (const call of step.calls) {
      if (step.stage === "verify_diagram_visual" && call.status !== "failed" && call.subtaskId && completed && "visualReviews" in completed.snapshot &&
        isConfirmedVisualReview(completed.snapshot.visualReviews?.[call.subtaskId], currentVisualReviews[call.subtaskId])) {
        call.status = "completed";
        call.message = "已人工确认当前图";
      }
      if (terminal && ["running", "queued"].includes(call.status)) {
        call.status = status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed";
        call.finishedAt = terminalAt;
        call.thinking = false;
      }
    }
    if (step.stage === "verify_diagram_visual" && step.status === "pending_review" && step.calls.every((call) => call.status !== "pending_review")) {
      step.status = "completed";
    }
    // Fold lifecycle mirrors into the latest actual attempt; keep earlier failed attempts intact.
    const redundant = new Set<string>();
    for (const mirror of step.calls.filter((call) => !activityIds.has(call.id) && call.subtaskId)) {
      const actual = [...step.calls].reverse().find((call) => activityIds.has(call.id) && call.subtaskId === mirror.subtaskId);
      if (!actual) continue;
      if (["failed", "pending_review"].includes(mirror.status) && (mirrorOrder.get(mirror) ?? startedOrder.get(mirror) ?? -1) >= (startedOrder.get(actual) ?? 0)) {
        actual.status = mirror.status; actual.message = mirror.message;
      } else if (step.stage === "verify_diagram_visual" && mirror.status === "completed" && mirror.message?.includes("跳过")) {
        // Unsupported image input is a handled skip; preserve the trace without presenting a failed task.
        actual.status = "completed"; actual.message = mirror.message; actual.thinking = false;
      } else if (!actual.message && mirror.message && /修复|重试|补跑/.test(mirror.message)) actual.message = mirror.message;
      redundant.add(mirror.id);
    }
    step.calls = step.calls.filter((call) => !redundant.has(call.id));
    step.entries = step.entries?.filter((entry) => entry.kind !== "call" || !redundant.has(entry.id));
    if (step.stage === "verify_diagram_visual" && completed && "visualReviews" in completed.snapshot) {
      const latestCalls = new Map(step.calls.filter((call) => call.subtaskId).map((call) => [call.subtaskId!, call]));
      for (const [subtaskId, call] of latestCalls) {
        const review = completed.snapshot.visualReviews?.[subtaskId];
        if (review) {
          if (includeContent) call.review = review;
          call.status = review.status === "failed" ? "failed" : review.status === "not_completed" || (review.status === "pending_review" && !isConfirmedVisualReview(review, currentVisualReviews[subtaskId])) ? "pending_review" : "completed";
          call.message = isConfirmedVisualReview(review, currentVisualReviews[subtaskId])
            ? "已人工确认当前图" : includeContent ? visualReviewDetail(review) ?? undefined : visualProgressMessage(call.status);
          call.thinking = false;
        }
        if (review?.status === "skipped") {
          call.status = "completed";
          call.message = includeContent
            ? review.reason.includes("跳过") ? review.reason : `已跳过视觉检查：${review.reason}`
            : visualProgressMessage("completed", true);
          call.thinking = false;
        }
      }
    }
    if (!step.finished) {
      step.status = terminal ? status === "cancelled" ? "cancelled" : status === "completed" ? "completed" : "failed" : "running";
    }
    if (step.stage === "verify_diagram_visual") {
      if (step.calls.some((call) => call.status === "failed")) step.status = "failed";
      else if (step.calls.some((call) => call.status === "pending_review")) step.status = "pending_review";
    }
    if (terminal) step.finished = true;
  }
  // UML render events can arrive before other model producers have finished. Code repair
  // passes, on the other hand, retain their actual sequence (check -> repair -> recheck).
  const diagramFlow = steps.some((step) => ["extract_rules", "generate_models", "generate_design_sequence", "generate_design_models"].includes(step.stage));
  if (diagramFlow) steps.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  // Parallel model/render stages already have events, even while an earlier stage is open.
  return { steps, visibleSteps: steps, status, finalMessage, completed };
}
