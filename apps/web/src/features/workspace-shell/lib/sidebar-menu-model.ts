// Derives sidebar diagram availability, task status, and scoped use-case nodes from workspace state.
import { designDiagramKindFromRecordKey } from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  getDesignModelId,
  getRequirementModelId,
  findRequirementModelByKind,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { PlatformRunSummary } from "../../user-platform/services/platform-api";
import type { GenerationTask } from "../../workspace-session/model/session-state";
import {
  activeDesignProjectDiagramStatuses,
  activeStatusForProjectRunKind,
  activeRequirementProjectDiagramStatuses,
  mergeProjectedStatus,
} from "./project-run-projections";

export type SidebarNodeStatus = "queued" | "running" | "completed" | "failed";

export type SidebarSubtaskNode = {
  id: string;
  label: string;
  status: SidebarNodeStatus | undefined;
};

type StageScopedSubtaskPrefix =
  | "generate_models"
  | "generate_design_sequence"
  | "generate_design_models"
  | "generate_plantuml"
  | "render_svg";

type StageStatusMap = Partial<Record<StageScopedSubtaskPrefix, SidebarNodeStatus | null>>;

type SidebarDiagramStateInput = {
  generatedDiagrams: DiagramType[];
  models: WorkspaceRecord["models"];
  staleDiagrams: DiagramType[];
  diagramErrors: WorkspaceRecord["diagramErrors"];
  svgArtifacts: WorkspaceRecord["svgArtifacts"];
  generatedDesignDiagrams: DesignDiagramType[];
  staleDesignDiagrams: DesignDiagramType[];
  staleDesignModelIds: string[];
  designModels: WorkspaceRecord["designModels"];
  designSvgArtifacts: WorkspaceRecord["designSvgArtifacts"];
  designDiagramErrors: WorkspaceRecord["designDiagramErrors"];
  generationTasks: GenerationTask[];
  projectRuns?: PlatformRunSummary[];
};

const STAGE_SCOPED_SUBTASK_PREFIXES: StageScopedSubtaskPrefix[] = [
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
  "generate_plantuml",
  "render_svg",
];

export function sidebarStatusFromSubtaskStatus(status: string | undefined) {
  switch (status) {
    case "failed":
      return "failed" as const;
    case "completed":
    case "pending_review":
      return "completed" as const;
    case "queued":
      return "queued" as const;
    case "running":
    case "repairing":
    case "rendering":
      return "running" as const;
    default:
      return null;
  }
}

export function mergeSidebarStatus(
  current: SidebarNodeStatus | undefined,
  next: SidebarNodeStatus | null,
) {
  if (!next) return current;
  if (current === "failed" || next === "failed") return "failed";
  if (current === "running" || next === "running") return "running";
  if (current === "queued" || next === "queued") return "queued";
  return "completed";
}

function scopedSubtaskInfo(id: string) {
  const prefix = STAGE_SCOPED_SUBTASK_PREFIXES.find((candidate) =>
    id.startsWith(`${candidate}:`),
  );
  if (!prefix) return null;
  return {
    prefix,
    rawId: id.slice(prefix.length + 1),
  };
}

function aggregatePipelineStatus(stageStatuses: StageStatusMap) {
  const statuses = Object.values(stageStatuses).filter(Boolean);
  if (statuses.includes("failed")) return "failed" as const;
  if (stageStatuses.render_svg === "completed") return "completed" as const;
  if (
    statuses.includes("running") ||
    stageStatuses.generate_models === "completed" ||
    stageStatuses.generate_design_sequence === "completed" ||
    stageStatuses.generate_design_models === "completed" ||
    stageStatuses.generate_plantuml === "completed"
  ) {
    return "running" as const;
  }
  if (statuses.includes("queued")) return "queued" as const;
  return null;
}

function setSubtaskStatus(
  statuses: Map<string, SidebarNodeStatus | undefined>,
  labels: Map<string, string>,
  stageStatusesByRawId: Map<string, StageStatusMap>,
  id: string,
  label: string,
  status: SidebarNodeStatus | null,
) {
  statuses.set(id, mergeSidebarStatus(statuses.get(id), status));
  labels.set(id, label);
  // Generation tasks scope repeated pipeline phases by stage; the sidebar groups
  // by model id, so keep a raw-id alias for rendering and regeneration states.
  const scoped = scopedSubtaskInfo(id);
  if (scoped) {
    const stageStatuses = stageStatusesByRawId.get(scoped.rawId) ?? {};
    stageStatuses[scoped.prefix] = status;
    stageStatusesByRawId.set(scoped.rawId, stageStatuses);
    const rawStatus = aggregatePipelineStatus(stageStatuses);
    if (rawStatus) {
      statuses.set(scoped.rawId, rawStatus);
    } else {
      statuses.delete(scoped.rawId);
    }
    labels.set(scoped.rawId, label);
  }
}

