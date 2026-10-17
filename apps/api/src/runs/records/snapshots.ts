// Creates initial snapshots for each run kind before pipelines start mutating them.
import { activeRequirementModels, designRunSnapshotSchema, documentRunSnapshotSchema, feasibilityRunSnapshotSchema, runSnapshotSchema, type DesignDiagramKind, type DesignRunSnapshot, type DiagramKind, type DiagramModelSpec, type DocumentKind, type DocumentRunSnapshot, type FeasibilityArtifactKind, type FeasibilityInputs, type FeasibilityRunSnapshot, type RequirementRule, type RequirementBaseline, type RunSnapshot, type ProviderSettingsInput, type ContextDiagramSpec, type ContextTraceRow, type FeasibilityImplementationPlan, type CoverageMatrix, type PlantUmlArtifact, type SvgArtifact, type TraceabilityMatrix, } from "@uml-platform/contracts";
import { buildEmptyRequirementBaseline, buildRequirementBaseline, } from "../baselines/requirement-baseline.js";
const DESIGN_DIAGRAM_ORDER: DesignDiagramKind[] = [
    "architecture",
    "sequence",
    "class",
    "navigation",
    "table",
    "component",
    "deployment",
];
function formatDocumentTimestamp(date = new Date()) {
    const pad = (value: number, length = 2) => String(value).padStart(length, "0");
    const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
    const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `${datePart}-${timePart}-${pad(date.getMilliseconds(), 3)}`;
}
export function createEmptySnapshot(runId: string, requirementText: string, selectedDiagrams: DiagramKind[], rules: RequirementRule[] = [], context: {
    requirementBaseline?: RequirementBaseline | null;
    models?: DiagramModelSpec[];
    requirementModelTraceability?: RunSnapshot["requirementModelTraceability"];
    analysisTargetUseCaseIds?: string[];
    requestedDiagrams?: DiagramKind[];
    dependencyDiagrams?: DiagramKind[];
    attachments?: RunSnapshot["attachments"];
    reasoning?: boolean;
    submittedRequirementText?: string;
    tokenUsage?: RunSnapshot["tokenUsage"];
} = {}): RunSnapshot {
    // Every model run snapshots current rules, including legacy inputs. Extraction
    // retains the previous baseline solely to reconcile identities after extraction.
    const requirementBaseline = rules.length > 0
        ? buildRequirementBaseline({ runId, requirementText, rules, previousBaseline: context.requirementBaseline })
        : context.requirementBaseline ?? buildEmptyRequirementBaseline({ runId });
    return runSnapshotSchema.parse({
        operationType: selectedDiagrams.length ? "requirement_modeling" : "requirement_extraction",
        outputManifest: [],
        runId,
        requirementText,
        attachments: context.attachments,
        reasoning: context.reasoning,
        submittedRequirementText: context.submittedRequirementText,
        tokenUsage: context.tokenUsage,
        selectedDiagrams,
        requestedDiagrams: context.requestedDiagrams,
        dependencyDiagrams: context.dependencyDiagrams,
        analysisTargetUseCaseIds: context.analysisTargetUseCaseIds ?? [],
        rules,
        requirementBaseline,
        coverageMatrix: null,
        traceabilityMatrix: null,
        models: activeRequirementModels(context.models ?? []),
        requirementModelTraceability: context.requirementModelTraceability ?? [],
        plantUml: [],
        svgArtifacts: [],
        diagramErrors: {},
        requirementTrace: [],
        currentStage: null,
        status: "queued",
        error: null,
    });
}
export function createEmptyDesignSnapshot(runId: string, input: {
    reasoning?: boolean;
    selectedDiagrams: DesignDiagramKind[];
    requirementBaseline: RequirementBaseline;
    requirementModels: DiagramModelSpec[];
    requirementModelTraceability: RunSnapshot["requirementModelTraceability"];
    requestedDiagrams?: DesignDiagramKind[];
    existingDesignModels?: DesignRunSnapshot["models"];
    existingDesignModelTraceability?: DesignRunSnapshot["designModelTraceability"];
    existingDesignPlantUml?: DesignRunSnapshot["plantUml"];
    existingDesignSvgArtifacts?: DesignRunSnapshot["svgArtifacts"];
}): DesignRunSnapshot {
    return designRunSnapshotSchema.parse({
        operationType: "design_modeling",
        reasoning: input.reasoning,
        outputManifest: [],
        runId,
        requirementText: "",
        selectedDiagrams: DESIGN_DIAGRAM_ORDER.filter((diagram) => input.selectedDiagrams.includes(diagram)),
        requestedDiagrams: input.requestedDiagrams
            ? DESIGN_DIAGRAM_ORDER.filter((diagram) => input.requestedDiagrams?.includes(diagram))
            : undefined,
        rules: [],
        requirementBaseline: input.requirementBaseline,
        coverageMatrix: null,
        traceabilityMatrix: null,
        requirementModels: activeRequirementModels(input.requirementModels),
        requirementModelTraceability: input.requirementModelTraceability,
        models: input.existingDesignModels ?? [],
        designModelTraceability: input.existingDesignModelTraceability ?? [],
        plantUml: input.existingDesignPlantUml ?? [],
        svgArtifacts: input.existingDesignSvgArtifacts ?? [],
        diagramErrors: {},
        currentStage: null,
        status: "queued",
        error: null,
    });
}
export function createEmptyDocumentSnapshot(runId: string, input: {
    reasoning?: boolean;
    documentKind: DocumentKind;
    requirementText: string;
    requirementBaseline?: RequirementBaseline | null;
    coverageMatrix?: CoverageMatrix | null;
    traceabilityMatrix?: TraceabilityMatrix | null;
} & Partial<import("@uml-platform/contracts").StartDocumentRunRequest>): DocumentRunSnapshot {
    const requirementBaseline = input.requirementBaseline ?? buildEmptyRequirementBaseline({ runId });
    const timestamp = formatDocumentTimestamp();
    const fileName = input.documentKind === "requirementsSpec"
        ? `需求规格说明书-${timestamp}.docx`
        : input.documentKind === "softwareDesignSpec"
            ? `软件设计说明书-${timestamp}.docx`
            : `可行性研究报告-${timestamp}.docx`;
    return documentRunSnapshotSchema.parse({
        operationType: "document_generation",
        // Legacy partial snapshots must not be upgraded to apparently complete inputs.
        replayInput: input.rules && input.requirementModels && input.designModels ? input : undefined,
        reasoning: input.reasoning,
        outputManifest: [],
        runId,
        documentKind: input.documentKind,
        requirementText: input.requirementText,
        requirementBaseline,
        coverageMatrix: input.coverageMatrix ?? null,
        traceabilityMatrix: input.traceabilityMatrix ?? null,
        documentId: null,
        sections: [],
        fileName,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteLength: 0,
        missingArtifacts: [],
        currentStage: null,
        status: "queued",
        error: null,
    });
}
export function createEmptyFeasibilitySnapshot(runId: string, input: {
    reasoning?: boolean;
    projectId: string;
    selectedArtifacts: FeasibilityArtifactKind[];
    providerSettings: ProviderSettingsInput;
    rules: RequirementRule[];
    requirementBaseline: RequirementBaseline | null;
    requirementSource?: FeasibilityRunSnapshot["requirementSource"];
    inputs: FeasibilityInputs;
    contextModel?: ContextDiagramSpec | null;
    contextTraceability?: ContextTraceRow[];
    contextPlantUml?: PlantUmlArtifact | null;
    contextSvg?: SvgArtifact | null;
    businessFlow?: FeasibilityRunSnapshot["businessFlow"];
    implementationPlan?: FeasibilityImplementationPlan | null;
    contextFingerprint?: string | null;
    implementationFingerprint?: string | null;
}): FeasibilityRunSnapshot {
    return feasibilityRunSnapshotSchema.parse({
        operationType: "feasibility_analysis",
        outputManifest: [],
        runId,
        ...input,
        contextModel: input.contextModel ?? null,
        contextTraceability: input.contextTraceability ?? [],
        contextPlantUml: input.contextPlantUml ?? null,
        contextSvg: input.contextSvg ?? null,
        implementationPlan: input.implementationPlan ?? null,
        contextFingerprint: input.contextFingerprint ?? null,
        implementationFingerprint: input.implementationFingerprint ?? null,
        requirementSource: input.requirementSource ?? null,
        generationDiagnostics: null,
        currentStage: null,
        status: "queued",
        error: null,
    });
}
