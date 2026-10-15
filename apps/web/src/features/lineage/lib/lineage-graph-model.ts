// Derives the project generation lineage graph from the workspace session state.
import {
  designDiagramKindFromRecordKey,
  type DesignDiagramKind,
  type DiagramKind,
  type DocumentKind,
  type RunSnapshot,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  getDesignModelId,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type { RequirementRule, RuleCategory } from "../../../entities/requirement-rule/model";

import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import {
  activeDesignProjectDiagramStatuses,
  activeDocumentProjectRunStatus,
  activeStatusForProjectRunKind,
  activeRequirementProjectDiagramStatuses,
} from "../../workspace-shell/lib/project-run-projections";
import type {
  GenerationTask,
  WorkspaceSessionState,
} from "../../workspace-session/model/session-state";
import { DESIGN_REQUIREMENT_SOURCE_MAP } from "../../workspace-session/lib/generation-planning";
import { localizeRunFailure } from "../../../shared/i18n/api-errors";

export type LineageStage =
  | "requirement-rules"
  | "requirement-models"
  | "design-models"
  | "documents";

export type LineageNodeKind =
  | "rule"
  | "requirement-model"
  | "design-model"
  | "document";

export type LineageNodeStatus =
  | "not-generated"
  | "current"
  | "stale"
  | "error"
  | "running"
  | "interrupted";

export type LineageEdgeStatus = "default" | "stale" | "error" | "interrupted";

export type LineageRecentEvent = {
  label: string;
  description: string;
};

export type LineageNode = {
  id: string;
  kind: LineageNodeKind;
  stage: LineageStage;
  stageLabel: string;
  label: string;
  eyebrow: string;
  description: string;
  status: LineageNodeStatus;
  reason: string;
  actionLabel: string;
  hasViewableArtifact: boolean;
  upstreamIds: string[];
  downstreamIds: string[];
  recentEvents: LineageRecentEvent[];
  payload?: {
    ruleId?: string;
    ruleCategory?: RuleCategory;
    diagramKind?: DiagramKind;
    designDiagramKind?: DesignDiagramKind;
    documentKind?: DocumentKind;
  };
};

export type LineageEdge = {
  id: string;
  source: string;
  target: string;
  status: LineageEdgeStatus;
  label?: string;
};

export type LineageGraphSummary = {
  total: number;
  stale: number;
  error: number;
  interrupted: number;
  running: number;
  notGenerated: number;
  current: number;
};

export type LineageGraph = {
  nodes: LineageNode[];
  edges: LineageEdge[];
  summary: LineageGraphSummary;
  defaultSelectedNodeId: string | null;
};

export type LineageColumn = {
  id: LineageStage;
  label: string;
  nodes: LineageNode[];
};

export type LineageGraphInput = Pick<
  WorkspaceSessionState,
  | "requirementText"
  | "rules"
  | "isRulesStale"
  | "requirementReviewCandidates"
  | "models"
  | "generatedDiagrams"
  | "svgArtifacts"
  | "staleDiagrams"
  | "diagramErrors"
  | "selectedDiagrams"
  | "designModels"
  | "generatedDesignDiagrams"
  | "designSvgArtifacts"
  | "designDiagramErrors"
  | "selectedDesignDiagrams"
  | "staleDesignDiagrams"
  | "staleDesignModelIds"
  | "designStaleReasons"
  | "designTraceabilityStale"
  | "designGenerationBlockedReason"
  |     "generationTasks"
  | "historyItems"
> & {
  projectRuns?: PlatformRunSummary[];
};

export const LINEAGE_STAGE_ORDER: LineageStage[] = [
  "requirement-rules",
  "requirement-models",
  "design-models",
  "documents",
];

const STAGE_LABELS: Record<LineageStage, string> = {
  "requirement-rules": "需求规则",
  "requirement-models": "需求模型",
  "design-models": "设计模型",
  "documents": "产物",
};

const REQUIRED_REQUIREMENT_DIAGRAMS = ["usecase", "class"] as const satisfies DiagramType[];
const REQUIRED_DESIGN_DIAGRAMS = ["sequence", "class"] as const satisfies DesignDiagramType[];

function requirementSourceMissing(input: LineageGraphInput) {
  return input.requirementText.trim().length === 0;
}

const RUNNING_STATUSES = new Set(["queued", "running"]);
const ACTIVE_SUBTASK_STATUSES = new Set([
  "queued",
  "running",
  "repairing",
  "rendering",
]);

function nodeId(kind: LineageNodeKind, id: string) {
  return `${kind}:${id}`;
}

function ruleNodeId(ruleId: string) {
  return nodeId("rule", ruleId);
}

function requirementNodeId(diagram: DiagramType) {
  return nodeId("requirement-model", diagram);
}

function designNodeId(diagram: DesignDiagramType) {
  return nodeId("design-model", diagram);
}



function documentNodeId(kind: DocumentKind) {
  return nodeId("document", kind);
}

function statusActionLabel(status: LineageNodeStatus) {
  switch (status) {
    case "not-generated":
      return "生成";
    case "current":
      return "查看";
    case "stale":
      return "更新";
    case "error":
      return "重试";
    case "running":
      return "查看进度";
    case "interrupted":
      return "重试";
  }
}

function edgeStatus(
  sourceStatus: LineageNodeStatus | undefined,
  targetStatus: LineageNodeStatus | undefined,
): LineageEdgeStatus {
  if (sourceStatus === "error" || targetStatus === "error") return "error";
  if (sourceStatus === "interrupted" || targetStatus === "interrupted") {
    return "interrupted";
  }
  if (targetStatus === "stale") return "stale";
  return "default";
}

function taskIsActive(task: GenerationTask) {
  return RUNNING_STATUSES.has(task.status);
}

function taskKindActive(
  input: LineageGraphInput,
  kind: Exclude<GenerationTask["kind"], "feasibility">,
) {
  return (
    input.generationTasks.some((task) => task.kind === kind && taskIsActive(task)) ||
    Boolean(activeStatusForProjectRunKind(input.projectRuns, kind))
  );
}

function documentTaskActive(input: LineageGraphInput, documentKind: DocumentKind) {
  return (
    input.generationTasks.some(
      (task) =>
        task.kind === "document" &&
        task.documentKind === documentKind &&
        taskIsActive(task),
    ) ||
    Boolean(activeDocumentProjectRunStatus(input.projectRuns, documentKind))
  );
}

function historyDocumentKind(
  item: LineageGraphInput["historyItems"][number],
): DocumentKind | null {
  if (
    item.snapshot &&
    "documentKind" in item.snapshot
  ) {
    return item.snapshot.documentKind;
  }
  return item.documentKind === "requirementsSpec" ||
    item.documentKind === "softwareDesignSpec" ||
    item.documentKind === "feasibilityStudy"
    ? item.documentKind
    : null;
}

function historyDocumentStatus(item: LineageGraphInput["historyItems"][number]) {
  return item.snapshot?.status ?? item.status ?? null;
}

function historyRunKind(item: LineageGraphInput["historyItems"][number]) {
  if (item.runKind === "requirements" || item.runKind === "design" || item.runKind === "document") {
    return item.runKind;
  }
  if (item.snapshot) {
    if ("documentKind" in item.snapshot) return "document";
    
    if ("requirementModels" in item.snapshot) return "design";
    return "requirements";
  }
  return null;
}

function historyStage(item: LineageGraphInput["historyItems"][number]) {
  if (item.stage) return item.stage;
  if (item.snapshot && "currentStage" in item.snapshot) {
    return item.snapshot.currentStage;
  }
  return null;
}

function isRequirementHistorySnapshot(
  snapshot: LineageGraphInput["historyItems"][number]["snapshot"],
): snapshot is RunSnapshot {
  return Boolean(
    snapshot &&
      !("files" in snapshot) &&
      !("requirementModels" in snapshot) &&
      !("documentKind" in snapshot) &&
      "selectedDiagrams" in snapshot,
  );
}

function interruptedHistoryForKind(
  input: LineageGraphInput,
  kind: "requirements" | "design" | "document",
  matches: (item: LineageGraphInput["historyItems"][number]) => boolean = () => true,
) {
  return input.historyItems.find(
    (item) =>
      historyDocumentStatus(item) === "interrupted" &&
      historyRunKind(item) === kind &&
      matches(item),
  );
}

function interruptedRunSummary(
  item: LineageGraphInput["historyItems"][number] | undefined,
) {
  const detail = item?.errorMessage ?? item?.summary ?? null;
  return detail
    ? `服务中断，可重试。${detail}`
    : "服务中断，可从运行历史重试或重新运行。";
}





function failedRulesHistory(input: LineageGraphInput) {
  return input.historyItems.find((item) => {
    if (
      historyDocumentStatus(item) !== "failed" ||
      historyRunKind(item) !== "requirements"
    ) {
      return false;
    }
    const stage = historyStage(item) ?? "";
    if (stage.includes("rules") || stage.includes("extract")) return true;
    return Boolean(
      isRequirementHistorySnapshot(item.snapshot) &&
        item.snapshot.selectedDiagrams.length === 0,
    );
  });
}

function failedRulesSummary(item: LineageGraphInput["historyItems"][number] | undefined) {
  const detail =
    item?.snapshot && "error" in item.snapshot
      ? item.snapshot.error
        ? localizeRunFailure(item.snapshot.error, "生成任务失败，请稍后重试。")
        : null
      : item?.errorMessage ?? item?.summary ?? null;
  return detail
    ? `需求规则抽取失败，旧规则仍可查看。${detail}`
    : "需求规则抽取失败，旧规则仍可查看，可从运行历史重试。";
}



function historyDocumentMissingArtifacts(
  item: LineageGraphInput["historyItems"][number],
) {
  if (item.snapshot && "documentKind" in item.snapshot) {
    return item.snapshot.missingArtifacts.filter((artifact) => artifact.trim());
  }
  return (item.missingArtifactSummary ?? [])
    .map((artifact) => artifact.trim())
    .filter(Boolean);
}

function documentHistoryFor(input: LineageGraphInput, documentKind: DocumentKind) {
  return input.historyItems.find(
    (item) =>
      historyDocumentKind(item) === documentKind &&
      historyDocumentStatus(item) === "completed",
  );
}

function documentHistoryIsDeleted(
  item: LineageGraphInput["historyItems"][number] | undefined,
) {
  return item?.documentStatus === "deleted" || item?.documentDownloadAvailable === false;
}

function failedTaskForKind(input: LineageGraphInput, kind: GenerationTask["kind"]) {
  return input.generationTasks.find(
    (task) => task.kind === kind && task.status === "failed",
  );
}

function subtaskActiveFor(
  input: LineageGraphInput,
  kind: GenerationTask["kind"],
  diagram: string,
) {
  if (
    input.generationTasks.some(
      (task) =>
        task.kind === kind &&
        taskIsActive(task) &&
        task.subtasks.some(
          (subtask) =>
            ACTIVE_SUBTASK_STATUSES.has(subtask.status) &&
            (subtask.id === diagram ||
              subtask.id.endsWith(`:${diagram}`) ||
              subtask.id.includes(`:${diagram}:`)),
        ),
    )
  ) {
    return true;
  }
  if (kind === "requirements") {
    return activeRequirementProjectDiagramStatuses(input.projectRuns).has(
      diagram as DiagramType,
    );
  }
  if (kind === "design") {
    return activeDesignProjectDiagramStatuses(input.projectRuns).has(
      diagram as DesignDiagramType,
    );
  }
  return false;
}

function subtaskFailureFor(
  input: LineageGraphInput,
  kind: GenerationTask["kind"],
  diagram: string,
) {
  return input.generationTasks
    .flatMap((task) => (task.kind === kind ? task.subtasks : []))
    .find(
      (subtask) =>
        subtask.status === "failed" &&
        (subtask.id === diagram ||
          subtask.id.endsWith(`:${diagram}`) ||
          subtask.id.includes(`:${diagram}:`)),
    );
}

function hasRequirementModel(input: LineageGraphInput, diagram: DiagramType) {
  return Object.values(input.models).some(
    (model) => model?.diagramKind === diagram,
  );
}

function hasRequirementArtifact(input: LineageGraphInput, diagram: DiagramType) {
  if (input.svgArtifacts[diagram]) return true;
  return Object.entries(input.models).some(([modelId, model]) =>
    Boolean(model?.diagramKind === diagram && input.svgArtifacts[modelId]),
  );
}

function requirementRenderMissing(input: LineageGraphInput, diagram: DiagramType) {
  return (
    (hasRequirementModel(input, diagram) || input.generatedDiagrams.includes(diagram)) &&
    !hasRequirementArtifact(input, diagram)
  );
}

function hasDesignModel(input: LineageGraphInput, diagram: DesignDiagramType) {
  return Object.values(input.designModels).some(
    (model) => model?.diagramKind === diagram,
  );
}

function hasDesignArtifact(input: LineageGraphInput, diagram: DesignDiagramType) {
  if (input.designSvgArtifacts[diagram]) return true;
  return Object.values(input.designModels).some((model) =>
    Boolean(model.diagramKind === diagram && input.designSvgArtifacts[getDesignModelId(model)]),
  );
}

function designRenderMissing(input: LineageGraphInput, diagram: DesignDiagramType) {
  return (
    (hasDesignModel(input, diagram) || input.generatedDesignDiagrams.includes(diagram)) &&
    !hasDesignArtifact(input, diagram)
  );
}

function requirementDiagramsFor(input: LineageGraphInput) {
  const diagrams = new Set<DiagramType>([
    ...REQUIRED_REQUIREMENT_DIAGRAMS,
    ...input.selectedDiagrams,
    ...input.generatedDiagrams,
    ...input.staleDiagrams,
    ...(Object.keys(input.diagramErrors) as DiagramType[]),
    ...input.rules.flatMap((rule) => rule.relatedDiagrams),
    ...activeRequirementProjectDiagramStatuses(input.projectRuns).keys(),
  ]);
  Object.values(input.models).forEach((model) => {
    if (model?.diagramKind) diagrams.add(model.diagramKind);
  });
  return DIAGRAM_ORDER.filter((diagram) => diagrams.has(diagram));
}

function designDiagramsFor(input: LineageGraphInput) {
  const errorDiagrams = Object.keys(input.designDiagramErrors)
    .map(designDiagramKindFromRecordKey)
    .filter((diagram): diagram is DesignDiagramType => Boolean(diagram));
  const diagrams = new Set<DesignDiagramType>([
    ...REQUIRED_DESIGN_DIAGRAMS,
    ...input.selectedDesignDiagrams,
    ...input.generatedDesignDiagrams,
    ...input.staleDesignDiagrams,
    ...errorDiagrams,
    ...activeDesignProjectDiagramStatuses(input.projectRuns).keys(),
  ]);
  Object.values(input.designModels).forEach((model) => {
    diagrams.add(model.diagramKind);
  });
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => diagrams.has(diagram));
}