export function generationStatusTooltip(
  label: string,
  status: SidebarNodeStatus | undefined,
  hasViewableSvg: boolean,
  hasStructuredModel = hasViewableSvg,
) {
  if (status === "queued") {
    return hasViewableSvg
      ? `${label}重新生成排队中，当前图仍可查看`
      : hasStructuredModel
        ? `${label}模型已生成，等待生成图像`
        : `${label}生成排队中`;
  }
  if (status === "running") {
    return hasViewableSvg
      ? `${label}重新生成中，当前图仍可查看`
      : hasStructuredModel
        ? `${label}模型已生成，正在生成图像`
        : `${label}生成中`;
  }
  if (status === "failed") return `${label}生成失败`;
  if (status === "completed") return `${label}已生成`;
  return undefined;
}

export function diagramUnavailableReason(
  status: SidebarNodeStatus | undefined,
  hasStructuredModel: boolean,
) {
  if (status === "failed") return "生成失败，请查看生成任务详情";
  if (status === "queued") return "生成排队中，完成后可查看";
  if (status === "running") {
    return hasStructuredModel
      ? "当前只有结构化模型，SVG 尚未生成"
      : "正在生成图像，渲染完成后可查看";
  }
  if (status === "completed" || hasStructuredModel) {
    return "当前只有结构化模型，SVG 尚未生成";
  }
  return "生成完成后可查看";
}

function sequenceUseCaseNodes(useCaseModel: WorkspaceRecord["models"]["usecase"]) {
  if (!useCaseModel || !("useCases" in useCaseModel)) return [];
  return useCaseModel.useCases.map((useCase) => ({
    id: `sequence:${useCase.id}`,
    label: useCase.name,
  }));
}

function analysisUseCaseNodes(useCaseModel: WorkspaceRecord["models"]["usecase"]) {
  if (!useCaseModel || !("useCases" in useCaseModel)) return [];
  return useCaseModel.useCases.map((useCase) => ({
    id: `analysis:${useCase.id}`,
    label: useCase.name,
  }));
}

function useCaseIdsFromModel(useCaseModel: WorkspaceRecord["models"]["usecase"]) {
  if (!useCaseModel || !("useCases" in useCaseModel)) return new Set<string>();
  return new Set(useCaseModel.useCases.map((useCase) => useCase.id));
}

function sourceUseCaseIdFromScopedModel(model: unknown, prefix: "analysis" | "sequence") {
  if (!model || typeof model !== "object") return "";
  const record = model as Record<string, unknown>;
  const explicit =
    typeof record.sourceUseCaseId === "string" ? record.sourceUseCaseId.trim() : "";
  if (explicit) return explicit;
  const modelId = typeof record.modelId === "string" ? record.modelId.trim() : "";
  return modelId.startsWith(`${prefix}:`) ? modelId.slice(prefix.length + 1) : "";
}

function scopedModelMatchesCurrentUseCases(
  model: unknown,
  prefix: "analysis" | "sequence",
  currentUseCaseIds: Set<string>,
) {
  if (currentUseCaseIds.size === 0) return true;
  const sourceUseCaseId = sourceUseCaseIdFromScopedModel(model, prefix);
  return Boolean(sourceUseCaseId && currentUseCaseIds.has(sourceUseCaseId));
}

