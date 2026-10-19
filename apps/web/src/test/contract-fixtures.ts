// Builds complete contract fixtures so each test only specifies the state it exercises.
import { requirementRuleFacts } from "@uml-platform/contracts";
import { createRequirementBaselineSnapshot, feasibilityInputsSchema, requirementRulesSchema, snapshotInputFingerprint } from "@uml-platform/contracts";
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
  const snapshot: RunSnapshot = {
    operationType: overrides.selectedDiagrams?.length ? "requirement_modeling" : "requirement_extraction",
    outputManifest: (overrides.models ?? []).filter(model => overrides.selectedDiagrams?.includes(model.diagramKind)).map(model => ({ kind: "model" as const, id: model.modelId ?? model.diagramKind, diagramKind: model.diagramKind })),
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
  if (snapshot.requirementBaseline && snapshotInputFingerprint(requirementRulesSchema.parse(snapshot.requirementBaseline.rules.map(requirementRuleFacts))) !== snapshotInputFingerprint(requirementRulesSchema.parse(snapshot.rules))) {
    const baseline = snapshot.requirementBaseline;
    snapshot.requirementBaseline = { ...createRequirementBaselineSnapshot({
      runId: baseline.runId, requirementText: snapshot.requirementText, rules: snapshot.rules,
      previousBaseline: baseline, createdAt: baseline.createdAt,
    }), qualityReport: baseline.qualityReport };
  }
  return snapshot;
}

export function createDesignRunSnapshot(
  overrides: Partial<DesignRunSnapshot> = {},
): DesignRunSnapshot {
  const snapshot: DesignRunSnapshot = {
    operationType: "design_modeling",
    outputManifest: (overrides.models ?? []).filter(model => overrides.selectedDiagrams?.includes(model.diagramKind)).map(model => ({ kind: "model" as const, id: model.modelId ?? model.diagramKind, diagramKind: model.diagramKind })),
    runId: "design-run-test",
    requirementText: "",
    selectedDiagrams: [],
    rules: requirementRulesSchema.parse(overrides.requirementBaseline?.rules.map(requirementRuleFacts) ?? []),
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
  if (snapshot.requirementBaseline && snapshotInputFingerprint(requirementRulesSchema.parse(snapshot.requirementBaseline.rules.map(requirementRuleFacts))) !== snapshotInputFingerprint(requirementRulesSchema.parse(snapshot.rules))) {
    const baseline = snapshot.requirementBaseline;
    snapshot.requirementBaseline = { ...createRequirementBaselineSnapshot({
      runId: baseline.runId, requirementText: snapshot.requirementText, rules: snapshot.rules,
      previousBaseline: baseline, createdAt: baseline.createdAt,
    }), qualityReport: baseline.qualityReport };
  }
  return snapshot;
}

export function createDocumentRunSnapshot(
  overrides: Partial<DocumentRunSnapshot> = {},
): DocumentRunSnapshot {
  return {
    operationType: "document_generation",
    outputManifest: [],
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