function designErrorFor(input: LineageGraphInput, diagram: DesignDiagramType) {
  return (
    input.designDiagramErrors[diagram] ??
    Object.entries(input.designDiagramErrors).find(
      ([key]) => designDiagramKindFromRecordKey(key) === diagram,
    )?.[1]
  );
}

function designModelIdsForDiagram(input: LineageGraphInput, diagram: DesignDiagramType) {
  return Object.values(input.designModels)
    .filter((model) => model.diagramKind === diagram)
    .map(getDesignModelId);
}

function designDiagramIsStale(input: LineageGraphInput, diagram: DesignDiagramType) {
  if (input.staleDesignDiagrams.includes(diagram)) return true;
  const staleModelIds = new Set(input.staleDesignModelIds);
  return designModelIdsForDiagram(input, diagram).some((modelId) =>
    staleModelIds.has(modelId),
  );
}

function designStaleReasonForDiagram(
  input: LineageGraphInput,
  diagram: DesignDiagramType,
) {
  for (const modelId of designModelIdsForDiagram(input, diagram)) {
    const reason = input.designStaleReasons[modelId];
    if (reason) return reason;
  }
  return input.designGenerationBlockedReason ?? null;
}

function errorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const record = error as { error?: unknown };
  return record.error ? localizeRunFailure(record.error, fallback) : fallback;
}

