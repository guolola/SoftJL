// Owns run request, snapshot, event, and action contracts shared by API pipelines and web clients.
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "./generation-policy.js";
import { z } from "zod";
import { modelingAttachmentSchema } from "../modeling/modeling-attachments.js";
import { modelTokenUsageSchema } from "../modeling/model-catalog.js";
import { runOutputFields } from "./run-outputs.js";
import { diagramVisualReviewSchema } from "../modeling/visual-review.js";
import {
  designDiagramModelSpecSchema,
  designModelTraceabilityEntrySchema,
  designPlantUmlArtifactSchema,
  designSvgArtifactSchema,
  diagramModelSpecSchema,
  plantUmlArtifactSchema,
  requirementModelTraceabilityEntrySchema,
  svgArtifactSchema,
} from "../modeling/models.js";
import {
  coverageMatrixSchema,
  designDiagramKindSchema,
  diagramKindSchema,
  requirementBaselineSchema,
  requirementRulesSchema,
  traceabilityMatrixSchema,
  umlDiagramKindSchema,
} from "../requirements/requirements.js";

import {
  providerSettingsSchema,
} from "../provider-configs.js";
import {
  documentKindSchema,
  documentSectionSchema,
  documentStyleSettingsSchema,
} from "../documents.js";
import {
  feasibilityImplementationPlanSchema,
  feasibilityInputsSchema,
  feasibilityRunSnapshotSchema,
} from "../feasibility.js";

export const startRunRequestSchema = z.object({
  projectId: z.string().min(1).optional(),
  requirementText: z.string(),
  attachments: z.array(modelingAttachmentSchema).max(4).optional(),
  reasoning: z.boolean().optional(),
  selectedDiagrams: z.array(diagramKindSchema),
  requestedDiagrams: z.array(diagramKindSchema).optional(),
  dependencyDiagrams: z.array(diagramKindSchema).optional(),
  rules: requirementRulesSchema.default([]),
  requirementBaseline: requirementBaselineSchema.nullable().optional(),
  contextModels: z.array(diagramModelSpecSchema).default([]),
  contextRequirementModelTraceability: z
    .array(requirementModelTraceabilityEntrySchema)
    .default([]),
  analysisTargetUseCaseIds: z.array(z.string().min(1)).default([]),
  providerSettings: providerSettingsSchema.optional(),
}).refine(input => Boolean(input.requirementText.trim() || input.attachments?.length), { message: "请填写需求或添加附件", path: ["requirementText"] });
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const startRunCommandSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    requirementText: z.string().optional(),
    attachments: z.array(modelingAttachmentSchema).max(4).optional(),
    reasoning: z.boolean().optional(),
    selectedDiagrams: z.array(diagramKindSchema),
    requestedDiagrams: z.array(diagramKindSchema).optional(),
    dependencyDiagrams: z.array(diagramKindSchema).optional(),
    analysisTargetUseCaseIds: z.array(z.string().min(1)).default([]),
    providerSettings: providerSettingsSchema.optional(),
  })
  .strict();
export type StartRunCommand = z.infer<typeof startRunCommandSchema>;

// Whole-run consumption sums provider-reported calls across every stage, including repairs and failures.
export const runTokenConsumptionSchema = z.object({
  totalTokens: z.number().finite().nonnegative().nullable(),
  inputTokens: z.number().finite().nonnegative().nullable(),
  outputTokens: z.number().finite().nonnegative().nullable(),
  cachedInputTokens: z.number().finite().nonnegative().nullable(),
  reasoningTokens: z.number().finite().nonnegative().nullable(),
  calls: z.number().int().nonnegative(),
  unreportedCalls: z.number().int().nonnegative(),
});
export type RunTokenConsumption = z.infer<typeof runTokenConsumptionSchema>;

