// Builds generation dependency plans, labels, and subtasks without touching React session state.
import type {
  DiagramModelSpec,
} from "@uml-platform/contracts";
import {
  DESIGN_DIAGRAM_META,
  DESIGN_DIAGRAM_ORDER,
  DIAGRAM_META,
  DIAGRAM_ORDER,
  findRequirementModelByKind,
  type DesignDiagramType,
  type DiagramType,
} from "../../../entities/diagram/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { GenerationTask } from "../model/session-state";

export type GenerationConfirmationSummary = {
  title: string;
  description: string;
  ruleDependencyLabels?: string[];
  requirementDependencyLabels?: string[];
  newLabels: string[];
  regeneratedLabels: string[];
  dependencyLabels: string[];
  keptLabels: string[];
};

export type RequirementAutoUpstreamPlan = {
  needsRulesRun: boolean;
  rulesRunMode: "none" | "replace";
  requestedDiagrams: DiagramType[];
  effectiveDiagrams: DiagramType[];
  dependencyDiagrams: DiagramType[];
};

export const DESIGN_REQUIREMENT_SOURCE_MAP: Record<
  DesignDiagramType,
  DiagramType[]
> = {
  architecture: ["function"],
  sequence: ["usecase", "analysis"],
  navigation: ["prototype"],
  class: ["class", "usecase"],
  component: [],
  deployment: ["deployment"],
  table: [],
};

export const DESIGN_MODEL_DEPENDENCY_MAP: Record<
  DesignDiagramType,
  DesignDiagramType[]
> = {
  architecture: [],
  sequence: [],
  navigation: [],
  class: [],
  component: ["class"],
  deployment: ["component"],
  table: ["class"],
};

export function orderedRequirementDiagrams(diagrams: DiagramType[]) {
  const set = new Set(diagrams);
  return DIAGRAM_ORDER.filter((diagram) => set.has(diagram));
}

export function orderedDesignDiagrams(diagrams: DesignDiagramType[]) {
  const set = new Set(diagrams);
  return DESIGN_DIAGRAM_ORDER.filter((diagram) => set.has(diagram));
}

export function requirementLabels(diagrams: DiagramType[]) {
  return orderedRequirementDiagrams(diagrams).map(
    (diagram) => DIAGRAM_META[diagram].label,
  );
}

export function diagramLabels(diagrams: DiagramType[]) {
  return requirementLabels(diagrams);
}

export function designLabels(diagrams: DesignDiagramType[]) {
  return orderedDesignDiagrams(diagrams).map(
    (diagram) => DESIGN_DIAGRAM_META[diagram].label,
  );
}

export function hasRequirementModelKind(
  models: WorkspaceRecord["models"] | DiagramModelSpec[],
  diagram: DiagramType,
) {
  const values = Array.isArray(models) ? models : Object.values(models);
  return values.some((model) => model?.diagramKind === diagram);
}

export function planRequirementAutoUpstream(input: {
  requestedDiagrams: DiagramType[];
  existingModels: WorkspaceRecord["models"];
  rules: RequirementRule[];
}) {
  const requestedDiagrams = orderedRequirementDiagrams(input.requestedDiagrams);
  const dependencyDiagrams = new Set<DiagramType>();
  if (
    requestedDiagrams.includes("analysis") &&
    !hasRequirementModelKind(input.existingModels, "usecase") &&
    !requestedDiagrams.includes("usecase")
  ) {
    dependencyDiagrams.add("usecase");
  }
  const effectiveDiagrams = orderedRequirementDiagrams([
    ...requestedDiagrams,
    ...dependencyDiagrams,
  ]);
  const rulesRunMode =
    effectiveDiagrams.length === 0 ? "none" : input.rules.length === 0
      ? "replace"
      : "none";
  return {
    needsRulesRun: rulesRunMode !== "none",
    rulesRunMode,
    requestedDiagrams,
    effectiveDiagrams,
    dependencyDiagrams: orderedRequirementDiagrams([...dependencyDiagrams]),
  } satisfies RequirementAutoUpstreamPlan;
}