function lastFinishedTaskEvent(
  input: LineageGraphInput,
  kind: GenerationTask["kind"],
  fallback: string,
) {
  const task = [...input.generationTasks]
    .reverse()
    .find((item) => item.kind === kind && item.finishedAt);
  if (!task?.finishedAt) return [];
  return [
    {
      label: fallback,
      description: formatRelativeDate(task.finishedAt),
    },
  ];
}

function runActionLabel(action?: string | null) {
  if (action === "retry") return "重试";
  if (action === "rerun") return "重新运行";
  return "派生运行";
}

function historyRelationEvent(
  input: LineageGraphInput,
  kind: GenerationTask["kind"],
  matches: (item: LineageGraphInput["historyItems"][number]) => boolean = () => true,
) {
  const item = input.historyItems.find(
    (historyItem) =>
      historyRunKind(historyItem) === kind &&
      matches(historyItem) &&
      (historyItem.sourceRunId || historyItem.latestActionRunId),
  );
  if (!item) return [];
  const label = item.sourceRunId
    ? `${runActionLabel(item.sourceAction)}自 ${item.sourceRunId}`
    : `已${runActionLabel(item.latestAction)}为 ${item.latestActionRunId}`;
  return [
    {
      label,
      description: formatRelativeDate(item.latestActionAt ?? item.createdAt),
    },
  ];
}