export function deriveSidebarDiagramState(input: SidebarDiagramStateInput) {
  const useCaseModel = findRequirementModelByKind(input.models, "usecase");
  const currentUseCaseIds = useCaseIdsFromModel(useCaseModel);
  const requirementModelViewable = (diagram: DiagramType, modelId?: string) =>
    Boolean((modelId ? input.svgArtifacts[modelId] : undefined) ?? input.svgArtifacts[diagram]);
  const designModelViewable = (diagram: DesignDiagramType, modelId?: string) =>
    Boolean(
      (modelId ? input.designSvgArtifacts[modelId] : undefined) ??
        input.designSvgArtifacts[diagram],
    );
  const requirementModelsByDiagram = DIAGRAM_ORDER.reduce(
    (acc, diagram) => {
      acc[diagram] = Object.values(input.models).filter(
        (model): model is NonNullable<typeof model> =>
          Boolean(model) &&
          model.diagramKind === diagram &&
          (diagram !== "analysis" ||
            scopedModelMatchesCurrentUseCases(model, "analysis", currentUseCaseIds)),
      );
      return acc;
    },
    {} as Record<DiagramType, Array<NonNullable<WorkspaceRecord["models"][string]>>>,
  );
  const designModelsByDiagram = DESIGN_DIAGRAM_ORDER.reduce(
    (acc, diagram) => {
      acc[diagram] = Object.values(input.designModels).filter(
        (model) =>
          model.diagramKind === diagram &&
          (diagram !== "sequence" ||
            scopedModelMatchesCurrentUseCases(model, "sequence", currentUseCaseIds)),
      );
      return acc;
    },
    {} as Record<DesignDiagramType, Array<WorkspaceRecord["designModels"][string]>>,
  );

  const requirementSubtaskStatus = new Map<string, SidebarNodeStatus | undefined>();
  const requirementSubtaskLabels = new Map<string, string>();
  const requirementStageStatuses = new Map<string, StageStatusMap>();
  const designSubtaskStatus = new Map<string, SidebarNodeStatus | undefined>();
  const designSubtaskLabels = new Map<string, string>();
  const designStageStatuses = new Map<string, StageStatusMap>();
  const activeRequirementProjectStatuses = activeRequirementProjectDiagramStatuses(
    input.projectRuns,
  );
  const activeDesignProjectStatuses = activeDesignProjectDiagramStatuses(
    input.projectRuns,
  );
  for (const [diagram, status] of activeRequirementProjectStatuses) {
    setSubtaskStatus(
      requirementSubtaskStatus,
      requirementSubtaskLabels,
      requirementStageStatuses,
      diagram,
      DIAGRAM_META[diagram].label,
      status,
    );
  }
  for (const [diagram, status] of activeDesignProjectStatuses) {
    setSubtaskStatus(
      designSubtaskStatus,
      designSubtaskLabels,
      designStageStatuses,
      diagram,
      DESIGN_DIAGRAM_META[diagram].label,
      status,
    );
  }
  for (const task of input.generationTasks.filter(
    (item) => item.status === "queued" || item.status === "running",
  )) {
    for (const subtask of task.subtasks) {
      const status = sidebarStatusFromSubtaskStatus(subtask.status);
      if (task.kind === "requirements") {
        setSubtaskStatus(
          requirementSubtaskStatus,
          requirementSubtaskLabels,
          requirementStageStatuses,
          subtask.id,
          subtask.label,
          status,
        );
      }
      if (task.kind === "design") {
        setSubtaskStatus(
          designSubtaskStatus,
          designSubtaskLabels,
          designStageStatuses,
          subtask.id,
          subtask.label,
          status,
        );
      }
    }
  }

  const requirementNodeDiagrams = DIAGRAM_ORDER.filter(
    (diagram) => {
      const scopedModelIds = requirementModelsByDiagram[diagram].map((model) =>
        getRequirementModelId(model),
      );
      const hasViewableScopedModel = scopedModelIds.some((modelId) =>
        requirementModelViewable(diagram, modelId),
      );
      const hasActiveScopedTask =
        requirementSubtaskStatus.has(diagram) ||
        [...requirementSubtaskStatus.keys()].some((id) => id.startsWith(`${diagram}:`));
      const hasScopedError =
        Boolean(input.diagramErrors[diagram]) ||
        Object.keys(input.diagramErrors).some((id) => id.startsWith(`${diagram}:`));
      if (diagram === "analysis") {
        return hasViewableScopedModel || hasActiveScopedTask || hasScopedError;
      }
      return (
        requirementModelsByDiagram[diagram].length > 0 ||
        input.generatedDiagrams.includes(diagram) ||
        hasActiveScopedTask ||
        hasScopedError
      );
    },
  );
  const orderedDesignDiagrams = DESIGN_DIAGRAM_ORDER.filter(
    (diagram) => {
      const hasScopedDesignError = Object.keys(input.designDiagramErrors).some(
        (id) =>
          id === diagram ||
          id.startsWith(`${diagram}:`) ||
          designDiagramKindFromRecordKey(id) === diagram,
      );
      return (
        designModelsByDiagram[diagram].length > 0 ||
        input.generatedDesignDiagrams.includes(diagram) ||
        input.staleDesignDiagrams.includes(diagram) ||
        designSubtaskStatus.has(diagram) ||
        hasScopedDesignError ||
        (diagram === "sequence" &&
          [...designSubtaskStatus.keys()].some((id) => id.startsWith("sequence:")))
      );
    },
  );

  const requirementStatusFor = (diagram: DiagramType, modelId?: string): SidebarNodeStatus | undefined => {
    if (modelId && input.diagramErrors[modelId]) return "failed";
    if (input.diagramErrors[diagram]) return "failed";
    const activeStatus =
      (modelId ? requirementSubtaskStatus.get(modelId) : undefined) ??
      requirementSubtaskStatus.get(diagram);
    if (activeStatus) return activeStatus;
    const viewable = requirementModelViewable(diagram, modelId);
    if (viewable) return "completed";
    return undefined;
  };
  const analysisGenerationActive =
    requirementSubtaskStatus.has("analysis") ||
    [...requirementSubtaskStatus.keys()].some((id) => id.startsWith("analysis:"));
  const expectedAnalysisNodes = analysisGenerationActive
    ? analysisUseCaseNodes(useCaseModel)
    : [];
  const analysisNodeIds = Array.from(
    new Set([
      ...expectedAnalysisNodes.map((node) => node.id),
      ...requirementModelsByDiagram.analysis.map((model) => getRequirementModelId(model)),
      ...[...requirementSubtaskStatus.keys()].filter(
        (id) =>
          id.startsWith("analysis:") &&
          (currentUseCaseIds.size === 0 ||
            currentUseCaseIds.has(id.slice("analysis:".length))),
      ),
      ...Object.keys(input.diagramErrors).filter(
        (id) =>
          id.startsWith("analysis:") &&
          (currentUseCaseIds.size === 0 ||
            currentUseCaseIds.has(id.slice("analysis:".length))),
      ),
    ]),
  );
  const analysisSubtaskNodes: SidebarSubtaskNode[] = analysisNodeIds.map((id) => {
    const model = input.models[id];
    const expected = expectedAnalysisNodes.find((node) => node.id === id);
    const rawLabel =
      model && "sourceUseCaseName" in model
        ? model.sourceUseCaseName ?? model.title
        : requirementSubtaskLabels.get(id) ?? expected?.label ?? id.replace(/^analysis:/, "");
    return {
      id,
      label: rawLabel.replace(/^需求分析模型[：:]\s*/u, ""),
      status: requirementStatusFor("analysis", id),
    };
  });

  const designStatusFor = (
    diagram: DesignDiagramType,
    modelId?: string,
  ): SidebarNodeStatus | undefined => {
    if (modelId && input.designDiagramErrors[modelId]) return "failed";
    if (input.designDiagramErrors[diagram]) return "failed";
    const hasDiagramError = Object.keys(input.designDiagramErrors).some((id) => {
      if (id === modelId) return true;
      if (modelId && id.startsWith(`${diagram}:`)) return false;
      if (id.startsWith(`${diagram}:`)) return true;
      return designDiagramKindFromRecordKey(id) === diagram;
    });
    if (hasDiagramError) return "failed";
    const activeStatus =
      (modelId ? designSubtaskStatus.get(modelId) : undefined) ??
      designSubtaskStatus.get(diagram);
    if (activeStatus) return activeStatus;
    const viewable = designModelViewable(diagram, modelId);
    if (viewable) return "completed";
    return undefined;
  };
  const sequenceGenerationActive =
    designSubtaskStatus.has("sequence") ||
    [...designSubtaskStatus.keys()].some((id) => id.startsWith("sequence:"));
  const expectedSequenceNodes = sequenceGenerationActive
    ? sequenceUseCaseNodes(useCaseModel)
    : [];
  const sequenceNodeIds = Array.from(
    new Set([
      ...expectedSequenceNodes.map((node) => node.id),
      ...designModelsByDiagram.sequence.map((model) => getDesignModelId(model)),
      ...[...designSubtaskStatus.keys()].filter(
        (id) =>
          id.startsWith("sequence:") &&
          (currentUseCaseIds.size === 0 ||
            currentUseCaseIds.has(id.slice("sequence:".length))),
      ),
      ...Object.keys(input.designDiagramErrors).filter(
        (id) =>
          id.startsWith("sequence:") &&
          (currentUseCaseIds.size === 0 ||
            currentUseCaseIds.has(id.slice("sequence:".length))),
      ),
    ]),
  );
  const sequenceSubtaskNodes: SidebarSubtaskNode[] = sequenceNodeIds.map((id) => {
    const model = input.designModels[id];
    const expected = expectedSequenceNodes.find((node) => node.id === id);
    const rawLabel =
      model && "sourceUseCaseName" in model
        ? model.sourceUseCaseName ?? model.title
        : designSubtaskLabels.get(id) ?? expected?.label ?? id.replace(/^sequence:/, "");
    return {
      id,
      label: rawLabel.replace(/^(?:顺序图|用例实现设计)[：:]\s*/u, ""),
      status: designStatusFor("sequence", id),
    };
  });

  return {
    requirementModelViewable,
    designModelViewable,
    requirementModelsByDiagram,
    designModelsByDiagram,
    requirementNodeDiagrams,
    orderedDesignDiagrams,
    requirementStatusFor,
    designStatusFor,
    analysisGenerationActive,
    analysisSubtaskNodes,
    sequenceGenerationActive,
    sequenceSubtaskNodes,
    requirementRootStatus: mergeProjectedStatus(
      undefined,
      activeStatusForProjectRunKind(input.projectRuns, "requirements"),
    ),
    designRootStatus: mergeProjectedStatus(
      undefined,
      activeStatusForProjectRunKind(input.projectRuns, "design"),
    ),
    
    documentRootStatus: mergeProjectedStatus(
      undefined,
      activeStatusForProjectRunKind(input.projectRuns, "document"),
    ),
  };
}
