// Builds typed run-start payloads from workspace state and persisted user model settings.
import type {
  GenerationExecutionMode,
  CoverageMatrix,
  FeasibilityArtifactKind,
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DesignPlantUmlArtifact,
  DesignSvgArtifact,
  DiagramModelSpec,
  DocumentKind,
  DocumentStyleSettings,
  PlantUmlArtifact,
  ProviderSettings,
  RequirementBaseline,
  RequirementModelTraceabilityEntry,
  SvgArtifact,
  TraceabilityMatrix,
} from "@uml-platform/contracts";
import type { DesignDiagramType, DiagramType } from "../../entities/diagram/model";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import { loadUserSettings } from "../../shared/lib/user-settings";
import { generationModelBlockedReason } from "../../shared/lib/generation-model";

export interface ProviderSettingsInput {
  providerConfigId: string;
  model: ProviderSettings["model"];
}

export interface StartRunInput {
  requirementText: string;
  selectedDiagrams: DiagramType[];
  requestedDiagrams?: DiagramType[];
  dependencyDiagrams?: DiagramType[];
  rules: RequirementRule[];
  contextModels: DiagramModelSpec[];
  contextRequirementModelTraceability: RequirementModelTraceabilityEntry[];
  analysisTargetUseCaseIds?: string[];
  providerSettings: ProviderSettingsInput;
}

export interface StartDesignRunInput {
  requirementBaseline: RequirementBaseline;
  requirementModels: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  selectedDiagrams: DesignDiagramType[];
  requestedDiagrams?: DesignDiagramType[];
  existingDesignModels: DesignDiagramModelSpec[];
  existingDesignModelTraceability: DesignModelTraceabilityEntry[];
  existingDesignPlantUml: DesignPlantUmlArtifact[];
  existingDesignSvgArtifacts: DesignSvgArtifact[];
  providerSettings: ProviderSettingsInput;
}



export interface StartDocumentRunInput {
  documentKind: DocumentKind;
  requirementText: string;
  coverageMatrix?: CoverageMatrix | null;
  traceabilityMatrix?: TraceabilityMatrix | null;
  rules: RequirementRule[];
  requirementModels: DiagramModelSpec[];
  requirementModelTraceability: RequirementModelTraceabilityEntry[];
  requirementPlantUml: PlantUmlArtifact[];
  requirementSvgArtifacts: SvgArtifact[];
  designModels: DesignDiagramModelSpec[];
  designPlantUml: DesignPlantUmlArtifact[];
  designSvgArtifacts: DesignSvgArtifact[];
  providerSettings: ProviderSettingsInput;
  useAiText: boolean;
  documentStyle?: DocumentStyleSettings;
}

export interface StartFeasibilityRunInput {
  selectedArtifacts: FeasibilityArtifactKind[];
  providerSettings: ProviderSettingsInput;
}

export function createStartRunInput(
  requirementText: string,
  selectedDiagrams: DiagramType[],
  rules: RequirementRule[] = [],
  contextModels: DiagramModelSpec[] = [],
  contextRequirementModelTraceability: RequirementModelTraceabilityEntry[] = [],
  analysisTargetUseCaseIds: string[] = [],
  executionMode: GenerationExecutionMode = "provider",
): StartRunInput {
  const providerSettings = createProviderSettingsInput(executionMode);
  return {
    requirementText,
    selectedDiagrams,
    requestedDiagrams: selectedDiagrams,
    dependencyDiagrams: [],
    rules,
    contextModels,
    contextRequirementModelTraceability,
    analysisTargetUseCaseIds,
    providerSettings,
  };
}

export function createProviderSettingsInput(executionMode: GenerationExecutionMode = "provider"): ProviderSettingsInput {
  // Only the project access response enables fixed artifacts; settings never imply demo mode.
  if (executionMode === "offline-demo") {
    return { providerConfigId: "offline-demo", model: "offline-demo-fixed-artifacts" };
  }
  const settings = loadUserSettings();
  const blockedReason = generationModelBlockedReason(executionMode, settings);
  if (blockedReason) throw new Error(blockedReason);
  const providerConfigId = settings.providerConfigId.trim();
  const model = settings.defaultModel.trim();

  return {
    providerConfigId,
    model,
  };
}

export function createStartFeasibilityRunInput(
  selectedArtifacts: FeasibilityArtifactKind[],
  executionMode: GenerationExecutionMode = "provider",
): StartFeasibilityRunInput {
  return {
    selectedArtifacts: (["context", "business-flow", "implementation"] as const).filter((artifact) =>
      selectedArtifacts.includes(artifact),
    ),
    providerSettings: createProviderSettingsInput(executionMode),
  };
}

export function createStartDesignRunInput(
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  requirementModelTraceability: RequirementModelTraceabilityEntry[],
  selectedDiagrams: DesignDiagramType[],
  requestedDiagrams: DesignDiagramType[] = selectedDiagrams,
  existingDesignModels: DesignDiagramModelSpec[] = [],
  existingDesignModelTraceability: DesignModelTraceabilityEntry[] = [],
  existingDesignPlantUml: DesignPlantUmlArtifact[] = [],
  existingDesignSvgArtifacts: DesignSvgArtifact[] = [],
  executionMode: GenerationExecutionMode = "provider",
): StartDesignRunInput {
  return {
    requirementBaseline,
    requirementModels,
    requirementModelTraceability,
    selectedDiagrams,
    requestedDiagrams,
    existingDesignModels,
    existingDesignModelTraceability,
    existingDesignPlantUml,
    existingDesignSvgArtifacts,
    providerSettings: createProviderSettingsInput(executionMode),
  };
}



export function createStartDocumentRunInput(
  documentKind: DocumentKind,
  requirementText: string,
  rules: RequirementRule[],
  requirementModels: DiagramModelSpec[],
  requirementModelTraceability: RequirementModelTraceabilityEntry[],
  requirementPlantUml: PlantUmlArtifact[],
  requirementSvgArtifacts: SvgArtifact[],
  designModels: DesignDiagramModelSpec[],
  designPlantUml: DesignPlantUmlArtifact[],
  designSvgArtifacts: DesignSvgArtifact[],
  documentStyle?: DocumentStyleSettings,
  coverageMatrix: CoverageMatrix | null = null,
  traceabilityMatrix: TraceabilityMatrix | null = null,
  executionMode: GenerationExecutionMode = "provider",
): StartDocumentRunInput {
  return {
    documentKind,
    requirementText,
    coverageMatrix,
    traceabilityMatrix,
    rules,
    requirementModels,
    requirementModelTraceability,
    requirementPlantUml,
    requirementSvgArtifacts,
    designModels,
    designPlantUml,
    designSvgArtifacts,
    providerSettings: createProviderSettingsInput(executionMode),
    useAiText: true,
    documentStyle,
  };
}