function recentEventsForKind(
  input: LineageGraphInput,
  kind: GenerationTask["kind"],
  fallback: string,
  matches?: (item: LineageGraphInput["historyItems"][number]) => boolean,
) {
  return [
    ...lastFinishedTaskEvent(input, kind, fallback),
    ...historyRelationEvent(input, kind, matches),
  ];
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rulesStatus(input: LineageGraphInput): LineageNodeStatus {
  if (taskKindActive(input, "requirements")) return "running";
  if (failedRulesHistory(input)) return "error";
  if (
    interruptedHistoryForKind(input, "requirements", (item) =>
      (historyStage(item) ?? "").includes("rules") ||
      (historyStage(item) ?? "").includes("extract"),
    )
  ) {
    return "interrupted";
  }
  if (input.rules.length === 0) return "not-generated";
  if (requirementSourceMissing(input)) return "stale";
  if (input.isRulesStale) return "stale";
  const failedRuleReviews = Object.values(input.requirementReviewCandidates).some(
    (candidate) => candidate.status === "failed",
  );
  return failedRuleReviews ? "error" : "current";
}

function ruleReason(input: LineageGraphInput, rule: RequirementRule) {
  const failedRules = failedRulesHistory(input);
  if (failedRules) return failedRulesSummary(failedRules);
  if (input.rules.length === 0) return "尚未抽取需求规则。";
  if (requirementSourceMissing(input)) {
    return "需求源头已删除，旧规则仍可查看，但需重新输入需求并重新抽取。";
  }
  if (input.isRulesStale) return "需求文本、规则或复核结果已变化，需求规则需更新。";
  const failedReview = input.requirementReviewCandidates[rule.id];
  if (failedReview?.status === "failed") {
    return failedReview.errorMessage ?? "规则修复失败，上一版规则仍可查看。";
  }
  const interrupted = interruptedHistoryForKind(input, "requirements", (item) =>
    (historyStage(item) ?? "").includes("rules") ||
    (historyStage(item) ?? "").includes("extract"),
  );
  if (interrupted) return interruptedRunSummary(interrupted);
  if (taskKindActive(input, "requirements")) return "需求生成任务正在处理上游规则。";
  return "需求规则为最新，可继续生成下游模型。";
}

function requirementStatus(
  input: LineageGraphInput,
  diagram: DiagramType,
): LineageNodeStatus {
  if (input.diagramErrors[diagram]) return "error";
  if (subtaskFailureFor(input, "requirements", diagram)) return "error";
  if (subtaskActiveFor(input, "requirements", diagram)) return "running";
  if (
    interruptedHistoryForKind(input, "requirements", (item) =>
      !(item.stage ?? "").includes("rules") && !(item.stage ?? "").includes("extract"),
    )
  ) {
    return "interrupted";
  }
  if (input.staleDiagrams.includes(diagram)) return "stale";
  if (requirementRenderMissing(input, diagram)) return "stale";
  if (
    requirementSourceMissing(input) &&
    (hasRequirementModel(input, diagram) || input.generatedDiagrams.includes(diagram))
  ) {
    return "stale";
  }
  if (hasRequirementModel(input, diagram) || input.generatedDiagrams.includes(diagram)) {
    return "current";
  }
  return "not-generated";
}

function requirementReason(
  input: LineageGraphInput,
  diagram: DiagramType,
  status: LineageNodeStatus,
) {
  const label = DIAGRAM_META[diagram].label;
  if (status === "error") {
    return `${label}本次生成失败，上一版${hasRequirementModel(input, diagram) ? "仍可查看" : "尚不可查看"}。${errorMessage(
      input.diagramErrors[diagram],
      "",
    )}`;
  }
  if (status === "running") {
    return hasRequirementArtifact(input, diagram)
      ? `${label}重新生成中，旧产物仍可查看；完成后会刷新下游可用状态。`
      : `${label}正在生成，完成后会刷新下游可用状态。`;
  }
  if (status === "interrupted") {
    const interrupted = interruptedHistoryForKind(input, "requirements", (item) =>
      !(item.stage ?? "").includes("rules") && !(item.stage ?? "").includes("extract"),
    );
    return `${label}${hasRequirementModel(input, diagram) ? "上一版仍可查看，" : ""}${interruptedRunSummary(interrupted)}`;
  }
  if (status === "stale") {
    if (requirementSourceMissing(input)) {
      return `需求源头已删除，${label}为旧产物，仍可查看但需重新输入需求并重跑。`;
    }
    if (input.isRulesStale) return "需求规则或复核结果已变化，此需求模型需更新。";
    if (input.staleDiagrams.includes(diagram)) {
      return "上游需求输入已变化，此需求模型需更新。";
    }
    if (requirementRenderMissing(input, diagram)) {
      return `${label}结构化模型已生成，但 SVG 尚未生成；需先完成图像渲染后才能作为可查看图像。`;
    }
    return "上游需求输入已变化，此需求模型需更新。";
  }
  if (status === "current") return `${label}为最新生成，可继续往下。`;
  return "尚未生成，生成后才能稳定驱动设计模型。";
}

function designStatus(
  input: LineageGraphInput,
  diagram: DesignDiagramType,
): LineageNodeStatus {
  if (designErrorFor(input, diagram)) return "error";
  if (subtaskFailureFor(input, "design", diagram)) return "error";
  if (subtaskActiveFor(input, "design", diagram)) return "running";
  if (interruptedHistoryForKind(input, "design")) return "interrupted";
  if (designRenderMissing(input, diagram)) return "stale";
  if (
    requirementSourceMissing(input) &&
    (hasDesignModel(input, diagram) || input.generatedDesignDiagrams.includes(diagram))
  ) {
    return "stale";
  }
  if (hasDesignModel(input, diagram) || input.generatedDesignDiagrams.includes(diagram)) {
    return designDiagramIsStale(input, diagram) ? "stale" : "current";
  }
  return "not-generated";
}

function designReason(
  input: LineageGraphInput,
  diagram: DesignDiagramType,
  status: LineageNodeStatus,
) {
  const label = DESIGN_DIAGRAM_META[diagram].label;
  if (status === "error") {
    return `${label}本次生成失败，上一版${hasDesignModel(input, diagram) ? "仍可查看" : "尚不可查看"}。${errorMessage(
      designErrorFor(input, diagram),
      "",
    )}`;
  }
  if (status === "running") {
    return hasDesignArtifact(input, diagram)
      ? `${label}重新生成中，旧产物仍可查看；完成后会刷新代码和文档影响。`
      : `${label}正在生成，完成后会刷新代码和文档影响。`;
  }
  if (status === "interrupted") {
    const interrupted = interruptedHistoryForKind(input, "design");
    return `${label}${hasDesignModel(input, diagram) ? "上一版仍可查看，" : ""}${interruptedRunSummary(interrupted)}`;
  }
  if (status === "stale") {
    if (requirementSourceMissing(input)) {
      return `需求源头已删除，${label}为旧产物，仍可查看但需重新输入需求并重跑。`;
    }
    const staleReason = designStaleReasonForDiagram(input, diagram);
    if (staleReason) return staleReason;
    if (designRenderMissing(input, diagram)) {
      return `${label}结构化模型已生成，但 SVG 尚未生成；需先完成图像渲染后才能作为可查看图像。`;
    }
    return "上游需求模型或追踪指纹已变化，此设计模型需更新。";
  }
  if (status === "current") return `${label}为最新生成，可继续生成产物。`;
  return "尚未生成，生成后才能驱动代码或设计说明书。";
}





function documentStatus(input: LineageGraphInput, documentKind: DocumentKind): LineageNodeStatus {
  if (documentTaskActive(input, documentKind)) return "running";
  const failed = input.generationTasks.find(
    (task) =>
      task.kind === "document" &&
      task.documentKind === documentKind &&
      task.status === "failed",
  );
  if (failed) return "error";
  if (
    interruptedHistoryForKind(
      input,
      "document",
      (item) => historyDocumentKind(item) === documentKind,
    )
  ) {
    return "interrupted";
  }
  const completedHistory = documentHistoryFor(input, documentKind);
  if (!completedHistory) return "not-generated";
  if (documentHistoryIsDeleted(completedHistory)) return "stale";
  if (requirementSourceMissing(input)) return "stale";
  const missingArtifactCount =
    completedHistory.missingArtifactCount ??
    historyDocumentMissingArtifacts(completedHistory).length;
  return missingArtifactCount > 0 ? "stale" : "current";
}

function documentReason(
  input: LineageGraphInput,
  documentKind: DocumentKind,
  status: LineageNodeStatus,
) {
  const label = documentKind === "requirementsSpec"
    ? "需求说明书"
    : documentKind === "softwareDesignSpec"
      ? "设计说明书"
      : "可行性研究报告";
  if (status === "running") return `${label}正在生成。`;
  if (status === "error") {
    const failed = input.generationTasks.find(
      (task) =>
        task.kind === "document" &&
        task.documentKind === documentKind &&
        task.status === "failed",
    );
    return failed?.errorMessage ?? `${label}生成失败，上一版仍可查看。`;
  }
  if (status === "interrupted") {
    const interrupted = interruptedHistoryForKind(
      input,
      "document",
      (item) => historyDocumentKind(item) === documentKind,
    );
    return `${label}生成服务中断，${interruptedRunSummary(interrupted)}`;
  }
  if (status === "stale") {
    if (requirementSourceMissing(input)) {
      return `${label}基于已删除的需求源头生成，仍可查看/下载但需重新输入需求后重跑。`;
    }
    const history = documentHistoryFor(input, documentKind);
    if (documentHistoryIsDeleted(history)) {
      return `${label}已在文档中心删除，恢复文档后可重新下载或查看。`;
    }
    const missingArtifacts = history ? historyDocumentMissingArtifacts(history) : [];
    const firstMissing = missingArtifacts[0];
    return firstMissing
      ? `${label}已生成但缺图，需复核：${firstMissing}`
      : `${label}已生成但存在缺失图，需复核后再交付。`;
  }
  if (status === "current") return `${label}已生成，可在文档中心查看。`;
  return `${label}尚未生成。`;
}

function uniqueEdges(edges: LineageEdge[]) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  });
}