export function planDesignRequirementAutoUpstream(input: {
  requestedDesignDiagrams: DesignDiagramType[];
  requirementModels: WorkspaceRecord["models"];
  rules: RequirementRule[];
}) {
  const required = new Set<DiagramType>();
  for (const diagram of input.requestedDesignDiagrams) {
    for (const requirementDiagram of DESIGN_REQUIREMENT_SOURCE_MAP[diagram]) {
      if (
        !hasRequirementModelKind(input.requirementModels, requirementDiagram)
      ) {
        required.add(requirementDiagram);
      }
    }
  }
  return planRequirementAutoUpstream({
    requestedDiagrams: [...required],
    existingModels: input.requirementModels,
    rules: input.rules,
  });
}

function ruleDependencyLabelsForPlan(plan?: RequirementAutoUpstreamPlan) {
  if (!plan?.needsRulesRun) return [];
  return ["需求规则抽取/更新"];
}

type DiagramGenerationStage =
  | "generate_models"
  | "generate_design_sequence"
  | "generate_design_models"
  | "generate_plantuml"
  | "render_svg"
  | "verify_diagram_visual";

function scopedGenerationSubtask(input: {
  stage: DiagramGenerationStage;
  id: string;
  label: string;
  status?: GenerationTask["subtasks"][number]["status"];
}): GenerationTask["subtasks"][number] {
  return {
    id: `${input.stage}:${input.id}`,
    label: input.label,
    status: input.status ?? "queued",
    message: null,
    errorMessage: null,
  };
}

function stagedDiagramSubtasks(input: {
  modelStage: DiagramGenerationStage;
  id: string;
  label: string;
}): GenerationTask["subtasks"] {
  return [
    scopedGenerationSubtask({
      stage: input.modelStage,
      id: input.id,
      label: input.label,
    }),
    scopedGenerationSubtask({
      stage: "generate_plantuml",
      id: input.id,
      label: input.label,
    }),
    scopedGenerationSubtask({
      stage: "render_svg",
      id: input.id,
      label: input.label,
    }),
    scopedGenerationSubtask({
      stage: "verify_diagram_visual",
      id: input.id,
      label: input.label,
    }),
  ];
}

export function designGenerationSubtasks(
  diagrams: DesignDiagramType[],
  requirementModels: WorkspaceRecord["models"],
): GenerationTask["subtasks"] {
  return diagrams.flatMap((diagram) => {
    if (diagram !== "sequence") {
      return stagedDiagramSubtasks({
        modelStage: "generate_design_models",
        id: diagram,
        label: DESIGN_DIAGRAM_META[diagram].label,
      });
    }
    const useCaseModel = findRequirementModelByKind(requirementModels, "usecase");
    if (!useCaseModel || !("useCases" in useCaseModel)) {
      return stagedDiagramSubtasks({
        modelStage: "generate_design_sequence",
        id: "sequence",
        label: DESIGN_DIAGRAM_META.sequence.label,
      });
    }
    return useCaseModel.useCases.flatMap((useCase) =>
      stagedDiagramSubtasks({
        modelStage: "generate_design_sequence",
        id: `sequence:${useCase.id}`,
        label: `用例实现设计：${useCase.name}`,
      }),
    );
  });
}

export function requirementGenerationSubtasks(
  diagrams: DiagramType[],
  requirementModels: WorkspaceRecord["models"],
  analysisTargetUseCaseIds: string[] = [],
): GenerationTask["subtasks"] {
  const analysisTargets = new Set(analysisTargetUseCaseIds);
  return diagrams.flatMap((diagram) => {
    if (diagram !== "analysis") {
      return stagedDiagramSubtasks({
        modelStage: "generate_models",
        id: diagram,
        label: DIAGRAM_META[diagram].label,
      });
    }
    const useCaseModel = findRequirementModelByKind(requirementModels, "usecase");
    if (!useCaseModel || !("useCases" in useCaseModel)) {
      return stagedDiagramSubtasks({
        modelStage: "generate_models",
        id: "analysis",
        label: DIAGRAM_META.analysis.label,
      });
    }
    const useCases =
      analysisTargets.size > 0
        ? useCaseModel.useCases.filter((useCase) =>
            analysisTargets.has(useCase.id),
          )
        : useCaseModel.useCases;
    return useCases.flatMap((useCase) =>
      stagedDiagramSubtasks({
        modelStage: "generate_models",
        id: `analysis:${useCase.id}`,
        label: `需求分析模型：${useCase.name}`,
      }),
    );
  });
}

