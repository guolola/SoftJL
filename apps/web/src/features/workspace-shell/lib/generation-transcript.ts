// Projects ordered run events into user-readable steps, keeping parallel calls and retries separate.
import type { DiagramVisualReview, RunError, RunEventInput, RunInputImage, RunStage } from "@uml-platform/contracts";
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "@uml-platform/contracts";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";
import { formatStageForDiagnostics, sanitizeDiagnosticText } from "../../workspace-session/lib/diagnostics";
import { isConfirmedVisualReview, visualReviewDetail } from "../../workspace-session/lib/visual-review-message";
import type { GenerationSubtask } from "../../workspace-session/model/session-state";
import { generationFailureSummary } from "./generation-failure-summary";
import { DIAGRAM_META, DESIGN_DIAGRAM_META } from "../../../entities/diagram/model";

export type TranscriptStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "pending_review";
export interface TranscriptCall {
  id: string;
  stage?: RunStage;
  subtaskId?: string;
  modelId?: string;
  diagramKind?: string;
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
  coverageMessage?: string;
  coverageIncomplete?: boolean;
  structureCheckCount?: number;
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
  children?: TranscriptStep[];
  artifactTask?: boolean;
  artifactGroup?: boolean;
  diagramKind?: string;
  compactCalls?: boolean;
  phase?: "coverage-repair";
}

const order: RunStage[] = [
  "extract_rules", "generate_models", "generate_design_sequence", "generate_design_models",
  "generate_plantuml", "render_svg", "verify_diagram_visual",


  "generate_document_text", "render_document_file", "generate_context", "render_context", "generate_business_flow", "render_business_flow", "generate_implementation", "generate_tests",
];
const diagrams: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DESIGN_DIAGRAM_META).map(([kind, meta]) => [kind, meta.label])),
  ...Object.fromEntries(Object.entries(DIAGRAM_META).map(([kind, meta]) => [kind, meta.label])),
};

export function readableTaskText(text: string) {
  return sanitizeDiagnosticText(text)
    .replace(/https?:\/\/[^\s，。；）)]+/g, "服务地址")
    .replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/gi, "处理步骤")
    .replace(/\b[A-Za-z0-9_]{80,}\b/g, "详细信息已省略")
    .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, "处理信息")
    .replace(/\b(?:function|usecase|class|activity|deployment|prototype|analysis|architecture|sequence|component|table)\b/g, (word) => diagrams[word] ?? word);
}

function label(stage: RunStage) {
  const overrides: Partial<Record<RunStage, string>> = {

     generate_plantuml: "生成图形描述",
    generate_business_flow: "生成业务流程图", render_business_flow: "渲染业务流程图",
    render_svg: "生成图形预览", verify_diagram_visual: "模型结构检查", render_document_file: "排版并生成文档",

  };
  return overrides[stage] ?? formatStageForDiagnostics(stage);
}

function callTitle(stage: RunStage, subtaskId?: string, subtaskLabel?: string) {
  // Feasibility uses the activity contract but has its own user-facing artifact name.
  if (stage === "generate_business_flow" || stage === "render_business_flow") return "业务流程图";
  if (subtaskLabel) return readableTaskText(subtaskLabel);
  const diagram = subtaskId?.split(":")[0];
  return diagram && diagrams[diagram] ? diagrams[diagram] : label(stage);
}

function newCall(id: string, title: string, at?: string, subtaskId?: string): TranscriptCall {
  return { id, title, subtaskId, startedAt: at, status: "running", output: "", reasoning: "", summary: "", thinking: false, technical: true };
}