export const startDesignRunRequestSchema = z
  .object({
    sequenceTargetUseCaseIds: z.array(z.string().min(1)).optional(),
    reasoning: z.boolean().optional(),
    projectId: z.string().min(1).optional(),
    requirementBaseline: requirementBaselineSchema,
    requirementModels: z.array(diagramModelSpecSchema),
    requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema).min(1),
    selectedDiagrams: z.array(designDiagramKindSchema).min(1),
    requestedDiagrams: z.array(designDiagramKindSchema).optional(),
    existingDesignModels: z.array(designDiagramModelSpecSchema).default([]),
    existingDesignModelTraceability: z.array(designModelTraceabilityEntrySchema).default([]),
    existingDesignPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
    existingDesignSvgArtifacts: z.array(designSvgArtifactSchema).default([]),
    providerSettings: providerSettingsSchema.optional(),
  })
  .strict();
export type StartDesignRunRequest = z.infer<typeof startDesignRunRequestSchema>;

export const startDesignRunCommandSchema = z
  .object({
    reasoning: z.boolean().optional(),
    projectId: z.string().min(1).optional(),
    selectedDiagrams: z.array(designDiagramKindSchema).min(1),
    requestedDiagrams: z.array(designDiagramKindSchema).optional(),
    providerSettings: providerSettingsSchema.optional(),
  })
  .strict();
export type StartDesignRunCommand = z.infer<typeof startDesignRunCommandSchema>;


export const startDocumentRunRequestSchema = z.object({
  reasoning: z.boolean().optional(),
  projectId: z.string().min(1).optional(),
  documentKind: documentKindSchema,
  requirementText: z.string().min(1),
  requirementBaseline: requirementBaselineSchema.nullable().optional(),
  coverageMatrix: coverageMatrixSchema.nullable().optional(),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().optional(),
  rules: requirementRulesSchema.default([]),
  requirementModels: z.array(diagramModelSpecSchema).default([]),
  requirementModelTraceability: z
    .array(requirementModelTraceabilityEntrySchema)
    .default([]),
  requirementPlantUml: z.array(plantUmlArtifactSchema).default([]),
  requirementSvgArtifacts: z.array(svgArtifactSchema).default([]),
  designModels: z.array(designDiagramModelSpecSchema).default([]),
  designModelTraceability: z.array(designModelTraceabilityEntrySchema).default([]),
  designPlantUml: z.array(designPlantUmlArtifactSchema).default([]),
  designSvgArtifacts: z.array(designSvgArtifactSchema).default([]),
  feasibilityImplementationPlan: feasibilityImplementationPlanSchema.nullable().default(null),
  feasibilityInputs: feasibilityInputsSchema.default({}),
  providerSettings: providerSettingsSchema.optional(),
  useAiText: z.boolean().default(true),
  documentStyle: documentStyleSettingsSchema.optional(),
});
export type StartDocumentRunRequest = z.infer<typeof startDocumentRunRequestSchema>;

export const startDocumentRunCommandSchema = z
  .object({
    reasoning: z.boolean().optional(),
    projectId: z.string().min(1).optional(),
    documentKind: documentKindSchema,
    providerSettings: providerSettingsSchema.optional(),
    useAiText: z.boolean().default(true),
    documentStyle: documentStyleSettingsSchema.optional(),
  })
  .strict();
export type StartDocumentRunCommand = z.infer<typeof startDocumentRunCommandSchema>;

export const runStageSchema = z.enum([
  "extract_rules",
  "generate_models",
  "generate_design_sequence",
  "generate_design_models",
  "generate_tests",


  "generate_document_text",
  "render_document_file",
  "generate_plantuml",
  "render_svg",
  "verify_diagram_visual",
  "generate_context",
  "generate_business_flow",
  "render_business_flow",
  "render_context",
  "generate_implementation",
]);
export type RunStage = z.infer<typeof runStageSchema>;

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runErrorCodeSchema = z.enum([
  "USER_ENTITLEMENT_REQUIRED",
  "USER_ENTITLEMENT_NEGATIVE_BALANCE",
  "PLATFORM_PROVIDER_BALANCE_INSUFFICIENT",
  "PLATFORM_PROVIDER_AUTH_FAILED",
  "PLATFORM_PROVIDER_RATE_LIMITED",
  "PLATFORM_PROVIDER_UNAVAILABLE",
  "PLATFORM_PROVIDER_TIMEOUT",
  "RUN_MODEL_OUTPUT_EMPTY",
  "RUN_REQUIREMENT_INPUT_UNSAFE",
  "RUN_REQUIREMENT_INPUT_IRRELEVANT",
  "RUN_REQUIREMENT_SCREENING_FAILED",
  "RUN_REQUIREMENT_RULES_EMPTY",
  "RUN_STRUCTURED_OUTPUT_INVALID",
  "RUN_DEPENDENCY_MISSING",
  "RUN_CONTEXT_LIMIT_EXCEEDED",
  "RUN_RENDER_FAILED",
  "RUN_CANCELLED",
  "RUN_INTERNAL_ERROR",
]);
export type RunErrorCode = z.infer<typeof runErrorCodeSchema>;