function applyConnections(nodes: LineageNode[], edges: LineageEdge[]) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source && !source.downstreamIds.includes(edge.target)) {
      source.downstreamIds.push(edge.target);
    }
    if (target && !target.upstreamIds.includes(edge.source)) {
      target.upstreamIds.push(edge.source);
    }
  }
}

function addEdge(
  edges: LineageEdge[],
  nodesById: Map<string, LineageNode>,
  source: string,
  target: string,
  label?: string,
) {
  if (!nodesById.has(source) || !nodesById.has(target)) return;
  const sourceNode = nodesById.get(source);
  const targetNode = nodesById.get(target);
  edges.push({
    id: `${source}->${target}`,
    source,
    target,
    status: edgeStatus(sourceNode?.status, targetNode?.status),
    label,
  });
}

function buildRuleNodes(input: LineageGraphInput): LineageNode[] {
  if (input.rules.length === 0) {
    const status = rulesStatus(input);
    return [
      {
        id: nodeId("rule", "empty"),
        kind: "rule" as const,
        stage: "requirement-rules" as const,
        stageLabel: STAGE_LABELS["requirement-rules"],
        label: "需求规则",
        eyebrow: "未生成",
        description: "从需求文本抽取可追踪的规则。",
        status,
        reason:
          status === "error"
            ? failedRulesSummary(failedRulesHistory(input))
            : requirementSourceMissing(input)
              ? "需求源头已删除，请重新输入需求后再抽取规则。"
            : "尚未抽取需求规则，只有这里可以开始。",
        actionLabel: statusActionLabel(status),
        hasViewableArtifact: false,
        upstreamIds: [],
        downstreamIds: [],
        recentEvents: recentEventsForKind(input, "requirements", "规则生成", (item) =>
          (historyStage(item) ?? "").includes("rules") ||
          (historyStage(item) ?? "").includes("extract"),
        ),
      },
    ];
  }
  return input.rules.map((rule) => {
    const status = rulesStatus(input);
    return {
      id: ruleNodeId(rule.id),
      kind: "rule" as const,
      stage: "requirement-rules" as const,
      stageLabel: STAGE_LABELS["requirement-rules"],
      label: rule.id,
      eyebrow: rule.category,
      payload: { ruleId: rule.id, ruleCategory: rule.category },
      description: rule.text,
      status,
      reason: ruleReason(input, rule),
      actionLabel: statusActionLabel(status),
      hasViewableArtifact: true,
      upstreamIds: [],
      downstreamIds: [],
      recentEvents: recentEventsForKind(input, "requirements", "规则生成", (item) =>
        (historyStage(item) ?? "").includes("rules") ||
        (historyStage(item) ?? "").includes("extract"),
      ),
    };
  });
}