function modelProgressMessage(status: TranscriptStatus, skipped = false) {
  if (skipped) return "模型结构检查已跳过";
  if (status === "failed") return "模型结构检查未完成，可重试。";
  if (status === "completed" || status === "pending_review") return "模型结构检查已结束";
  return "正在检查模型结构";
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

export function projectGenerationTranscript(events: RunEventInput[], fallbackStatus = "running", subtasks: GenerationSubtask[] = [], currentVisualReviews: Record<string, DiagramVisualReview> = {}, options: { includeContent?: boolean } = {}) {
  // The drawer keeps lifecycle state without projecting streamed text or large review findings.
  const includeContent = options.includeContent ?? true;
  const rulesOnly = events.some((event) =>
    event.type === "completed" && "selectedDiagrams" in event.snapshot &&
    Array.isArray(event.snapshot.selectedDiagrams) && event.snapshot.selectedDiagrams.length === 0,
  );
  const steps: TranscriptStep[] = [];
  const currentSteps = new Map<RunStage, TranscriptStep>();
  const startedOrder = new Map<TranscriptCall, number>();
  const mirrorOrder = new Map<TranscriptCall, number>();
  const structureChecks = new Map<string, number>();
  let eventIndex = 0;
  const seen = new Set<string>();
  let status = fallbackStatus;
  let finalMessage = "";
  let terminalAt: string | undefined;
  let lastStage: RunStage | undefined;
  let completed: Extract<RunEventInput, { type?: "completed" }> | undefined;
  const modelFailures = new Map<string, { stage: RunStage; id: string; error: RunError }>();
  const failureTarget = (stage: RunStage, id?: string) => {
    const calls = steps.flatMap((step) => step.calls);
    const matches = id ? [...calls].reverse().filter((call) =>
      (call.modelId === id || call.subtaskId === id || call.diagramKind === id) && call.title.split(" · ")[0] !== label(stage),
    ) : [];
    // A terminal snapshot can append a generic type-only failure after the named model's events.
    const matching = matches.find((call) => !Object.values(diagrams).includes(call.title.split(" · ")[0]!)) ?? matches[0];
    const stageTargets: Partial<Record<RunStage, string>> = {
      extract_rules: "系统需求", generate_context: "系统环境图", render_context: "系统环境图",
      generate_business_flow: "业务流程图", render_business_flow: "业务流程图", generate_implementation: "实现方案",
      generate_document_text: "说明书正文", render_document_file: "说明书文件", generate_tests: "测试用例",
    };
    return matching?.title.split(" · ")[0] ?? (id && diagrams[id.split(":")[0]!]) ?? stageTargets[stage] ?? label(stage);
  };
  const getStep = (stage: RunStage) => {
    if (!currentSteps.has(stage)) {
      const step: TranscriptStep = { id: `${stage}:${steps.filter((item) => item.stage === stage).length}`, stage, title: label(stage), messages: [], calls: [], entries: [], status: "running", finished: false };
      steps.push(step);
      currentSteps.set(stage, step);
    }
    return currentSteps.get(stage)!;
  };
  const getCall = (step: TranscriptStep, id: string, at?: string, subtaskId?: string, subtaskLabel?: string, metadata: { modelId?: string; diagramKind?: string } = {}) => {
    let call = step.calls.find((item) => item.id === id);
    if (!call) {
      call = { ...newCall(id, callTitle(step.stage, subtaskId, subtaskLabel), at, subtaskId), ...metadata };
      call.stage = step.stage;
      startedOrder.set(call, eventIndex);
      step.calls.push(call); step.entries?.push({ kind: "call", id });
    } else {
      call.modelId ??= metadata.modelId;
      call.diagramKind ??= metadata.diagramKind;
    }
    return call;
  };
  const activityIds = new Set(events.flatMap((event) => event.type === "run_activity" ? [event.callId] : []));
  for (const event of events) {
    eventIndex++;
    if (event.eventId && seen.has(event.eventId)) continue;
    if (event.eventId) seen.add(event.eventId);
    if (completed) break;
    // Empty diagram selections still emit an internal generate_models phase.
    if (rulesOnly && "stage" in event && event.stage === "generate_models") continue;
    const at = event.createdAt;
    // Parallel branches can fail before another stage emits the terminal event.
    // Keep explicit model failures until that same task succeeds or starts another attempt.
    if (event.type === "stage_progress") {
      const id = event.subtaskId ?? event.modelId ?? event.diagramKind;
      if (id) {
        const key = `${event.stage}:${id}`;
        if (event.subtaskStatus === "failed" && event.error) modelFailures.set(key, { stage: event.stage, id, error: event.error });
        else if (event.subtaskStatus && event.subtaskStatus !== "failed") modelFailures.delete(key);
      }
    } else if (event.type === "artifact_ready" && event.artifactKind === "model") {
      for (const [key, failure] of modelFailures) {
        if ([event.subtaskId, event.modelId, event.diagramKind].includes(failure.id)) modelFailures.delete(key);
      }
    }
    if (event.type === "run_activity") {
      const step = getStep(event.stage);
      const call = getCall(step, event.callId, at, event.subtaskId, event.subtaskLabel, { modelId: event.modelId });
      if (event.operation) {
        call.operation = event.operation; call.round = event.round;
        const operationNames = { structure_check: "结构核对", model_repair: "结构纠错", render_repair: "重建图形", visual_check: event.round ? "视觉复查" : "视觉检查" };
        const coverageRepair = event.operation === "model_repair" && event.subtaskLabel?.includes("补全模型与需求的对应关系");
        call.title = `${callTitle(event.stage, event.subtaskId, event.subtaskLabel)} · ${coverageRepair
          ? `覆盖修复${event.round ? `（第 ${event.round}/${MAX_GENERATION_REPAIR_ATTEMPTS} 次）` : ""}`
          : `${operationNames[event.operation]}${event.round ? ` · 第 ${event.round} 轮` : ""}`}`;
      }
      call.technical = event.format === "technical";
      const fullModelRepair = event.operation === "model_repair" && ["generate_context", "generate_business_flow", "generate_models", "generate_design_models", "generate_design_sequence", "verify_diagram_visual"].includes(event.stage);
      // Model repair state comes from server events, never from technical fields embedded in prompts.
      if (event.phase === "started" && fullModelRepair && !event.inputMetrics?.repair) {
        call.summary += "基于当前对话修正完整模型\n";
      } else if (event.phase === "started" && event.inputMetrics?.repair) {
        const repair = event.inputMetrics.repair;
        const label = repair.mode === "field-patch" ? "仅修复已定位的问题" : repair.mode === "syntax" ? "修复输出格式" : "扩大到当前产物范围修复";
        call.summary += `${label}${repair.reason ? `：${repair.reason}` : ""}\n`;
      }
      if (event.inputImages?.length) call.inputImages = [...new Map([...(call.inputImages ?? []), ...event.inputImages].map((image) => [image.url, image])).values()];
      if (event.phase === "output") { if (includeContent) call.output += event.text ?? ""; call.thinking = false; }
      if (event.phase === "reasoning") { if (includeContent) call.reasoning = (call.reasoning ?? "") + (event.text ?? ""); call.thinking = true; }
      if (event.phase === "summary") {
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
      lastStage = event.stage;
      // A later verification/repair pass is a new step, rather than rewriting history.
      if (currentSteps.get(event.stage)?.finished) currentSteps.delete(event.stage);
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
        ? modelProgressMessage(event.subtaskStatus === "repairing" || event.subtaskStatus === "rendering" ? "running" : event.subtaskStatus ?? "running", Boolean(event.message?.includes("跳过")))
        : event.message ? readableTaskText(event.message) : "";
      if (subtaskId) {
        const coverageProgress = event.message?.startsWith("追踪覆盖修复");
        // Keep coverage diagnostics separate from the model's later completion receipt.
        const call = getCall(step, `${event.stage}:${subtaskId}${coverageProgress ? ":coverage" : ""}`, at, subtaskId, event.subtaskLabel, { modelId: event.modelId, diagramKind: event.diagramKind });
        if (coverageProgress) {
          call.coverageMessage = text;
          call.coverageIncomplete = text.includes("上限") && text.includes("不完整");
        }
        call.status = event.subtaskStatus === "repairing" || event.subtaskStatus === "rendering" ? "running" : event.subtaskStatus ?? "running";
        call.message = text;
        if (event.stage === "verify_diagram_visual" && event.message === "正在执行程序结构校验与绘制") {
          const identity = event.modelId ?? subtaskId;
          const count = (structureChecks.get(identity) ?? 0) + 1;
          structureChecks.set(identity, count);
          call.structureCheckCount = count;
        }
        mirrorOrder.set(call, eventIndex);
        if (["completed", "failed", "pending_review"].includes(call.status)) call.finishedAt = at;
      } else if (text && !step.messages.includes(text)) {
        step.messages.push(text);
        step.entries?.push({ kind: "message", text });
      }
    } else if (event.type === "artifact_ready") {
      const step = getStep(event.stage);
      const subtaskId = event.subtaskId ?? event.modelId ?? event.diagramKind;
      // Sequence emits one batch receipt after all named use-case tasks. It
      // confirms the container and must not invent an extra unnamed model.
      const sequenceBatchReceipt = event.stage === "generate_design_sequence" && event.artifactKind === "model" &&
        subtaskId === "sequence" && !event.modelId && step.calls.some(call => call.subtaskId?.startsWith("sequence:"));
      if (subtaskId && !sequenceBatchReceipt) {
        const call = getCall(step, `${event.stage}:${subtaskId}`, at, subtaskId, event.subtaskLabel, { modelId: event.modelId, diagramKind: event.diagramKind });
        call.status = event.subtaskStatus === "pending_review" ? "pending_review" : "completed";
        call.finishedAt = at;
        mirrorOrder.set(call, eventIndex);
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
      if (failures && "diagramErrors" in snapshot) {
        status = "failed";
        // Group the same cause once, naming the affected models rather than repeating each failed phase.
        const grouped = new Map<string, { error: unknown; names: string[] }>();
        for (const [id, failure] of Object.entries(snapshot.diagramErrors ?? {})) {
          const model = snapshot.models.find((item) => item.modelId === id || item.diagramKind === id);
          const name = model?.title ?? failureTarget(failure.stage, id);
          const summary = generationFailureSummary(failure.error);
          grouped.set(summary, { error: failure.error, names: [...new Set([...(grouped.get(summary)?.names ?? []), name])] });
        }
        finalMessage = [...grouped.values()].map(({ error, names }) => generationFailureSummary(error, names.join("、"))).join("\n");
      }
      else if ("documentKind" in snapshot) finalMessage = `文档已生成${snapshot.fileName ? `：${snapshot.fileName}` : ""}。`;
      else if ("svgArtifacts" in snapshot) {
        const visualReviews = "visualReviews" in snapshot ? Object.entries(snapshot.visualReviews ?? {}) : [];
        const pending = visualReviews.filter(([id, review]) => (review.status === "pending_review" || review.status === "not_completed") && !isConfirmedVisualReview(review, currentVisualReviews[id])).length;
        const skipped = visualReviews.filter(([, review]) => review.status === "skipped").length;
        finalMessage = `已生成 ${event.previewCount ?? snapshot.svgArtifacts.length} 个图形预览。${includeContent && pending ? `${pending} 个模型结构检查待确认。` : ""}${skipped ? `${skipped} 个模型结构检查已跳过。` : ""}`;
      }
      else finalMessage = "生成完成，可以查看结果。";
    } else if (event.type === "failed" || event.type === "cancelled") {
      terminalAt = at;
      status = event.type;
      if (event.type === "failed") {
        const stage = event.stage ?? lastStage ?? steps.at(-1)?.stage ?? "extract_rules";
        if (modelFailures.size) {
          const grouped = new Map<string, { error: RunError; names: Set<string> }>();
          for (const failure of modelFailures.values()) {
            const summary = generationFailureSummary(failure.error);
            const group = grouped.get(summary) ?? { error: failure.error, names: new Set<string>() };
            group.names.add(failureTarget(failure.stage, failure.id));
            grouped.set(summary, group);
          }
          finalMessage = [...grouped.values()].map(({ error, names }) => generationFailureSummary(error, [...names].join("、"))).join("\n");
        } else {
          const failedCalls = steps.filter((step) => step.stage === stage).flatMap((step) => step.calls).filter((call) => call.status === "failed");
          const names = [...new Set(failedCalls.map((call) => failureTarget(stage, call.modelId ?? call.subtaskId ?? call.diagramKind)))];
          finalMessage = generationFailureSummary(event.error, names.length ? names.join("、") : failureTarget(stage));
        }
      } else finalMessage = "任务已停止，已完成的过程保留。";
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
          ? modelProgressMessage("pending_review")
          : visualReviewDetail(savedReview) ?? subtask.message ?? modelProgressMessage("pending_review");
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
    // Every round retains metadata proven by the same model/subtask identity, including
    // earlier rounds whose own activity event carries only the concrete model ID.
    const kindsByIdentity = new Map<string, Set<string>>();
    for (const call of step.calls) if (call.diagramKind) {
      for (const identity of [call.modelId, call.subtaskId].filter((id): id is string => Boolean(id))) {
        const kinds = kindsByIdentity.get(identity) ?? new Set<string>();
        kinds.add(call.diagramKind); kindsByIdentity.set(identity, kinds);
      }
    }
    for (const call of step.calls) {
      if (!call.diagramKind) {
        const kinds = new Set([call.modelId, call.subtaskId].flatMap(id => id ? [...kindsByIdentity.get(id) ?? []] : []));
        if (kinds.size === 1) call.diagramKind = [...kinds][0];
      }
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
      // Keep a fresh coverage retry visible until its new request starts; the previous attempt stays terminal.
      if (mirror.status === "running" && ["failed", "completed"].includes(actual.status) &&
        mirror.message?.startsWith("正在补跑缺失的需求分析模型：") &&
        (mirrorOrder.get(mirror) ?? -1) > (startedOrder.get(actual) ?? 0)) continue;
      actual.modelId ??= mirror.modelId;
      actual.diagramKind ??= mirror.diagramKind;
      if (mirror.coverageMessage) {
        actual.coverageMessage = mirror.coverageMessage;
        actual.coverageIncomplete = mirror.coverageIncomplete;
      }
      actual.structureCheckCount = Math.max(actual.structureCheckCount ?? 0, mirror.structureCheckCount ?? 0) || undefined;
      if (["failed", "pending_review"].includes(mirror.status) && (mirrorOrder.get(mirror) ?? startedOrder.get(mirror) ?? -1) >= (startedOrder.get(actual) ?? 0)) {
        actual.status = mirror.status; actual.message = mirror.message;
      } else if (step.stage === "verify_diagram_visual" && mirror.status === "completed" && mirror.message?.includes("跳过")) {
        // Unsupported image input is a handled skip; preserve the trace without presenting a failed task.
        actual.status = "completed"; actual.message = mirror.message; actual.thinking = false;
      } else if (!actual.message && mirror.message && /修复|重试|补跑|映射|追踪关系/.test(mirror.message)) actual.message = mirror.message;
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
            ? "已人工确认当前图" : includeContent ? visualReviewDetail(review) ?? undefined : modelProgressMessage(call.status);
          call.thinking = false;
        }
        if (review?.status === "skipped") {
          call.status = "completed";
          call.message = includeContent
            ? review.reason.includes("跳过") ? review.reason : `已跳过视觉检查：${review.reason}`
            : modelProgressMessage("completed", true);
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