export const runErrorCategorySchema = z.enum([
  "user_entitlement",
  "platform_provider",
  "generation",
  "render",
  "access",
  "internal",
]);
export type RunErrorCategory = z.infer<typeof runErrorCategorySchema>;

export const runErrorSchema = z.object({
  code: runErrorCodeSchema,
  message: z.string().min(1),
  category: runErrorCategorySchema,
  retryable: z.boolean(),
  params: z.record(
    z.string().min(1),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ).optional(),
  details: z.record(z.string().min(1), z.unknown()).optional(),
});
export type RunError = z.infer<typeof runErrorSchema>;

export const diagramErrorSchema = z.object({
  stage: runStageSchema,
  error: runErrorSchema,
});
export type DiagramError = z.infer<typeof diagramErrorSchema>;

export const designTraceEntrySchema = z.object({
  stage: z.enum([
    "generate_design_sequence",
    "generate_design_models",
    "generate_plantuml",
    "render_svg",
  ]),
  attempt: z.number().int().min(1),
  kind: z.enum([
    "llm_output",
    "parse_error",
    "parsed_model",
    "plantuml_source",
    "render_error",
    "repair_output",
    "repaired_plantuml",
  ]),
  diagramKind: designDiagramKindSchema.optional(),
  rawOutput: z.string().optional(),
  rawOutputTruncated: z.boolean().optional(),
  rawOutputOriginalLength: z.number().int().min(0).optional(),
  parsedData: z.unknown().optional(),
  plantUmlSource: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().min(1),
});
export type DesignTraceEntry = z.infer<typeof designTraceEntrySchema>;

export const requirementTraceEntrySchema = z.object({
  stage: z.enum([
    "generate_models",
    "generate_plantuml",
    "render_svg",
  ]),
  attempt: z.number().int().min(1),
  kind: z.enum([
    "llm_output",
    "parse_error",
    "parsed_model",
    "plantuml_source",
    "render_error",
    "repair_output",
    "repaired_plantuml",
  ]),
  diagramKind: diagramKindSchema.optional(),
  rawOutput: z.string().optional(),
  rawOutputTruncated: z.boolean().optional(),
  rawOutputOriginalLength: z.number().int().min(0).optional(),
  parsedData: z.unknown().optional(),
  plantUmlSource: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string().min(1),
});
export type RequirementTraceEntry = z.infer<typeof requirementTraceEntrySchema>;


export const requirementInputScreeningSchema = z.object({
  ignoredSpans: z.array(z.object({
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(0),
    reason: z.literal("irrelevant"),
  })),
});
export type RequirementInputScreening = z.infer<typeof requirementInputScreeningSchema>;

// Quick turns share the durable run lifecycle, but retain only their own safe output projection.
const standardRunRecordSchema = z.object({
  operation: z.string().min(1),
  providerConfigId: z.string().min(1), model: z.string().min(1),
  baseline: z.record(z.string()),
  artifacts: z.array(z.object({
    id: z.string(), type: z.string(), title: z.string(),
    diagramKind: z.string().optional(), modelId: z.string().optional(),
    sourceLength: z.number().nonnegative().optional(),
    previewAvailable: z.boolean(), svg: z.string().optional(),
  })),
});

