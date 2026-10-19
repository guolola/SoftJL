// Presents one task timeline with nested stage details and a separate final result.
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowDown, Bot, Check, ChevronDown, Circle, Clock3, FileText, ImageIcon, Link2, LoaderCircle, ScanEye, X, type LucideIcon } from "lucide-react";
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "@uml-platform/contracts";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { Spinner } from "../../../shared/ui/spinner";
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtImage, ChainOfThoughtStep } from "../../../shared/ui/ai/chain-of-thought";
import { Shimmer } from "../../../shared/ui/ai/shimmer";
import { cn } from "../../../shared/ui/utils";
import { readableTaskText, type TranscriptCall, type TranscriptStep } from "../lib/generation-transcript";
import { useTranscriptScroll } from "../lib/use-transcript-scroll";
import { DESIGN_DIAGRAM_META, DIAGRAM_META, getDesignDiagramLabel, getDiagramLabel, type DesignDiagramType, type DiagramType } from "../../../entities/diagram/model";
import { DESIGN_DIAGRAM_ICON, FEASIBILITY_ARTIFACT_ICON, REQUIREMENT_DIAGRAM_ICON } from "../../../entities/diagram/model-icons";

const statusText: Record<TranscriptCall["status"], string> = {
  queued: "排队中", running: "正在处理", completed: "已完成", failed: "未完成", cancelled: "已停止", pending_review: "待确认",
};

export interface GenerationQueueDetails {
  position?: number;
  ahead?: number;
  estimatedWaitMs?: number;
  reason?: "global" | "provider" | "project" | "user" | "run";
  items: Array<{ id: string; label: string; ahead?: number; estimatedWaitMs?: number; reason?: "global" | "provider" | "project" | "user" | "run" }>;
}

const queueReasons: Record<NonNullable<GenerationQueueDetails["reason"]>, string> = {
  global: "全部任务繁忙", provider: "模型服务繁忙", project: "本项目有任务在执行", user: "你的任务正在等待", run: "同一任务内等待",
};

function queueDescription(ahead?: number, estimatedWaitMs?: number, reason?: GenerationQueueDetails["reason"]) {
  const parts: string[] = [];
  if (ahead !== undefined) parts.push(`前方 ${ahead} 个模型调用`);
  if (estimatedWaitMs !== undefined) parts.push(estimatedWaitMs <= 0 ? "即将开始" : estimatedWaitMs < 60000 ? "预计等待不足 1 分钟" : `预计等待约 ${Math.ceil(estimatedWaitMs / 60000)} 分钟`);
  if (reason) parts.push(queueReasons[reason]);
  return parts.join(" · ");
}