export function analyzeRequirementGeneration(
  requestedDiagrams: DiagramType[],
  existingDiagrams: DiagramType[],
  plan?: RequirementAutoUpstreamPlan,
): GenerationConfirmationSummary {
  const requested = orderedRequirementDiagrams(
    plan?.effectiveDiagrams ?? requestedDiagrams,
  );
  const existing = new Set(existingDiagrams);
  const effective = new Set(requested);
  const newDiagrams = requested.filter((diagram) => !existing.has(diagram));
  const regeneratedDiagrams = requested.filter((diagram) =>
    existing.has(diagram),
  );
  const keptDiagrams = orderedRequirementDiagrams(existingDiagrams).filter(
    (diagram) => !effective.has(diagram),
  );
  return {
    title: "确认生成需求模型",
    description:
      plan?.needsRulesRun || (plan?.dependencyDiagrams.length ?? 0) > 0
        ? "本次会先补齐缺失的上游需求规则或模型，再生成所选需求模型。"
        : "本次会追加或更新所选需求模型，已有模型会保留。",
    ruleDependencyLabels: ruleDependencyLabelsForPlan(plan),
    requirementDependencyLabels: diagramLabels(plan?.dependencyDiagrams ?? []),
    newLabels: requirementLabels(newDiagrams),
    regeneratedLabels: requirementLabels(regeneratedDiagrams),
    dependencyLabels: [],
    keptLabels: requirementLabels(keptDiagrams),
  };
}

export function collectExistingRequirementDiagramKinds(
  models: WorkspaceRecord["models"],
): DiagramType[] {
  return orderedRequirementDiagrams(
    Object.values(models)
      .filter(Boolean)
      .map((model) => model.diagramKind),
  );
}

export function collectExistingDesignDiagramKinds(
  designModels: WorkspaceRecord["designModels"],
): DesignDiagramType[] {
  return orderedDesignDiagrams(
    Object.values(designModels).map((model) => model.diagramKind),
  );
}

export function resolveDesignGenerationDiagrams(
  requestedDiagrams: DesignDiagramType[],
  existingDiagrams: DesignDiagramType[],
) {
  const requested = new Set(requestedDiagrams);
  const existing = new Set(existingDiagrams);
  const dependencies = new Set<DesignDiagramType>();

  const includeDependenciesFor = (diagram: DesignDiagramType) => {
    for (const dependency of DESIGN_MODEL_DEPENDENCY_MAP[diagram]) {
      if (existing.has(dependency) && !requested.has(dependency)) {
        continue;
      }
      if (!existing.has(dependency) && !requested.has(dependency)) {
        dependencies.add(dependency);
      }
      includeDependenciesFor(dependency);
    }
  };

  for (const diagram of requested) {
    includeDependenciesFor(diagram);
  }

  const effectiveDiagrams = orderedDesignDiagrams([
    ...requestedDiagrams,
    ...dependencies,
  ]);
  return {
    effectiveDiagrams,
    dependencyDiagrams: orderedDesignDiagrams([...dependencies]),
  };
}

export function analyzeDesignGeneration(
  effectiveDiagrams: DesignDiagramType[],
  dependencyDiagrams: DesignDiagramType[],
  existingDiagrams: DesignDiagramType[],
  requirementPlan?: RequirementAutoUpstreamPlan,
): GenerationConfirmationSummary {
  const existing = new Set(existingDiagrams);
  const effective = new Set(effectiveDiagrams);
  const newDiagrams = effectiveDiagrams.filter(
    (diagram) => !existing.has(diagram),
  );
  const regeneratedDiagrams = effectiveDiagrams.filter((diagram) =>
    existing.has(diagram),
  );
  const keptDiagrams = orderedDesignDiagrams(existingDiagrams).filter(
    (diagram) => !effective.has(diagram),
  );
  return {
    title: "确认生成设计模型",
    description:
      requirementPlan?.needsRulesRun ||
      (requirementPlan?.effectiveDiagrams.length ?? 0) > 0 ||
      dependencyDiagrams.length > 0
        ? "本次会先补齐缺失的上游需求规则或模型，再生成所选设计模型。"
        : "本次会追加或更新设计模型；缺失的前置模型会在确认后一并生成。",
    ruleDependencyLabels: ruleDependencyLabelsForPlan(requirementPlan),
    requirementDependencyLabels: diagramLabels(
      requirementPlan?.effectiveDiagrams ?? [],
    ),
    newLabels: designLabels(newDiagrams),
    regeneratedLabels: designLabels(regeneratedDiagrams),
    dependencyLabels: designLabels(dependencyDiagrams),
    keptLabels: designLabels(keptDiagrams),
  };
}