export const runSnapshotSchema = z.object({
  standardRun: standardRunRecordSchema.optional(),
  ...runOutputFields,
  runId: z.string().min(1),
  requirementText: z.string(),
  // Preserve submitted sources for inspection and replay; requirementText becomes the accepted combined source.
  submittedRequirementText: z.string().optional(),
  attachments: z.array(modelingAttachmentSchema).max(4).optional(),
  reasoning: z.boolean().optional(),
  tokenUsage: modelTokenUsageSchema.optional(),
  inputScreening: requirementInputScreeningSchema.optional(),
  selectedDiagrams: z.array(diagramKindSchema),
  requestedDiagrams: z.array(diagramKindSchema).optional(),
  dependencyDiagrams: z.array(diagramKindSchema).optional(),
  analysisTargetUseCaseIds: z.array(z.string().min(1)).default([]),
  rules: requirementRulesSchema,
  requirementBaseline: requirementBaselineSchema.nullable().default(null),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  models: z.array(diagramModelSpecSchema),
  requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema),
  plantUml: z.array(plantUmlArtifactSchema),
  svgArtifacts: z.array(svgArtifactSchema),
  visualReviews: z.record(z.string().min(1), diagramVisualReviewSchema).default({}),
  // Analysis generation records failures by current model ID, including analysis:<use-case-id>.
  diagramErrors: z.record(z.string().min(1), diagramErrorSchema).default({}),
  requirementTrace: z.array(requirementTraceEntrySchema).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  error: runErrorSchema.nullable(),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

export const designRunSnapshotSchema = z.object({
  sequenceTargetUseCaseIds: z.array(z.string().min(1)).optional(),
  ...runOutputFields,
  reasoning: z.boolean().optional(),
  generationBaseDesignFingerprints: z.record(z.string()).optional(),
  runId: z.string().min(1),
  requirementText: z.string(),
  selectedDiagrams: z.array(designDiagramKindSchema),
  requestedDiagrams: z.array(designDiagramKindSchema).optional(),
  rules: requirementRulesSchema,
  requirementBaseline: requirementBaselineSchema.nullable().default(null),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  requirementModels: z.array(diagramModelSpecSchema),
  requirementModelTraceability: z.array(requirementModelTraceabilityEntrySchema),
  models: z.array(designDiagramModelSpecSchema),
  designModelTraceability: z.array(designModelTraceabilityEntrySchema),
  plantUml: z.array(designPlantUmlArtifactSchema),
  svgArtifacts: z.array(designSvgArtifactSchema),
  visualReviews: z.record(z.string().min(1), diagramVisualReviewSchema).default({}),
  diagramErrors: z.record(z.string().min(1), diagramErrorSchema).default({}),
  designTrace: z.array(designTraceEntrySchema).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  error: runErrorSchema.nullable(),
});
export type DesignRunSnapshot = z.infer<typeof designRunSnapshotSchema>;


export const documentRunSnapshotSchema = z.object({
  ...runOutputFields,
  // Immutable original request for replay; credentials stay in provider storage.
  replayInput: startDocumentRunRequestSchema.omit({ providerSettings: true }).optional(),
  reasoning: z.boolean().optional(),
  runId: z.string().min(1),
  documentKind: documentKindSchema,
  requirementText: z.string(),
  requirementBaseline: requirementBaselineSchema.nullable().default(null),
  coverageMatrix: coverageMatrixSchema.nullable().default(null),
  traceabilityMatrix: traceabilityMatrixSchema.nullable().default(null),
  feasibilityImplementationPlan: feasibilityImplementationPlanSchema.nullable().default(null),
  feasibilityInputs: feasibilityInputsSchema.default({}),
  documentId: z.string().min(1).nullable().default(null),
  sections: z.array(documentSectionSchema).default([]),
  fileName: z.string().min(1).nullable(),
  mimeType: z.string().min(1).nullable(),
  byteLength: z.number().int().min(0).default(0),
  missingArtifacts: z.array(z.string()).default([]),
  currentStage: runStageSchema.nullable(),
  status: runStatusSchema,
  error: runErrorSchema.nullable(),
});
export type DocumentRunSnapshot = z.infer<typeof documentRunSnapshotSchema>;

export const queuedRunEventSchema = z.object({
  type: z.literal("queued"),
  queuePosition: z.number().int().min(0).optional(),
  queueAhead: z.number().int().min(0).optional(),
  waitMs: z.number().int().min(0).optional(),
  estimatedWaitMs: z.number().int().min(0).optional(),
  queueReason: z.enum(["global", "provider", "project", "user", "run"]).optional(),
});

export const stageStartedRunEventSchema = z.object({
  type: z.literal("stage_started"),
  stage: runStageSchema,
});

// A pipeline boundary, not the end of an individual parallel model call.
export const stageFinishedRunEventSchema = z.object({
  type: z.literal("stage_finished"),
  stage: runStageSchema,
  status: z.enum(["completed", "failed", "cancelled", "pending_review"]),
});

export const llmChunkRunEventSchema = z.object({
  type: z.literal("llm_chunk"),
  stage: runStageSchema,
  chunk: z.string(),
});

export const stageProgressRunEventSchema = z.object({
  type: z.literal("stage_progress"),
  stage: runStageSchema,
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  error: runErrorSchema.optional(),
  diagramKind: umlDiagramKindSchema.optional(),
  modelId: z.string().min(1).optional(),
  subtaskId: z.string().min(1).optional(),
  subtaskLabel: z.string().min(1).optional(),
  subtaskStatus: z
    .enum([
      "queued",
      "running",
      "repairing",
      "rendering",
      "completed",
      "failed",
      "pending_review",
    ])
    .optional(),
  parallelGroup: z.string().min(1).optional(),
  queuePosition: z.number().int().min(0).optional(),
  queueAhead: z.number().int().min(0).optional(),
  waitMs: z.number().int().min(0).optional(),
  estimatedWaitMs: z.number().int().min(0).optional(),
  queueReason: z.enum(["global", "provider", "project", "user", "run"]).optional(),
});

export const artifactReadyRunEventSchema = z.object({
  type: z.literal("artifact_ready"),
  stage: runStageSchema,
  artifactKind: z.enum([
    "requirementBaseline",
    "coverageMatrix",
    "traceabilityMatrix",
    "rules",
    "model",
    "plantuml",
    "svg",
    "testCases",


    "document",
    "feasibilityContext",
    "feasibilityBusinessFlow",
    "feasibilityImplementation",
  ]),
  diagramKind: umlDiagramKindSchema.optional(),
  modelId: z.string().min(1).optional(),
  subtaskId: z.string().min(1).optional(),
  subtaskLabel: z.string().min(1).optional(),
  subtaskStatus: z
    .enum([
      "queued",
      "running",
      "repairing",
      "rendering",
      "completed",
      "failed",
      "pending_review",
    ])
    .optional(),
  parallelGroup: z.string().min(1).optional(),


  coverageMatrix: coverageMatrixSchema.optional(),
  traceabilityMatrix: traceabilityMatrixSchema.optional(),
});


export const completedRunEventSchema: z.ZodObject<{
  type: z.ZodLiteral<"completed">;
  previewCount: z.ZodOptional<z.ZodNumber>;
  snapshot: z.ZodUnion<
    [
      typeof runSnapshotSchema,
      typeof designRunSnapshotSchema,
      typeof documentRunSnapshotSchema,
      typeof feasibilityRunSnapshotSchema,
    ]
  >;
}> = z.object({
  type: z.literal("completed"),
  // Progress-only transcripts omit artifact bodies while preserving the actual preview total.
  previewCount: z.number().int().min(0).optional(),
  snapshot: z.union([
    runSnapshotSchema,
    designRunSnapshotSchema,
    documentRunSnapshotSchema,
    feasibilityRunSnapshotSchema,
  ]),
});

export const failedRunEventSchema = z.object({
  type: z.literal("failed"),
  stage: runStageSchema.optional(),
  error: runErrorSchema,
});

export const cancelledRunEventSchema = z.object({
  type: z.literal("cancelled"),
  stage: runStageSchema.optional(),
  message: z.string().min(1),
});

export const runActionSchema = z.enum(["cancel", "retry", "rerun"]);
export type RunAction = z.infer<typeof runActionSchema>;

export const runActionRunEventSchema = z.object({
  type: z.literal("run_action"),
  action: runActionSchema,
  sourceRunId: z.string().min(1),
  newRunId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});

// Images belong to the exact model call that consumed them, including during replay.
export const runInputImageSchema = z.object({
  url: z.string().min(1),
  caption: z.string().optional(),
});
export type RunInputImage = z.infer<typeof runInputImageSchema>;

// Size diagnostics contain counts only; provider token usage remains the billing source of truth.
export const runInputMetricsSchema = z.object({
  unit: z.literal("utf16-characters"),
  messages: z.number().int().nonnegative(),
  responseFormat: z.number().int().nonnegative(),
  sections: z.record(z.number().int().nonnegative()),
  repair: z.object({ targetId: z.string(), mode: z.string(), baseFingerprint: z.string(), paths: z.array(z.string()), round: z.number().int().min(1).max(MAX_GENERATION_REPAIR_ATTEMPTS), reason: z.string().optional() }).optional(),
});
export type RunInputMetrics = z.infer<typeof runInputMetricsSchema>;

// User-visible execution records are separate from bounded technical diagnostics.
export const runActivityEventSchema = z.object({
  type: z.literal("run_activity"),
  eventId: z.string().min(1),
  createdAt: z.string().datetime(),
  runId: z.string().min(1),
  stage: runStageSchema,
  callId: z.string().min(1),
  modelId: z.string().optional(),
  operation: z.enum(["structure_check", "visual_check", "model_repair", "render_repair"]).optional(),
  round: z.number().int().min(0).max(MAX_GENERATION_REPAIR_ATTEMPTS).optional(),
  subtaskId: z.string().optional(),
  subtaskLabel: z.string().optional(),
  phase: z.enum(["started", "output", "thinking", "reasoning", "summary", "completed", "failed"]),
  format: z.enum(["text", "technical"]).default("technical"),
  text: z.string().optional(),
  inputImages: z.array(runInputImageSchema).optional(),
  inputMetrics: runInputMetricsSchema.optional(),
});
export type RunActivityEvent = z.infer<typeof runActivityEventSchema>;

// Pipelines supply new event inputs; publication assigns the required replay identity once.
export type RunEventInput = { eventId?: string; createdAt?: string; sequence?: number } & (
  | RunActivityEvent
  | z.infer<typeof queuedRunEventSchema>
  | z.infer<typeof stageStartedRunEventSchema>
  | z.infer<typeof stageFinishedRunEventSchema>
  | z.infer<typeof llmChunkRunEventSchema>
  | z.infer<typeof stageProgressRunEventSchema>
  | z.infer<typeof artifactReadyRunEventSchema>
  |  z.infer<typeof completedRunEventSchema>
  | z.infer<typeof failedRunEventSchema>
  | z.infer<typeof cancelledRunEventSchema>
  | z.infer<typeof runActionRunEventSchema>);

export const runEventMetadataSchema = z.object({
  eventId: z.string().min(1),
  createdAt: z.string().datetime(),
  sequence: z.number().int().positive().optional(),
});
export type RunEvent = RunEventInput & z.infer<typeof runEventMetadataSchema>;

export const runEventSchema: z.ZodType<RunEvent, z.ZodTypeDef, unknown> = z.discriminatedUnion("type", [
  runActivityEventSchema,
  queuedRunEventSchema,
  stageStartedRunEventSchema,
  stageFinishedRunEventSchema,
  llmChunkRunEventSchema,
  stageProgressRunEventSchema,
  artifactReadyRunEventSchema,

  completedRunEventSchema,
  failedRunEventSchema,
  cancelledRunEventSchema,
  runActionRunEventSchema,
]).and(runEventMetadataSchema);

export const runActionResultSchema = z.object({
  action: runActionSchema,
  sourceRunId: z.string().min(1),
  runId: z.string().min(1),
  status: runStatusSchema,
});
export type RunActionResult = z.infer<typeof runActionResultSchema>;

export const startRunResponseSchema = z.object({
  runId: z.string().min(1),
});
export type StartRunResponse = z.infer<typeof startRunResponseSchema>;
export const startDesignRunResponseSchema = startRunResponseSchema;
export type StartDesignRunResponse = z.infer<typeof startDesignRunResponseSchema>;


export const startDocumentRunResponseSchema = startRunResponseSchema;
export type StartDocumentRunResponse = z.infer<typeof startDocumentRunResponseSchema>;
