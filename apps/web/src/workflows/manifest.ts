// Describes the product workflow and artifact provenance contracts.
export type { ArtifactProvenance } from "../entities/workspace/provenance";

export type WorkflowRunKind = "requirements" | "design" | "document";

export interface WorkflowPrerequisite {
  id: string;
  label: string;
  isMet: (state: WorkflowPrerequisiteState) => boolean;
  disabledReason: string;
}

export interface WorkflowStepDefinition {
  id: string;
  label: string;
  runKind: WorkflowRunKind;
  inputArtifactTypes: string[];
  outputArtifactTypes: string[];
  prerequisites: WorkflowPrerequisite[];
}

export interface WorkflowPrerequisiteState {
  hasRequirementText: boolean;
  hasRequirementModels: boolean;
  hasDesignModels: boolean;
  
}

const hasRequirementText: WorkflowPrerequisite = {
  id: "has-requirement-text",
  label: "需求文本",
  isMet: (state) => state.hasRequirementText,
  disabledReason: "请先输入需求文本",
};

const hasRequirementModels: WorkflowPrerequisite = {
  id: "has-requirement-models",
  label: "需求模型",
  isMet: (state) => state.hasRequirementModels,
  disabledReason: "请先生成需求模型",
};

const hasDesignModels: WorkflowPrerequisite = {
  id: "has-design-models",
  label: "设计模型",
  isMet: (state) => state.hasDesignModels,
  disabledReason: "请先生成设计模型",
};

export const WORKFLOW_MANIFEST: WorkflowStepDefinition[] = [
  {
    id: "requirements",
    label: "需求建模",
    runKind: "requirements",
    inputArtifactTypes: ["requirementText", "requirementRule"],
    outputArtifactTypes: ["requirementModel", "plantUml", "svg"],
    prerequisites: [hasRequirementText],
  },
  {
    id: "design",
    label: "软件设计",
    runKind: "design",
    inputArtifactTypes: ["requirementBaseline", "requirementModel"],
    outputArtifactTypes: ["designModel", "designPlantUml", "designSvg"],
    prerequisites: [hasRequirementModels],
  },
  
  {
    id: "requirements-document",
    label: "需求规格说明书",
    runKind: "document",
    inputArtifactTypes: ["requirementText", "requirementRule", "requirementModel"],
    outputArtifactTypes: ["requirementsSpec"],
    prerequisites: [hasRequirementText],
  },
  {
    id: "design-document",
    label: "软件设计说明书",
    runKind: "document",
    inputArtifactTypes: ["requirementText", "designModel"],
    outputArtifactTypes: ["softwareDesignSpec"],
    prerequisites: [hasDesignModels],
  },
];

export function getWorkflowDisabledReason(
  stepId: string,
  state: WorkflowPrerequisiteState,
) {
  const step = WORKFLOW_MANIFEST.find((item) => item.id === stepId);
  if (!step) {
    throw new Error(`Unknown workflow step: ${stepId}`);
  }

  return step.prerequisites.find((prerequisite) => !prerequisite.isMet(state))
    ?.disabledReason ?? null;
}