function buildRequirementNodes(input: LineageGraphInput): LineageNode[] {
  return requirementDiagramsFor(input).map((diagram) => {
    const meta = DIAGRAM_META[diagram];
    const status = requirementStatus(input, diagram);
    const hasViewableArtifact = hasRequirementArtifact(input, diagram);
    return {
      id: requirementNodeId(diagram),
      kind: "requirement-model" as const,
      stage: "requirement-models" as const,
      stageLabel: STAGE_LABELS["requirement-models"],
      label: meta.label,
      eyebrow: meta.english,
      description: meta.description,
      status,
      reason: requirementReason(input, diagram, status),
      actionLabel: statusActionLabel(status),
      hasViewableArtifact,
      upstreamIds: [],
      downstreamIds: [],
      recentEvents: recentEventsForKind(input, "requirements", "模型生成", (item) =>
        !(item.stage ?? "").includes("rules") && !(item.stage ?? "").includes("extract"),
      ),
      payload: { diagramKind: diagram },
    };
  });
}

function buildDesignNodes(input: LineageGraphInput): LineageNode[] {
  return designDiagramsFor(input).map((diagram) => {
    const meta = DESIGN_DIAGRAM_META[diagram];
    const status = designStatus(input, diagram);
    const hasViewableArtifact = hasDesignArtifact(input, diagram);
    return {
      id: designNodeId(diagram),
      kind: "design-model" as const,
      stage: "design-models" as const,
      stageLabel: STAGE_LABELS["design-models"],
      label: meta.label,
      eyebrow: meta.english,
      description: meta.description,
      status,
      reason: designReason(input, diagram, status),
      actionLabel: statusActionLabel(status),
      hasViewableArtifact,
      upstreamIds: [],
      downstreamIds: [],
      recentEvents: recentEventsForKind(input, "design", "设计生成"),
      payload: { designDiagramKind: diagram },
    };
  });
}