function QueueProgress({ queue }: { queue: GenerationQueueDetails }) {
  const [expanded, setExpanded] = useState(true);
  const description = queueDescription(queue.ahead, queue.estimatedWaitMs, queue.reason);
  return <section aria-label="排队进度" className="min-w-0 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
    <div className="flex items-center gap-2 font-medium"><Clock3 className="size-4" aria-hidden="true" /><span>{queue.position !== undefined ? `队列第 ${queue.position} 位` : "排队中"}</span>{queue.items.length > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">{queue.items.length} 项等待中</span>}</div>
    {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    {queue.items.length > 0 && <>
      <Button type="button" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-2 h-auto gap-1 px-0 py-0 text-xs text-muted-foreground hover:bg-transparent">查看排队项目<ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} /></Button>
      <ul hidden={!expanded} className="mt-2 space-y-2 border-l border-border pl-3 text-xs text-muted-foreground">{queue.items.map((item) => <li key={item.id} className="min-w-0"><span className="break-words text-foreground">{item.label}</span>{queueDescription(item.ahead, item.estimatedWaitMs, item.reason) && <span className="ml-2">{queueDescription(item.ahead, item.estimatedWaitMs, item.reason)}</span>}</li>)}</ul>
    </>}
  </section>;
}

function ProcessCall({ call, showTitle, visual }: { call: TranscriptCall; showTitle: boolean; visual: boolean }) {
  const Icon = call.status === "completed" ? Check : call.status === "failed" ? X : Circle;
  // The task drawer shows progress, not generated prose; never parse or mount provider output here.
  return <div data-slot="generation-call" className="min-w-0 space-y-2 text-sm leading-6 text-muted-foreground">
    {showTitle && <div className="flex items-start gap-2">
      <Icon aria-hidden="true" className={cn("mt-1.5 size-3 shrink-0", call.status === "failed" && "text-destructive")} />
      <span className="min-w-0 flex-1 break-words">{call.title}</span>
      <span className={cn("shrink-0 text-xs leading-6", call.coverageIncomplete && "text-warning")}>{call.coverageIncomplete ? "覆盖不完整" : visual && call.status === "pending_review" ? "检查已结束" : statusText[call.status]}</span>
    </div>}
    {call.inputImages?.filter((image) => /^(?:https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(image.url)).map((image) => <ChainOfThoughtImage key={image.url} caption={image.caption ?? `${call.title}使用的图片`}>
      <img src={image.url} alt={image.caption ?? `${call.title}的输入图片`} className="max-h-80 max-w-full object-contain" loading="lazy" />
    </ChainOfThoughtImage>)}
    {call.coverageMessage && <p className={cn("break-words", call.coverageIncomplete && "text-warning")}>{call.coverageMessage}</p>}
    {!visual && !call.coverageMessage && call.message && call.message.length <= 120 && !["failed", "pending_review"].includes(call.status) && !/失败|故障|Error:|SVG|PlantUML|traceability|预期.*实际/i.test(call.message) && /修复|重试|补跑|人工确认|跳过|恢复|补齐|追踪关系/.test(call.message) && <p className="break-words">{call.message}</p>}
  </div>;
}

function taskModelIcon(step: TranscriptStep, kind?: string | null): LucideIcon | undefined {
  if (step.phase === "coverage-repair") return Link2;
  if (kind === "feasibility") {
    if (step.stage === "generate_context") return FEASIBILITY_ARTIFACT_ICON.context;
    if (step.stage === "generate_business_flow") return FEASIBILITY_ARTIFACT_ICON["business-flow"];
    if (step.stage === "generate_implementation") return FEASIBILITY_ARTIFACT_ICON.implementation;
  }
  if (!step.artifactTask || !step.diagramKind) return undefined;
  if (kind === "design" && Object.hasOwn(DESIGN_DIAGRAM_ICON, step.diagramKind)) {
    return DESIGN_DIAGRAM_ICON[step.diagramKind as DesignDiagramType];
  }
  if (kind === "requirements" && Object.hasOwn(REQUIREMENT_DIAGRAM_ICON, step.diagramKind)) {
    return REQUIREMENT_DIAGRAM_ICON[step.diagramKind as DiagramType];
  }
  return undefined;
}

function Stage({ step, active, kind }: { step: TranscriptStep; active: boolean; kind?: string | null }) {
  const stepActive = active && !step.finished;
  const currentStatus = step.phase === "coverage-repair" && step.calls.some(call => call.coverageIncomplete) ? "覆盖不完整" : stepActive ? step.calls.some((call) => call.thinking) ? "正在分析" : "正在处理" : step.stage === "verify_diagram_visual" && step.status === "pending_review" ? "检查已结束" : statusText[step.status];
  const checkCount = Math.max(0, ...step.calls.map(call => call.structureCheckCount ?? 0));
  const title = step.stage === "verify_diagram_visual" && checkCount > 0 ? `${step.title}（已检查 ${checkCount} 次）` : step.title;
  // Failure reasons belong to the task summary; the timeline only retains short progress updates.
  const messages = step.stage === "verify_diagram_visual" || step.status === "failed" ? [] : step.messages.filter((message, index) => message.length <= 120 && !/失败|故障|Error:|SVG|PlantUML|traceability|预期.*实际/i.test(message) && (/修复|重试|复核/.test(message) || index === step.messages.length - 1));
  const ModelIcon = taskModelIcon(step, kind);
  const Icon = ModelIcon ?? (stepActive ? LoaderCircle : step.status === "failed" ? X : step.stage.includes("verify") ? ScanEye : step.stage.includes("render") ? ImageIcon : FileText);
  const StatusIcon = stepActive ? LoaderCircle : step.status === "failed" ? X : step.status === "queued" ? Clock3 : step.status === "pending_review" ? ScanEye : step.status === "cancelled" ? Circle : Check;
  // Category identity stays stable while a separate status marker reports generation progress.
  const statusLabel = ModelIcon ? <span className="inline-flex items-center gap-1">
    <StatusIcon aria-hidden="true" className={cn("size-3 shrink-0", stepActive && "animate-spin motion-reduce:animate-none", step.status === "failed" && "text-destructive")} />
    {currentStatus}
  </span> : currentStatus;
  return <ChainOfThoughtStep aria-label={title} data-testid="generation-task-step" data-active-step={stepActive}
    icon={Icon} iconClassName={!ModelIcon && stepActive ? "animate-spin motion-reduce:animate-none" : undefined}
    label={stepActive ? <Shimmer>{title}</Shimmer> : title} status={stepActive ? "active" : step.status === "queued" ? "pending" : "complete"} statusLabel={statusLabel}>
    {messages.map((message) => <p key={message} className="whitespace-pre-wrap break-words">{message}</p>)}
    {step.calls.map((call) => <ProcessCall key={call.id} call={call} showTitle={!step.compactCalls && step.calls.length > 1} visual={step.stage === "verify_diagram_visual"} />)}
    {step.children?.length ? <div className="space-y-3" data-slot="generation-task-children">
      {step.children.map((child) => <Stage key={child.id ?? `${child.stage}:${child.title}`} step={child} active={active} kind={kind} />)}
    </div> : null}
  </ChainOfThoughtStep>;
}

// Feasibility emits shared render/review stages; place each diagram's work under its generation step.
function nestFeasibilityDiagramSteps(steps: TranscriptStep[]) {
  const contextParents = steps.filter((step) => step.stage === "generate_context");
  const flowParents = steps.filter((step) => step.stage === "generate_business_flow");
  if (!contextParents.length && !flowParents.length) return steps;

  const contextRenders = steps.filter((step) => step.stage === "render_context");
  const flowRenders = steps.filter((step) => step.stage === "render_business_flow");
  const visualSteps = steps.filter((step) => step.stage === "verify_diagram_visual");
  const removed = new Set<TranscriptStep>();
  [...contextRenders, ...flowRenders].forEach((step) => removed.add(step));

  const contextIds = new Set(contextRenders.flatMap((step) => step.calls.flatMap((call) => call.subtaskId ? [call.id, call.subtaskId] : [call.id])));
  const flowIds = new Set(flowRenders.flatMap((step) => step.calls.flatMap((call) => call.subtaskId ? [call.id, call.subtaskId] : [call.id])));
  const contextVisuals = new Map<TranscriptStep, TranscriptCall[]>();
  const flowVisuals = new Map<TranscriptStep, TranscriptCall[]>();
  const ungroupedVisuals = new Map<TranscriptStep, TranscriptCall[]>();

  for (const visualStep of visualSteps) {
    for (const call of visualStep.calls) {
      const title = call.title.toLowerCase();
      const subtaskId = call.subtaskId ?? "";
      const isContext = Boolean(subtaskId && contextIds.has(subtaskId)) || /系统环境图|context diagram/i.test(title);
      const isFlow = Boolean(subtaskId && flowIds.has(subtaskId)) || /业务流程图|business flow/i.test(title);
      if (isContext && contextParents.length) {
        contextVisuals.set(visualStep, [...(contextVisuals.get(visualStep) ?? []), call]);
      } else if (isFlow && flowParents.length) {
        flowVisuals.set(visualStep, [...(flowVisuals.get(visualStep) ?? []), call]);
      } else if (contextParents.length && !flowParents.length) {
        contextVisuals.set(visualStep, [...(contextVisuals.get(visualStep) ?? []), call]);
      } else if (flowParents.length && !contextParents.length) {
        flowVisuals.set(visualStep, [...(flowVisuals.get(visualStep) ?? []), call]);
      } else {
        ungroupedVisuals.set(visualStep, [...(ungroupedVisuals.get(visualStep) ?? []), call]);
      }
    }
  }

  const visualChildren = (groups: Map<TranscriptStep, TranscriptCall[]>, suffix: string) =>
    [...groups].map(([step, calls]) => ({ ...step, id: `${step.id ?? step.stage}:${suffix}`, title: "模型结构检查", calls, compactCalls: true }));
  const decorateParent = (parent: TranscriptStep, renders: TranscriptStep[], visuals: TranscriptStep[]) => {
    const children = [...renders, ...visuals].map((child) => ({ ...child, compactCalls: true }));
    const hasFailedChild = children.some((child) => child.status === "failed");
    const hasReviewChild = children.some((child) => child.status === "pending_review");
    const hasActiveChild = children.some((child) => !child.finished);
    return {
      ...parent,
      artifactTask: true,
      children,
      finished: Boolean(parent.finished && !hasActiveChild),
      status: hasFailedChild ? "failed" as const : hasReviewChild ? "pending_review" as const : hasActiveChild ? "running" as const : parent.status,
    };
  };

  const grouped = new Map<TranscriptStep, TranscriptStep>();
  for (const parent of contextParents) grouped.set(parent, decorateParent(parent, contextRenders, visualChildren(contextVisuals, "context")));
  for (const parent of flowParents) grouped.set(parent, decorateParent(parent, flowRenders, visualChildren(flowVisuals, "business-flow")));

  const visible = steps.filter((step) => !removed.has(step) && !visualSteps.includes(step));
  for (const step of visualSteps) {
    const remaining = ungroupedVisuals.get(step) ?? [];
    if (remaining.length || (!step.calls.length && !contextParents.length && !flowParents.length)) {
      visible.push(remaining.length ? { ...step, calls: remaining } : step);
    }
  }
  return visible.map((step) => grouped.get(step) ?? step);
}

// Model pipelines share render and review stages across diagrams; group those phases by artifact identity.
function nestModelDiagramSteps(steps: TranscriptStep[], kind: "requirements" | "design", t: TFunction) {
  const rootStages = new Set<TranscriptStep["stage"]>(kind === "requirements"
    ? ["generate_models"]
    : ["generate_design_sequence", "generate_design_models"]);
  const phaseStages = new Set<TranscriptStep["stage"]>(["generate_plantuml", "render_svg", "verify_diagram_visual"]);
  const rootSteps = steps.filter((step) => rootStages.has(step.stage));
  if (!rootSteps.length) return steps;

  type ArtifactGroup = {
    key: string;
    stage: TranscriptStep["stage"];
    diagramKind?: string;
    title?: string;
    calls: TranscriptCall[];
    coverageCalls: TranscriptCall[];
    identifiers: Set<string>;
    children: TranscriptStep[];
  };
  const groups = new Map<string, ArtifactGroup>();
  const artifactCalls = new Set<TranscriptCall>();
  const traceabilityCalls: TranscriptCall[] = [];
  const rootRemainders = new Map<TranscriptStep, TranscriptStep>();
  const stepIndex = new Map(steps.map((step, index) => [step, index]));

  for (const step of rootSteps) {
    for (const call of step.calls) {
      if (call.coverageMessage || call.title.includes("补全模型与需求的对应关系") || call.subtaskId?.endsWith(":coverage-retry")) {
        traceabilityCalls.push(call);
        continue;
      }
      const artifactId = call.subtaskId ?? call.modelId ?? call.diagramKind;
      if (!artifactId) continue;
      const kindFromId = call.subtaskId?.split(":")[0];
      const diagramKind = call.diagramKind ?? (kindFromId && kindFromId in (kind === "design" ? DESIGN_DIAGRAM_META : DIAGRAM_META) ? kindFromId : undefined);
      const key = `${step.stage}:${artifactId}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, stage: step.stage, diagramKind: call.diagramKind, calls: [], coverageCalls: [], identifiers: new Set(), children: [] };
        groups.set(key, group);
      }
      group.calls.push(call);
      if (!group.diagramKind && diagramKind) group.diagramKind = diagramKind;
      if (call.subtaskId) group.identifiers.add(call.subtaskId);
      if (call.modelId) group.identifiers.add(call.modelId);
      if (call.diagramKind) group.identifiers.add(call.diagramKind);
      const readableTitle = call.title.split(" · ")[0]?.trim();
      if (!group.title && readableTitle && !readableTitle.includes("补全模型与需求的对应关系")) group.title = readableTitle;
      artifactCalls.add(call);
    }
  }
  if (!groups.size) return steps;

  const matchArtifact = (call: TranscriptCall) => {
    const identities = [call.subtaskId, call.modelId].filter((value): value is string => Boolean(value));
    const exactMatches = [...groups.values()].filter((group) => identities.some((identity) => group.identifiers.has(identity)));
    if (exactMatches.length === 1) return exactMatches[0];
    if (call.diagramKind) {
      const kindMatches = [...groups.values()].filter((group) => group.diagramKind === call.diagramKind);
      if (kindMatches.length === 1) return kindMatches[0];
    }
    return undefined;
  };
  const callSummary = (calls: TranscriptCall[], fallback: TranscriptStep["status"]) => {
    const hasActiveCall = calls.some((call) => call.status === "running" || call.status === "queued");
    if (hasActiveCall) return { status: "running" as const, finished: false };
    const latest = calls.at(-1)?.status;
    const finished = calls.length > 0 && calls.every((call) => ["completed", "failed", "cancelled", "pending_review"].includes(call.status));
    return { status: latest ?? fallback, finished };
  };

  // Traceability repair belongs to the model identified by its explicit event receipt.
  for (const call of traceabilityCalls) {
    const group = matchArtifact(call);
    if (!group) continue;
    group.coverageCalls.push(call);
    for (const id of [call.modelId, call.subtaskId]) if (id) group.identifiers.add(id);
    artifactCalls.add(call);
  }

  const phaseRemainders = new Map<TranscriptStep, TranscriptStep>();
  for (const phase of steps.filter((step) => phaseStages.has(step.stage))) {
    const byArtifact = new Map<ArtifactGroup, TranscriptCall[]>();
    const unassigned: TranscriptCall[] = [];
    for (const call of phase.calls) {
      const group = matchArtifact(call);
      if (!group) { unassigned.push(call); continue; }
      byArtifact.set(group, [...(byArtifact.get(group) ?? []), call]);
    }
    for (const [group, calls] of byArtifact) {
      const summary = callSummary(calls, phase.status);
      group.children.push({
        ...phase,
        id: `${phase.id ?? phase.stage}:${group.key}`,
        messages: byArtifact.size === 1 ? phase.messages : [],
        calls,
        status: summary.status,
        finished: summary.finished || phase.finished,
        compactCalls: true,
      });
    }
    const sharedMessages = phase.messages.length && byArtifact.size !== 1;
    if (unassigned.length || sharedMessages || (!phase.calls.length && phase.messages.length > 0)) {
      phaseRemainders.set(phase, { ...phase, calls: unassigned, ...(sharedMessages ? {} : { messages: [] }) });
    }
  }

  const parents = [...groups.values()].sort((left, right) => {
    const leftStep = rootSteps.find((step) => step.stage === left.stage)!;
    const rightStep = rootSteps.find((step) => step.stage === right.stage)!;
    const position = stepIndex.get(leftStep)! - stepIndex.get(rightStep)!;
    if (position) return position;
    return rootSteps.find((step) => step.stage === left.stage)!.calls.indexOf(left.calls[0]!) - rootSteps.find((step) => step.stage === right.stage)!.calls.indexOf(right.calls[0]!);
  }).map((group) => {
    if (group.coverageCalls.length) {
      const calls = group.coverageCalls;
      const summary = callSummary(calls, "running");
      const round = Math.max(0, ...calls.map(call => call.round ?? 0));
      group.children.push({
        id: `${group.key}:coverage`, stage: group.stage, phase: "coverage-repair",
        title: `覆盖修复${round ? `（第 ${round}/${MAX_GENERATION_REPAIR_ATTEMPTS} 次）` : ""}`,
        messages: [], calls, compactCalls: true, ...summary,
        status: calls.some(call => call.coverageIncomplete) ? "pending_review" : summary.status,
      });
    }
    const rootSummary = callSummary(group.calls, "running");
    group.children.sort((left, right) => {
      const rank = (step: TranscriptStep) => step.phase === "coverage-repair" ? 3 : step.stage === "generate_plantuml" ? 0 : step.stage === "render_svg" ? 1 : 2;
      return rank(left) - rank(right);
    });
    const failedChild = group.children.some((child) => child.status === "failed");
    const reviewChild = group.children.some((child) => child.status === "pending_review");
    const unfinishedChild = group.children.some((child) => !child.finished);
    const finished = rootSummary.finished && !unfinishedChild;
    const diagramTitle = group.title ?? readableTaskText(group.diagramKind ?? "图表");
    return {
      id: `${group.stage}:artifact:${group.key}`,
      stage: group.stage,
      title: diagramTitle.startsWith("生成") ? diagramTitle : `生成${diagramTitle}`,
      messages: [],
      calls: group.calls,
      children: group.children,
      artifactTask: true,
      diagramKind: group.diagramKind,
      compactCalls: true,
      status: failedChild ? "failed" as const : reviewChild ? "pending_review" as const : unfinishedChild ? "running" as const : rootSummary.status,
      finished,
    } satisfies TranscriptStep;
  });
  const parentsByKind = new Map<string, TranscriptStep[]>();
  for (const parent of parents) {
    if (!parent.diagramKind) continue;
    const key = `${parent.stage}:${parent.diagramKind}`;
    parentsByKind.set(key, [...(parentsByKind.get(key) ?? []), parent]);
  }
  const categorySteps: TranscriptStep[] = [];
  const emittedKinds = new Set<string>();
  for (const parent of parents) {
    const kindKey = parent.diagramKind ? `${parent.stage}:${parent.diagramKind}` : undefined;
    const sameKind = kindKey ? parentsByKind.get(kindKey) : undefined;
    if (!kindKey || !sameKind) {
      categorySteps.push(parent);
      continue;
    }
    // Category names must match navigation, including kinds shared by both stages.
    const categoryTitle = kind === "design" && parent.diagramKind! in DESIGN_DIAGRAM_META
      ? getDesignDiagramLabel(parent.diagramKind as DesignDiagramType, t)
      : parent.diagramKind! in DIAGRAM_META ? getDiagramLabel(parent.diagramKind as DiagramType, t) : readableTaskText(parent.diagramKind!);
    const useCaseModels = (kind === "design" && parent.diagramKind === "sequence") ||
      (kind === "requirements" && parent.diagramKind === "analysis");
    if (sameKind.length === 1 && !useCaseModels) {
      categorySteps.push({ ...parent, title: `生成${categoryTitle}` });
      continue;
    }
    if (emittedKinds.has(kindKey)) continue;
    emittedKinds.add(kindKey);
    categorySteps.push({
      id: `${kindKey}:artifact-group`,
      stage: parent.stage,
      title: `生成${categoryTitle}`,
      messages: [],
      calls: [],
      children: sameKind,
      artifactTask: true,
      artifactGroup: true,
      diagramKind: parent.diagramKind,
      status: sameKind.some((item) => item.status === "failed")
        ? "failed"
        : sameKind.some((item) => item.status === "pending_review")
          ? "pending_review"
          : sameKind.some((item) => !item.finished)
            ? "running"
            : "completed",
      finished: sameKind.every((item) => item.finished),
    });
  }
  // A root stage is only a pipeline container. Showing it makes every diagram
  // phase one level deeper than its actual model task.
  const displayedParents = categorySteps;

  // Unscoped progress stays on its shared stage; model ownership requires explicit event identity.
  const remainingMessages = new Map<TranscriptStep, string[]>();
  for (const step of rootSteps) {
    const messages = step.messages.filter(message => !["正在生成结构化模型", "正在生成设计阶段结构化模型", "正在生成用例实现设计"].includes(message));
    if (messages.length) remainingMessages.set(step, messages);
  }

  for (const step of rootSteps) {
    const remaining = step.calls.filter((call) => !artifactCalls.has(call));
    const messages = remainingMessages.get(step) ?? [];
    if (remaining.length || messages.length) {
      rootRemainders.set(step, { ...step, calls: remaining, messages });
    }
  }
  const rootStepsWithGroups = new Set(rootSteps);
  const phaseStepSet = new Set(steps.filter((step) => phaseStages.has(step.stage)));
  const result: TranscriptStep[] = [];
  let insertedParents = false;
  for (const step of steps) {
    if (rootStepsWithGroups.has(step)) {
      if (!insertedParents) { result.push(...displayedParents); insertedParents = true; }
      const remainder = rootRemainders.get(step);
      if (remainder) result.push(remainder);
      continue;
    }
    if (phaseStepSet.has(step)) {
      const remainder = phaseRemainders.get(step);
      if (remainder) result.push(remainder);
      continue;
    }
    result.push(step);
  }
  return result;
}

export function GenerationTranscript({ taskKey, steps, active, failed = false, kind, model, queue, emptyMessage, finalMessage, children, initiallyExpanded = true }: {
  taskKey: string; steps: TranscriptStep[]; active: boolean; kind?: string | null; model?: string | null; queue?: GenerationQueueDetails | null; emptyMessage?: string; finalMessage: string;
  children?: ReactNode; initiallyExpanded?: boolean; failed?: boolean;
}) {
  const { t } = useTranslation();
  const [disclosure, setDisclosure] = useState({ taskKey, open: initiallyExpanded });
  const expanded = disclosure.taskKey === taskKey ? disclosure.open : initiallyExpanded;
  const visibleSteps = useMemo(() => kind === "feasibility"
    ? nestFeasibilityDiagramSteps(steps)
    : kind === "requirements" || kind === "design"
      ? nestModelDiagramSteps(steps, kind, t)
      : steps, [kind, steps, t]);
  const { viewportRef, contentRef, away, returnToLatest } = useTranscriptScroll(taskKey, visibleSteps);
  const assistantKind = kind && ["requirements", "design",  "document", "feasibility"].includes(kind) ? kind : "unknown";
  const thoughtLabel = t(`generation.thoughtProcess.${active ? "active" : "finished"}`);
  const modelLabel = model === "offline-demo-fixed-artifacts" ? t("uxReview.demoData") : model;
  return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-testid="generation-transcript">
    <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef} viewportClassName="[overflow-anchor:none]" contentClassName="!block">
      <div ref={contentRef} data-slot="ai-conversation" className="min-w-0 space-y-8 pb-12 pr-4 text-base leading-7">
        <div className="space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium" data-slot="generation-assistant-header">
            <span className="flex min-w-0 items-center gap-2"><Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span>{t(`generation.assistants.${assistantKind}`)}</span></span>
            {modelLabel?.trim() && <Badge variant="secondary" title={modelLabel} className="max-w-full min-w-0 truncate" data-slot="generation-model">{modelLabel}</Badge>}
          </div>
          {emptyMessage && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
        </div>
        {queue && <QueueProgress queue={queue} />}
        {active && !expanded && !queue && steps.length > 0 && <p role="status" className="text-sm text-muted-foreground">{t("uxReview.generatingSummary")}</p>}
        {visibleSteps.length > 0 && <ChainOfThought key={taskKey} open={expanded} onOpenChange={open => setDisclosure({ taskKey, open })}>
          <ChainOfThoughtHeader aria-label={thoughtLabel}>{thoughtLabel}</ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {visibleSteps.map((step) => <Stage key={step.id ?? step.stage} step={step} active={active} kind={kind} />)}
          </ChainOfThoughtContent>
        </ChainOfThought>}
        {active && steps.length === 0 && !queue && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden="true" className="size-3.5" /><Shimmer>等待任务开始，执行过程会在这里逐段显示。</Shimmer></p>}
        {finalMessage && <section aria-label="输出总结" data-slot="generation-task-summary" className={cn(failed ? "text-sm leading-6 text-destructive" : "text-black dark:text-foreground")}><p role="status" className="whitespace-pre-wrap break-words">{finalMessage}</p></section>}
        {children}
      </div>
    </ScrollArea>
    {away && <Button size="sm" variant="secondary" className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full shadow-sm" onClick={returnToLatest}><ArrowDown className="size-3.5" />回到最新</Button>}
  </div>;
}
