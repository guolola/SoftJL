// Builds complete contract fixtures so each test only specifies the state it exercises.
import { feasibilityInputsSchema } from "@uml-platform/contracts";
import type {
  DesignRunSnapshot,
  DocumentRunSnapshot,
  RenderSvgResponse,
  RunSnapshot,
} from "@uml-platform/contracts";

export function createRenderMeta(
  overrides: Partial<RenderSvgResponse["renderMeta"]> = {},
): RenderSvgResponse["renderMeta"] {
  return {
    engine: "plantuml",
    generatedAt: "2026-06-05T00:00:00.000Z",
    sourceLength: 0,
    durationMs: 0,
    ...overrides,
  };
}

export function createRunSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: "run-test",
    requirementText: "",
    selectedDiagrams: [],
    analysisTargetUseCaseIds: [],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    models: [],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    visualReviews: {},
    currentStage: "render_svg",
    status: "completed",
    error: null,
    ...overrides,
  };
}

export function createDesignRunSnapshot(
  overrides: Partial<DesignRunSnapshot> = {},
): DesignRunSnapshot {
  return {
    runId: "design-run-test",
    requirementText: "",
    selectedDiagrams: [],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    requirementModels: [],
    requirementModelTraceability: [],
    models: [],
    designModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [],
    visualReviews: {},
    currentStage: "render_svg",
    status: "completed",
    error: null,
    ...overrides,
  };
}

export function createDocumentRunSnapshot(
  overrides: Partial<DocumentRunSnapshot> = {},
): DocumentRunSnapshot {
  return {
    runId: "document-run-test",
    documentKind: "requirementsSpec",
    requirementText: "",
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    feasibilityImplementationPlan: null,
    feasibilityInputs: feasibilityInputsSchema.parse({}),
    documentId: null,
    sections: [],
    fileName: null,
    mimeType: null,
    byteLength: 0,
    missingArtifacts: [],
    currentStage: "render_document_file",
    status: "completed",
    error: null,
    ...overrides,
  };
}