function buildProductNodes(input: LineageGraphInput): LineageNode[] {
  
  const requirementsDoc = documentStatus(input, "requirementsSpec");
  const designDoc = documentStatus(input, "softwareDesignSpec");
  const requirementsDocHistory = documentHistoryFor(input, "requirementsSpec");
  const designDocHistory = documentHistoryFor(input, "softwareDesignSpec");
  const requirementsDocDeleted = documentHistoryIsDeleted(requirementsDocHistory);
  const designDocDeleted = documentHistoryIsDeleted(designDocHistory);
  return [
    {
      id: documentNodeId("requirementsSpec"),
      kind: "document" as const,
      stage: "documents" as const,
      stageLabel: STAGE_LABELS["documents"],
      label: "需求说明书",
      eyebrow: "Document",
      description: "汇总需求规则与需求模型的说明书。",
      status: requirementsDoc,
      reason: documentReason(input, "requirementsSpec", requirementsDoc),
      actionLabel: statusActionLabel(requirementsDoc),
      hasViewableArtifact:
        !requirementsDocDeleted &&
        (requirementsDoc === "current" || requirementsDoc === "stale"),
      upstreamIds: [],
      downstreamIds: [],
      recentEvents: recentEventsForKind(input, "document", "文档生成", (item) =>
        historyDocumentKind(item) === "requirementsSpec",
      ),
      payload: { documentKind: "requirementsSpec" as const },
    },
    {
      id: documentNodeId("softwareDesignSpec"),
      kind: "document" as const,
      stage: "documents" as const,
      stageLabel: STAGE_LABELS["documents"],
      label: "设计说明书",
      eyebrow: "Document",
      description: "汇总设计模型、代码规格与接口约束。",
      status: designDoc,
      reason: documentReason(input, "softwareDesignSpec", designDoc),
      actionLabel: statusActionLabel(designDoc),
      hasViewableArtifact:
        !designDocDeleted &&
        (designDoc === "current" || designDoc === "stale"),
      upstreamIds: [],
      downstreamIds: [],
      recentEvents: recentEventsForKind(input, "document", "文档生成", (item) =>
        historyDocumentKind(item) === "softwareDesignSpec",
      ),
      payload: { documentKind: "softwareDesignSpec" as const },
    },
    
  ];
}

