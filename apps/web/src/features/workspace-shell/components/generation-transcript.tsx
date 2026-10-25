// Presents one task timeline with nested stage details and a separate final result.
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, Bot, Check, ChevronDown, Circle, Clock3, FileText, ImageIcon, LoaderCircle, ScanEye, X, type LucideIcon } from "lucide-react";
import { Button } from "../../../shared/ui/button";
import { Badge } from "../../../shared/ui/badge";
import { ScrollArea } from "../../../shared/ui/scroll-area";
import { Spinner } from "../../../shared/ui/spinner";
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtImage, ChainOfThoughtStep } from "../../../shared/ui/ai/chain-of-thought";
import { Shimmer } from "../../../shared/ui/ai/shimmer";
import { cn } from "../../../shared/ui/utils";
import { generationValidationProgress, type TranscriptCall, type TranscriptStep } from "../lib/generation-transcript";
import { groupGenerationArtifactTasks } from "../lib/generation-artifact-tasks";
import { useTranscriptScroll } from "../lib/use-transcript-scroll";
import { GenerationToolCalls } from "./generation-tool-calls";
import { type DesignDiagramType, type DiagramType } from "../../../entities/diagram/model";
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

function ProcessCall({ call, showTitle, firstCandidateCall, artifactType, revalidation, correctsRejectedCandidate, compactTitle }: { call: TranscriptCall; showTitle: boolean; firstCandidateCall: boolean; artifactType?: TranscriptStep["artifactType"]; revalidation: boolean; correctsRejectedCandidate: boolean; compactTitle: boolean }) {
  const { t } = useTranslation();
  const toolFlow = Boolean(call.artifactKind || call.tools?.length);
  const rules = call.artifactKind === "requirement-rules" || call.stage === "extract_rules";
  const baseTitle = call.title.split(" · ")[0]!;
  const operationKeys = { "requirement-rules": ["repairRules", "retryRules"], model: ["repairModel", "retryModel"], implementation: ["repairImplementation", "retryImplementation"], document: ["repairDocument", "retryDocument"], tests: ["repairTests", "retryTests"] }[artifactType ?? (rules ? "requirement-rules" : "model")];
  const repairKey = operationKeys[toolFlow && !correctsRejectedCandidate ? 1 : 0];
  const originalTitle = call.operation === "model_repair"
    ? `${t(`generation.tools.${repairKey}`)}${call.round ? ` · ${t("generation.tools.round", { count: call.round })}` : ""}`
    : toolFlow ? rules ? t("generation.tools.extractRuleCandidate") : baseTitle.startsWith("生成") ? baseTitle : `生成${baseTitle}` : call.title;
  // The parent identifies the model; its child rows describe only the actual operation and status.
  const title = !compactTitle || call.operation === "model_repair" || call.operation === "publish" ? originalTitle
    : call.operation ? t(`generation.process.operations.${call.operation === "visual_check" && call.round ? "visual_recheck" : call.operation}`)
      : t(`generation.process.generation.${call.status}`);
  const visibleTitle = toolFlow ? firstCandidateCall || call.operation === "model_repair" || call.status === "failed" : showTitle || call.operation === "model_repair" || call.coverageIncomplete;
  if (toolFlow && !visibleTitle && !call.tools?.length && !call.inputImages?.length && !call.coverageMessage) return null;
  const Icon = call.status === "completed" ? Check : call.status === "failed" ? X : Circle;
  // The task drawer shows progress, not generated prose; never parse or mount provider output here.
  return <div data-slot="generation-call" className="min-w-0 space-y-2 text-sm leading-6 text-muted-foreground">
    {visibleTitle && <div className="flex items-start gap-2" data-slot="generation-call-title">
      <Icon aria-hidden="true" className={cn("mt-1.5 size-3 shrink-0", call.status === "failed" && "text-destructive")} />
      <span className="min-w-0 flex-1 break-words">{title}</span>
      <span className={cn("shrink-0 text-xs leading-6", call.coverageIncomplete && "text-warning")}>{call.coverageIncomplete ? "覆盖不完整" : call.operation === "model_compile"
        ? call.status === "failed" ? "编译失败" : call.status === "completed" ? "编译通过" : statusText[call.status]
        : statusText[call.status]}</span>
    </div>}
    {call.inputImages?.filter((image) => /^(?:https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(image.url)).map((image) => <ChainOfThoughtImage key={image.url} caption={image.caption ?? `${call.title}使用的图片`}>
      <img src={image.url} alt={image.caption ?? `${call.title}的输入图片`} className="max-h-80 max-w-full object-contain" loading="lazy" />
    </ChainOfThoughtImage>)}
    {call.coverageMessage && <p className={cn("break-words", call.coverageIncomplete && "text-warning")}>{call.coverageMessage}</p>}
    {Boolean(call.tools?.length) && <GenerationToolCalls tools={call.tools!} artifactType={artifactType} revalidation={revalidation} />}
    {!toolFlow && !call.coverageMessage && call.message && call.message.length <= 120 && !["failed", "pending_review"].includes(call.status) && !/失败|故障|Error:|SVG|PlantUML|traceability|预期.*实际/i.test(call.message) && /修复|重试|补跑|人工确认|跳过|恢复|补齐|追踪关系/.test(call.message) && <p className="break-words">{call.message}</p>}
  </div>;
}

function taskModelIcon(step: TranscriptStep, kind?: string | null): LucideIcon | undefined {
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
  const currentStatus = stepActive ? step.calls.some(call => call.thinking) ? "正在分析" : "正在处理" : statusText[step.status];
  const title = step.title;
  // Failure reasons belong to the task summary; the timeline only retains short progress updates.
  const messages = step.stage === "verify_diagram_visual" || step.status === "failed" ? [] : step.messages.filter((message, index) => message.length <= 120 && !/失败|故障|Error:|SVG|PlantUML|traceability|预期.*实际/i.test(message) && (/修复|重试|复核/.test(message) || index === step.messages.length - 1));
  const ModelIcon = taskModelIcon(step, kind);
  // A provider turn may only request upstream data. Candidate generation is confirmed
  // by validation arguments, so a completed query must never imply extraction completed.
  const firstCandidateCall = step.calls.find(call => call.tools?.some(tool =>
    tool.name === "validate_model" || tool.name === "validate_requirement_rules"));
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
    {generationValidationProgress(step.calls).map(({ call, revalidation, correctsRejectedCandidate }) => <ProcessCall key={call.id} call={call} artifactType={step.artifactType} revalidation={revalidation} correctsRejectedCandidate={correctsRejectedCandidate} compactTitle={Boolean(step.artifactTask)} firstCandidateCall={call === firstCandidateCall} showTitle={call.operation === "publish" || step.calls.length > 1 && (!step.compactCalls || !call.artifactKind && !call.tools?.length)} />)}
    {step.children?.length ? <div className="space-y-3" data-slot="generation-task-children">
      {step.children.map((child) => <Stage key={child.id ?? `${child.stage}:${child.title}`} step={child} active={active} kind={kind} />)}
    </div> : null}
  </ChainOfThoughtStep>;
}

export function GenerationTranscript({ taskKey, steps, active, failed = false, kind, model, queue, emptyMessage, finalMessage, children, initiallyExpanded = true }: {
  taskKey: string; steps: TranscriptStep[]; active: boolean; kind?: string | null; model?: string | null; queue?: GenerationQueueDetails | null; emptyMessage?: string; finalMessage: string;
  children?: ReactNode; initiallyExpanded?: boolean; failed?: boolean;
}) {
  const { t } = useTranslation();
  const [disclosure, setDisclosure] = useState({ taskKey, open: initiallyExpanded });
  const expanded = disclosure.taskKey === taskKey ? disclosure.open : initiallyExpanded;
  const visibleSteps = useMemo(() => groupGenerationArtifactTasks(steps, t), [steps, t]);
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