function buildEdges(nodes: LineageNode[], input: LineageGraphInput) {
  const edges: LineageEdge[] = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const ruleNodes =
    input.rules.length > 0
      ? input.rules.map((rule) => ({ id: ruleNodeId(rule.id), rule }))
      : [{ id: nodeId("rule", "empty"), rule: null }];
  const requirementDiagrams = requirementDiagramsFor(input);

  for (const { id, rule } of ruleNodes) {
    const related =
      rule?.relatedDiagrams && rule.relatedDiagrams.length > 0
        ? rule.relatedDiagrams
        : requirementDiagrams;
    for (const diagram of related) {
      addEdge(
        edges,
        nodesById,
        id,
        requirementNodeId(diagram),
        rule ? "规则映射" : "生成前置",
      );
    }
  }

  for (const [designDiagram, sourceDiagrams] of Object.entries(
    DESIGN_REQUIREMENT_SOURCE_MAP,
  ) as Array<[DesignDiagramType, DiagramType[]]>) {
    for (const sourceDiagram of sourceDiagrams) {
      addEdge(
        edges,
        nodesById,
        requirementNodeId(sourceDiagram),
        designNodeId(designDiagram),
        "模型映射",
      );
    }
  }

  for (const designDiagram of designDiagramsFor(input)) {
    
    addEdge(
      edges,
      nodesById,
      designNodeId(designDiagram),
      documentNodeId("softwareDesignSpec"),
      "设计说明",
    );
  }

  for (const requirementDiagram of requirementDiagrams) {
    addEdge(
      edges,
      nodesById,
      requirementNodeId(requirementDiagram),
      documentNodeId("requirementsSpec"),
      "需求说明",
    );
  }

  return uniqueEdges(edges);
}

function summarize(nodes: LineageNode[]): LineageGraphSummary {
  return {
    total: nodes.length,
    stale: nodes.filter((node) => node.status === "stale").length,
    error: nodes.filter((node) => node.status === "error").length,
    interrupted: nodes.filter((node) => node.status === "interrupted").length,
    running: nodes.filter((node) => node.status === "running").length,
    notGenerated: nodes.filter((node) => node.status === "not-generated").length,
    current: nodes.filter((node) => node.status === "current").length,
  };
}

function defaultSelection(nodes: LineageNode[]) {
  return (
    nodes.find((node) => node.status === "error") ??
    nodes.find((node) => node.status === "interrupted") ??
    nodes.find((node) => node.status === "stale") ??
    nodes.find((node) => node.status === "running") ??
    nodes.find((node) => node.status === "not-generated") ??
    nodes[0] ??
    null
  )?.id ?? null;
}

export function buildLineageGraph(input: LineageGraphInput): LineageGraph {
  const nodes = [
    ...buildRuleNodes(input),
    ...buildRequirementNodes(input),
    ...buildDesignNodes(input),
    ...buildProductNodes(input),
  ];
  const edges = buildEdges(nodes, input);
  applyConnections(nodes, edges);
  return {
    nodes,
    edges,
    summary: summarize(nodes),
    defaultSelectedNodeId: defaultSelection(nodes),
  };
}

export function collectLineagePath(
  graph: Pick<LineageGraph, "nodes" | "edges">,
  selectedNodeId: string | null,
) {
  if (!selectedNodeId) return new Set<string>();
  const downstream = new Map<string, string[]>();
  const upstream = new Map<string, string[]>();
  for (const edge of graph.edges) {
    downstream.set(edge.source, [...(downstream.get(edge.source) ?? []), edge.target]);
    upstream.set(edge.target, [...(upstream.get(edge.target) ?? []), edge.source]);
  }
  const seen = new Set<string>([selectedNodeId]);
  const visit = (start: string, adjacency: Map<string, string[]>) => {
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
  };
  visit(selectedNodeId, upstream);
  visit(selectedNodeId, downstream);
  return seen;
}

export function groupLineageColumns(
  graph: Pick<LineageGraph, "nodes">,
): LineageColumn[] {
  return LINEAGE_STAGE_ORDER.map((stage) => ({
    id: stage,
    label: STAGE_LABELS[stage],
    nodes: graph.nodes.filter((node) => node.stage === stage),
  }));
}
