// Orchestrates design-model generation, PlantUML, and SVG rendering for design runs.
import { mapWithConcurrency, useCaseModelForSingleUseCase } from "./shared/generation-helpers.js";

import { createStageLifecycle } from "./shared/stage-lifecycle.js";
import {
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  diagramErrorSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignModelTraceabilityEntry,
  type DesignPlantUmlArtifact,
  type DesignRunSnapshot,
  type DesignSvgArtifact,
  type DiagramError,
  type DiagramKind,
  type DiagramModelSpec,
  type ModelElementRef,
  type ProviderSettings,
  type RequirementBaseline,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateDesignTraceabilityPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateDesignSequencePrompt,
  buildRepairDesignTraceabilityPrompt,
  buildRepairDesignModelsPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../llm.js";
import { type RenderClient } from "../../adapters/render/render-client.js";
import {
  getGenerateDesignModelsResponseFormat,
  getGenerateDesignTraceabilityResponseFormat,
} from "../../adapters/llm/response-formats/index.js";
import {
  parseDesignDiagramModelsOnly,
  parseDesignDiagramModelsResult,
  parseDesignTraceabilityCoverageForSources,
} from "../../normalizers/design/design-model-normalizer.js";
import {
  collectModelRefs,
  deriveDesignRelationshipTraceability,
  deriveUpstreamDesignRefsFromTraceability,
  formatTraceabilityMissingRefs,
  mergeDesignTraceability,
  normalizeDesignTraceabilityForSources,
  normalizeDesignTraceabilityWithCoverage,
} from "../../normalizers/traceability/traceability-normalizer.js";
import { formatParseError } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { readDiagramReviewCounters } from "../records/diagram-review-record.js";
import {
  isRunCancelled,
  RunCancelledError,
  throwIfRunCancelled,
} from "../records/run-cancellation.js";
import { DiagramReviewRenderError, reviewRenderedArtifact } from "./render/review-rendered-artifact.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import { withConversationBranch } from "./shared/conversation-context.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createMessages } from "./shared/llm-messages.js";
import {
  assertRequirementBaselineAllowsDownstream,
} from "../baselines/requirement-baseline.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import {
  withModelTaskTimeout,
  type ModelTaskActivity,
} from "./shared/model-task-timeout.js";
import { createRunLlmChunkHandlers } from "./shared/llm-chunk-events.js";
import { appendDesignTrace } from "./shared/trace-events.js";
import {
  createRunError,
  isPlatformProviderRunError,
  normalizeRunError,
  throwRunError,
} from "./shared/errors.js";
import {
  assertTrustedChainAllowsCompletion,
  buildDesignStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const MAX_MODEL_REPAIR_ATTEMPTS = 2;
// Each sequence model already has two structured repair rounds; do not multiply them in an outer retry loop.
const MAX_SEQUENCE_USE_CASE_RETRIES = 0;
const DESIGN_TRACEABILITY_BATCH_SIZE = 24;
const DEFAULT_DESIGN_SEQUENCE_CONCURRENCY = 2;
const DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TASK_MAX_RUNTIME_MS = 1_200_000;
const LLM_CHUNK_EVENT_LIMIT = 240;
const LLM_CHUNK_CHAR_LIMIT = 24000;
const TRACE_RAW_OUTPUT_LIMIT = 20000;

const DESIGN_DIAGRAM_LABELS: Record<DesignDiagramKind, string> = {
  architecture: "总体架构图",
  sequence: "用例实现设计",
  class: "设计类图",
  navigation: "页面导航图",
  component: "组件（构件）关系",
  deployment: "部署设计",
  table: "数据库设计",
};

function designDiagramKindFromErrorId(id: string): DesignDiagramKind | null {
  const [rawKind] = id.split(":");
  if (
    rawKind === "sequence" ||
    rawKind === "architecture" ||
    rawKind === "class" ||
    rawKind === "navigation" ||
    rawKind === "component" ||
    rawKind === "deployment" ||
    rawKind === "table"
  ) {
    return rawKind;
  }
  return null;
}

function selectedDesignDiagramFailures(
  diagramErrors: Record<string, DiagramError>,
  selectedDiagrams: DesignDiagramKind[],
) {
  const selected = new Set(selectedDiagrams);
  return Object.entries(diagramErrors).filter(([id]) => {
    const kind = designDiagramKindFromErrorId(id);
    return Boolean(kind && selected.has(kind));
  });
}

function hasWholeDesignDiagramError(
  diagramErrors: Record<string, DiagramError>,
  diagram: DesignDiagramKind,
) {
  return Object.keys(diagramErrors).some((id) => {
    if (id === diagram) return true;
    if (id.startsWith(`${diagram}:`)) return false;
    return designDiagramKindFromErrorId(id) === diagram;
  });
}

function successfulSelectedDesignDiagrams(input: {
  selectedDiagrams: DesignDiagramKind[];
  svgArtifacts: DesignSvgArtifact[];
  diagramErrors: Record<string, DiagramError>;
}) {
  const selected = new Set(input.selectedDiagrams);
  const successful = new Set<DesignDiagramKind>();
  for (const artifact of input.svgArtifacts) {
    if (!selected.has(artifact.diagramKind)) continue;
    if (hasWholeDesignDiagramError(input.diagramErrors, artifact.diagramKind)) {
      continue;
    }
    const artifactId = artifact.modelId ?? artifact.diagramKind;
    if (input.diagramErrors[artifactId]) continue;
    successful.add(artifact.diagramKind);
  }
  return Array.from(successful);
}

function summarizeSelectedDesignDiagramFailures(
  failures: Array<[string, DiagramError]>,
) {
  return failures
    .map(([id, error]) => {
      const kind = designDiagramKindFromErrorId(id);
      const label = kind ? designDiagramLabel(kind) : id;
      return `${label}：${error.error.message ?? "生成失败"}`;
    })
    .join("；");
}

function firstSelectedPlatformProviderFailure(
  failures: Array<[string, DiagramError]>,
) {
  const failure = failures.find(([, error]) =>
    isPlatformProviderRunError(error.error),
  );
  return failure?.[1].error ?? null;
}

const REQUIREMENT_DIAGRAM_LABELS: Record<DiagramKind, string> = {
  context: "系统上下文图（系统环境图）",
  function: "功能结构图",
  usecase: "用例模型",
  class: "领域概念模型",
  activity: "总体业务流程",
  deployment: "部署需求模型",
  prototype: "原型界面关系",
  analysis: "需求分析模型",
};

function designDiagramLabel(diagram: DesignDiagramKind) {
  return DESIGN_DIAGRAM_LABELS[diagram];
}

function requirementDiagramLabel(diagram: DiagramKind) {
  return REQUIREMENT_DIAGRAM_LABELS[diagram];
}

function positiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readDesignSequenceConcurrency() {
  const runConcurrency = positiveIntegerEnv(
    process.env.UML_LLM_RUN_CONCURRENCY,
    DEFAULT_DESIGN_SEQUENCE_CONCURRENCY,
  );
  return positiveIntegerEnv(process.env.UML_DESIGN_SEQUENCE_CONCURRENCY, runConcurrency);
}

function readDesignModelTaskTimeoutConfig() {
  const globalIdleTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_TIMEOUT_MS,
    DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS,
  );
  const idleTimeoutMs = positiveIntegerEnv(
    process.env.UML_DESIGN_MODEL_TASK_TIMEOUT_MS,
    globalIdleTimeout,
  );
  const globalBlankOutputTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS),
  );
  const blankOutputTimeoutMs = positiveIntegerEnv(
    process.env.UML_DESIGN_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, globalBlankOutputTimeout),
  );
  const globalMaxRuntime = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_MAX_RUNTIME_MS,
    DEFAULT_MODEL_TASK_MAX_RUNTIME_MS,
  );
  const maxRuntimeMs = positiveIntegerEnv(
    process.env.UML_DESIGN_MODEL_TASK_MAX_RUNTIME_MS,
    globalMaxRuntime,
  );
  return { idleTimeoutMs, blankOutputTimeoutMs, maxRuntimeMs };
}

function compactText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}


function autoFillDesignTraceability(
  missingSources: ModelElementRef[],
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const requirementRefs = collectModelRefs(requirementModels).refs;
  if (requirementRefs.length === 0) return [];

  const fallbackRequirementRefs = [
    ...requirementRefs.filter((ref) => ref.diagramKind === "usecase"),
    ...requirementRefs.filter((ref) => ref.diagramKind !== "usecase"),
  ];
  const byElementId = new Map(
    requirementRefs.map((ref) => [ref.elementId.toLowerCase(), ref]),
  );
  const designByModelId = new Map(
    designModels
      .map((model) => [
        compactText((model as unknown as Record<string, unknown>).modelId),
        model,
      ] as const)
      .filter(([modelId]) => modelId),
  );

  return missingSources.flatMap((source, sourceIndex): DesignModelTraceabilityEntry[] => {
    const sourceModel = source.modelId ? designByModelId.get(source.modelId) : undefined;
    const sourceUseCaseId = compactText(
      (sourceModel as unknown as Record<string, unknown> | undefined)
        ?.sourceUseCaseId,
    );
    const directUseCaseTarget = sourceUseCaseId
      ? byElementId.get(sourceUseCaseId.toLowerCase())
      : undefined;
    const labelTarget = requirementRefs.find((ref) => {
      const sourceLabel = source.label.toLowerCase();
      return (
        sourceLabel.includes(ref.label.toLowerCase()) ||
        ref.label.toLowerCase().includes(sourceLabel)
      );
    });
    const target =
      directUseCaseTarget ??
      labelTarget ??
      fallbackRequirementRefs[sourceIndex % fallbackRequirementRefs.length];
    if (!target) return [];
    const mappingIsDeterministic = Boolean(directUseCaseTarget ?? labelTarget);
    return [
      {
        source,
        targets: [target],
        mappingSource: mappingIsDeterministic
          ? "derived-from-endpoints"
          : "auto-filled-pending-review",
        reviewStatus: mappingIsDeterministic ? "confirmed" : "pending",
        confidence: mappingIsDeterministic ? "medium" : "low",
        rationale: mappingIsDeterministic
          ? "由用例实现设计的来源用例或元素名称确定追踪关系。"
          : "由设计元素与最接近的需求模型元素建立候选映射，需复核。",
      },
    ];
  });
}

function recoverCompleteDesignTraceabilityFromSources(
  missingSources: ModelElementRef[],
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  if (missingSources.length === 0) return [];
  const recovered = normalizeDesignTraceabilityWithCoverage(
    autoFillDesignTraceability(missingSources, designModels, requirementModels),
    designModels,
    requirementModels,
  );
  return recovered.traceability.length > 0 && recovered.missingSources.length === 0
    ? recovered.traceability
    : null;
}

function autoFillCompleteDesignTraceability(
  designModels: DesignDiagramModelSpec[],
  requirementModels: DiagramModelSpec[],
) {
  const coverage = normalizeDesignTraceabilityWithCoverage(
    [],
    designModels,
    requirementModels,
  );
  return recoverCompleteDesignTraceabilityFromSources(
    coverage.missingSources,
    designModels,
    requirementModels,
  );
}

function truncateTraceRawOutput(rawOutput: string) {
  if (rawOutput.length <= TRACE_RAW_OUTPUT_LIMIT) return rawOutput;
  return `${rawOutput.slice(0, TRACE_RAW_OUTPUT_LIMIT)}\n...[truncated ${rawOutput.length - TRACE_RAW_OUTPUT_LIMIT} chars]`;
}

function createLimitedLlmChunkEmitter(
  record: RunRecord,
  stage: RunStage,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  subtaskId?: string,
  subtaskLabel?: string,
  repairRound?: number,
) {
  return createRunLlmChunkHandlers({
    record,
    stage,
    onActivity,
    onBlankActivity,
    subtaskId,
    subtaskLabel,
    modelId: subtaskId,
    operation: repairRound ? "model_repair" : undefined,
    round: repairRound,
    maxVisibleChunks: LLM_CHUNK_EVENT_LIMIT,
    maxVisibleChars: LLM_CHUNK_CHAR_LIMIT,
  });
}

function useCasesFromModel(useCaseModel: DiagramModelSpec) {
  return useCaseModel.diagramKind === "usecase" ? useCaseModel.useCases : [];
}


type UseCaseForSequence = ReturnType<typeof useCasesFromModel>[number];
type SequenceDesignModel = Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }>;

function sequenceModelIdForUseCase(useCase: UseCaseForSequence) {
  return `sequence:${useCase.id}`;
}

export function coerceSequenceModelForUseCase(
  result: Awaited<ReturnType<typeof generateDesignModelsWithRepair>>,
  useCase: UseCaseForSequence,
) {
  const sequenceModels = result.models.filter(
    (model): model is SequenceDesignModel => model.diagramKind === "sequence",
  );
  const expectedModelId = sequenceModelIdForUseCase(useCase);
  const selected =
    sequenceModels.find(
      (model) =>
        model.sourceUseCaseId === useCase.id || model.modelId === expectedModelId,
    ) ?? sequenceModels[0];
  if (!selected) {
    throw new Error(`${useCase.name}用例实现设计生成结果为空`);
  }

  const model: SequenceDesignModel = {
    ...selected,
    modelId: expectedModelId,
    sourceUseCaseId: useCase.id,
    sourceUseCaseName: useCase.name,
    title: selected.title?.trim() || `${useCase.name}用例实现设计`,
    summary:
      selected.summary?.trim() || `${useCase.name}用例的对象交互流程。`,
  };
  const selectedElementIds = new Set(collectModelRefs([selected]).refs.map((ref) => ref.elementId));
  const siblingElementIds = new Set(collectModelRefs(sequenceModels.filter((candidate) => candidate !== selected)).refs.map((ref) => ref.elementId));
  const designModelTraceability = result.designModelTraceability
    // A response can contain sibling use-case models; renaming all their traces would fabricate local references.
    .filter((entry) => entry.source.diagramKind === "sequence" &&
      (entry.source.modelId ? entry.source.modelId === selected.modelId : !siblingElementIds.has(entry.source.elementId)) &&
      selectedElementIds.has(entry.source.elementId))
    .map((entry) => ({
      ...entry,
      source: {
        ...entry.source,
        modelId: expectedModelId,
        diagramKind: "sequence" as const,
      },
    }));

  return {
    models: [model],
    designModelTraceability,
  };
}

function normalizedSequenceTerms(values: string[]) {
  return new Set(
    values
      .map((value) => value.replace(/[\s_()[\]（）【】确认成功失败结果]/gu, "").toLowerCase())
      .filter((value) => value.length > 0),
  );
}

function overlapRatio(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) overlap += 1;
  }
  return overlap / Math.min(left.size, right.size);
}

function hasDesignImplementationSignal(model: SequenceDesignModel) {
  const participantTypes = new Set(model.participants.map((participant) => participant.participantType));
  const hasDesignParticipant =
    participantTypes.has("service") || participantTypes.has("database");
  const hasMethodLikeMessage = model.messages.some((message) =>
    /^[a-z][a-z0-9_]*(?:[A-Z][a-z0-9_]*)*(?:\s*\(|$)/u.test(message.name.trim()),
  );
  return hasDesignParticipant || hasMethodLikeMessage;
}

function assertSequenceDiffersFromRequirementAnalysis(
  model: SequenceDesignModel,
  analysisModels: DiagramModelSpec[],
) {
  const analysis = analysisModels.find((candidate) => candidate.diagramKind === "analysis");
  if (!analysis || analysis.diagramKind !== "analysis") return;

  const participantOverlap = overlapRatio(
    normalizedSequenceTerms(model.participants.map((participant) => participant.name)),
    normalizedSequenceTerms(analysis.participants.map((participant) => participant.name)),
  );
  const messageOverlap = overlapRatio(
    normalizedSequenceTerms(model.messages.map((message) => message.name)),
    normalizedSequenceTerms(analysis.messages.map((message) => message.name)),
  );
  if (
    participantOverlap >= 0.75 &&
    messageOverlap >= 0.75 &&
    !hasDesignImplementationSignal(model)
  ) {
    throw new Error(
      `${model.sourceUseCaseName ?? model.title}用例实现设计与需求分析模型过于相似，缺少设计阶段对象职责、服务/数据库参与者或方法调用时序`,
    );
  }
}

function validateUseCaseSequenceCoverage(
  sequenceModels: SequenceDesignModel[],
  useCaseModel: DiagramModelSpec,
) {
  const useCases = useCasesFromModel(useCaseModel);
  const covered = new Set(sequenceModels.map((model) => model.sourceUseCaseId));
  return useCases.filter((useCase) => !covered.has(useCase.id));
}

async function generateDesignTraceabilityWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  stage: RunStage,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
) {
  const allRequiredSources =
    normalizeDesignTraceabilityWithCoverage([], designModels, requirementModels)
      .missingSources;
  const directSources = allRequiredSources.filter(
    (source) => source.elementKind !== "relationship",
  );
  const relationshipSources = allRequiredSources.filter(
    (source) => source.elementKind === "relationship",
  );
  let accumulatedTraceability: DesignModelTraceabilityEntry[] = [];
  const directBatches = chunkArray(directSources, DESIGN_TRACEABILITY_BATCH_SIZE);

  for (const [batchIndex, batchSources] of directBatches.entries()) {
    const batchTraceability = await generateDesignTraceabilityBatchWithRepair(
      record,
      providerSettings,
      llmTransport,
      requirementBaseline,
      requirementModels,
      designModels,
      batchSources,
      stage,
      batchIndex + 1,
      directBatches.length,
      onActivity,
      onBlankActivity,
      abortSignal,
    );
    accumulatedTraceability = mergeDesignTraceability(
      accumulatedTraceability,
      batchTraceability,
    );
  }

  accumulatedTraceability = deriveUpstreamDesignRefsFromTraceability(
    deriveDesignRelationshipTraceability(accumulatedTraceability, designModels),
  );

  const afterDerivedCoverage = normalizeDesignTraceabilityWithCoverage(
    accumulatedTraceability,
    designModels,
    requirementModels,
  );
  accumulatedTraceability = afterDerivedCoverage.traceability;
  const remainingRelationshipSources = afterDerivedCoverage.missingSources.filter(
    (source) =>
      source.elementKind === "relationship" ||
      relationshipSources.some(
        (relationship) =>
          relationship.diagramKind === source.diagramKind &&
          relationship.elementId === source.elementId,
      ),
  );

  const relationshipBatches = chunkArray(
    remainingRelationshipSources,
    DESIGN_TRACEABILITY_BATCH_SIZE,
  );
  for (const [batchIndex, batchSources] of relationshipBatches.entries()) {
    const batchTraceability = await generateDesignTraceabilityBatchWithRepair(
      record,
      providerSettings,
      llmTransport,
      requirementBaseline,
      requirementModels,
      designModels,
      batchSources,
      stage,
      batchIndex + 1,
      relationshipBatches.length,
      onActivity,
      onBlankActivity,
      abortSignal,
    );
    accumulatedTraceability = mergeDesignTraceability(
      accumulatedTraceability,
      batchTraceability,
    );
  }

  accumulatedTraceability = deriveUpstreamDesignRefsFromTraceability(
    deriveDesignRelationshipTraceability(accumulatedTraceability, designModels),
  );
  const finalCoverage = normalizeDesignTraceabilityWithCoverage(
    accumulatedTraceability,
    designModels,
    requirementModels,
  );
  const recoveredFinalTraceability = deriveUpstreamDesignRefsFromTraceability(
    finalCoverage.traceability.length > 0 && finalCoverage.missingSources.length > 0
      ? mergeDesignTraceability(
          finalCoverage.traceability,
          autoFillDesignTraceability(
            finalCoverage.missingSources,
            designModels,
            requirementModels,
          ),
        )
      : finalCoverage.traceability,
  );
  const recoveredFinalCoverage = normalizeDesignTraceabilityWithCoverage(
    recoveredFinalTraceability,
    designModels,
    requirementModels,
  );
  if (recoveredFinalCoverage.traceability.length === 0) {
    throw new Error(
      "design traceability structured output failed: generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
    );
  }
  if (recoveredFinalCoverage.missingSources.length > 0) {
    throw new Error(
      `design traceability structured output failed: ${formatTraceabilityMissingRefs(
        "design",
        recoveredFinalCoverage.missingSources,
      )}`,
    );
  }
  if (finalCoverage.missingSources.length > 0) {
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message: `已自动补齐 ${finalCoverage.missingSources.length} 个设计模型元素映射`,
      }),
    );
  }

  appendDesignTrace(record, {
    stage:
      stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models",
    attempt: 1,
    kind: "parsed_model",
    parsedData: {
      models: designModels,
      designModelTraceability: recoveredFinalCoverage.traceability,
    },
  });
  return recoveredFinalCoverage.traceability;
}

async function generateDesignTraceabilityBatchWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  designModels: DesignDiagramModelSpec[],
  requiredSources: ModelElementRef[],
  stage: RunStage,
  batchIndex: number,
  totalBatches: number,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
) {
  if (requiredSources.length === 0) return [];
  const responseFormat = getGenerateDesignTraceabilityResponseFormat(
      providerSettings,
    );
  let prompt = buildGenerateDesignTraceabilityPrompt(
    requirementBaseline,
    requirementModels,
    designModels,
    requiredSources,
  );
  let previousOutput = "";
  let lastErrorMessage = "";
  let accumulatedTraceability: DesignModelTraceabilityEntry[] = [];
  let missingSources: ModelElementRef[] = requiredSources;
  const traceStage =
    stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";

  for (let attempt = 0; attempt <= MAX_MODEL_REPAIR_ATTEMPTS; attempt += 1) {
    const emitLimitedChunk = createLimitedLlmChunkEmitter(
      record,
      stage,
      onActivity,
      onBlankActivity,
      designModels.length === 1 ? designModels[0]?.modelId ?? designModels[0]?.diagramKind : undefined,
      "补全模型与需求的对应关系",
    );
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      emitLimitedChunk,
      responseFormat,
      abortSignal,
    );
    previousOutput = content;
    appendDesignTrace(record, {
      stage: traceStage,
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: truncateTraceRawOutput(content),
    });

    try {
      const parsed = parseDesignTraceabilityCoverageForSources(
        content,
        missingSources,
        requirementModels,
      );
      accumulatedTraceability = mergeDesignTraceability(
        accumulatedTraceability,
        parsed.traceability,
      );
      const coverage = normalizeDesignTraceabilityForSources(
        accumulatedTraceability,
        requiredSources,
        requirementModels,
      );
      accumulatedTraceability = coverage.traceability;
      missingSources = coverage.missingSources;
      if (missingSources.length > 0 || accumulatedTraceability.length === 0) {
        const recoveredTraceability = mergeDesignTraceability(
          accumulatedTraceability,
          autoFillDesignTraceability(
            missingSources.length > 0 ? missingSources : requiredSources,
            designModels,
            requirementModels,
          ),
        );
        const recoveredCoverage = normalizeDesignTraceabilityForSources(
          recoveredTraceability,
          requiredSources,
          requirementModels,
        );
        if (
          recoveredCoverage.traceability.length > 0 &&
          recoveredCoverage.missingSources.length === 0
        ) {
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage,
              progress: stageProgressValue(stage),
              message: `已自动补齐第 ${batchIndex}/${totalBatches} 批 ${missingSources.length || requiredSources.length} 个设计模型元素映射`,
            }),
          );
          onActivity?.();
          appendDesignTrace(record, {
            stage: traceStage,
            attempt: attempt + 1,
            kind: "parsed_model",
            parsedData: {
              models: designModels,
              designModelTraceability: recoveredCoverage.traceability,
            },
          });
          return recoveredCoverage.traceability;
        }
        if (accumulatedTraceability.length === 0) {
          throw new Error(
            "generate_design_models must return non-empty designModelTraceability with valid design-to-requirement element references",
          );
        }
        throw new Error(
          `第 ${batchIndex}/${totalBatches} 批${formatTraceabilityMissingRefs(
            "design",
            missingSources,
          )}`,
        );
      }
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: {
          models: designModels,
          designModelTraceability: accumulatedTraceability,
        },
      });
      return accumulatedTraceability;
    } catch (error) {
      logFailedStructuredOutput(
        stage,
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: truncateTraceRawOutput(content),
        errorMessage: lastErrorMessage,
      });

      if (attempt === MAX_MODEL_REPAIR_ATTEMPTS) {
        const recoveredTraceability = mergeDesignTraceability(
          accumulatedTraceability,
          autoFillDesignTraceability(
            missingSources,
            designModels,
            requirementModels,
          ),
        );
        const recoveredCoverage = normalizeDesignTraceabilityForSources(
          recoveredTraceability,
          requiredSources,
          requirementModels,
        );
        if (
          recoveredCoverage.traceability.length > 0 &&
          recoveredCoverage.missingSources.length === 0
        ) {
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage,
              progress: stageProgressValue(stage),
              message: `已自动补齐第 ${batchIndex}/${totalBatches} 批 ${missingSources.length} 个设计模型元素映射`,
            }),
          );
          onActivity?.();
          appendDesignTrace(record, {
            stage: traceStage,
            attempt: attempt + 1,
            kind: "parsed_model",
            parsedData: {
              models: designModels,
              designModelTraceability: recoveredCoverage.traceability,
            },
          });
          return recoveredCoverage.traceability;
        }
        if (accumulatedTraceability.length === 0) {
          throw new Error(
            `design traceability structured output failed: ${lastErrorMessage}`,
          );
        }
        throw new Error(
          `design traceability structured output failed: ${lastErrorMessage}`,
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage,
          progress: stageProgressValue(stage),
          message: `设计模型元素映射不合法，正在修复第 ${batchIndex}/${totalBatches} 批可追踪关系（${attempt + 1}/${MAX_MODEL_REPAIR_ATTEMPTS}）`,
        }),
      );
      onActivity?.();

      prompt = buildRepairDesignTraceabilityPrompt(
        requirementBaseline,
        requirementModels,
        designModels,
        previousOutput,
        lastErrorMessage,
        missingSources,
      );
    }
  }

  throw new Error(
    `design traceability structured output failed: ${lastErrorMessage}`,
  );
}

// LLM structured output repair retries malformed design models while preserving trace schema.
export async function generateDesignModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementBaseline: RequirementBaseline,
  requirementModels: DiagramModelSpec[],
  selectedDiagrams: DesignDiagramKind[],
  initialPrompt: string,
  stage: RunStage,
  options: {
    modelRepairAttempts?: number;
    validateModels?: (models: DesignDiagramModelSpec[]) => void;
    subtaskId?: string;
    subtaskLabel?: string;
  } = {},
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal,
) {
  const modelRepairAttempts =
    Math.min(options.modelRepairAttempts ?? MAX_MODEL_REPAIR_ATTEMPTS, MAX_MODEL_REPAIR_ATTEMPTS);
  const responseFormat = getGenerateDesignModelsResponseFormat(providerSettings, selectedDiagrams);
  const validateSelectedModels = (models: DesignDiagramModelSpec[]) => {
    if (!models.length || models.some((model) => !selectedDiagrams.includes(model.diagramKind))) throw new Error("模型类型与本次请求不匹配");
    options.validateModels?.(models);
  };
  let prompt = initialPrompt;
  let previousOutput = "";
  let lastErrorMessage = "";
  const traceStage =
    stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";

  for (let attempt = 0; attempt <= modelRepairAttempts; attempt += 1) {
    const repairIdentity = options.subtaskId ?? selectedDiagrams.join(",");
    if (attempt > 0 && readDiagramReviewCounters(record, repairIdentity, selectedDiagrams[0]).repairAttempts >= MAX_MODEL_REPAIR_ATTEMPTS) throw new Error("已达到共享两轮结构修复上限");
    const emitLimitedChunk = createLimitedLlmChunkEmitter(
      record,
      stage,
      onActivity,
      onBlankActivity,
      repairIdentity,
      options.subtaskLabel,
      attempt > 0 ? attempt : undefined,
    );
    const content = await collectTextResult(
      llmTransport,
      providerSettings,
      createMessages(prompt),
      emitLimitedChunk,
      responseFormat,
      abortSignal,
    );
    previousOutput = content;
    appendDesignTrace(record, {
      stage: traceStage,
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: truncateTraceRawOutput(content),
    });

    try {
      const parsed = parseDesignDiagramModelsResult(content, requirementModels);
      validateSelectedModels(parsed.models);
      const filteredModels = parsed.models.filter((model) =>
        selectedDiagrams.includes(model.diagramKind),
      );
      const filteredDiagramKinds = new Set(filteredModels.map((model) => model.diagramKind));
      let filteredTraceability = parsed.designModelTraceability.filter((entry) =>
        filteredDiagramKinds.has(entry.source.diagramKind as DesignDiagramKind),
      );
      if (filteredModels.length > 0 && filteredTraceability.length === 0) {
        const recoveredTraceability = autoFillCompleteDesignTraceability(
          filteredModels,
          requirementModels,
        );
        if (recoveredTraceability) {
          filteredTraceability = recoveredTraceability;
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage,
              progress: stageProgressValue(stage),
              message: "设计模型元素映射缺失，已系统自动补齐并标记待确认",
            }),
          );
          onActivity?.();
        } else {
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage,
              progress: stageProgressValue(stage),
              message: "设计模型元素映射缺失，正在单独生成可追踪关系",
            }),
          );
          onActivity?.();
          filteredTraceability = await generateDesignTraceabilityWithRepair(
            record,
            providerSettings,
            llmTransport,
            requirementBaseline,
            requirementModels,
            filteredModels,
            stage,
            onActivity,
            onBlankActivity,
            abortSignal,
          );
        }
      }
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: {
          models: filteredModels,
          designModelTraceability: filteredTraceability,
        },
      });
      return {
        models: filteredModels,
        designModelTraceability: filteredTraceability,
      };
    } catch (error) {
      const modelOnly = (() => {
        try {
          const result = parseDesignDiagramModelsOnly(content);
          validateSelectedModels(result.models);
          return result;
        } catch {
          return null;
        }
      })();
      if (modelOnly) {
        const filteredModels = modelOnly.models.filter((model) =>
          selectedDiagrams.includes(model.diagramKind),
        );
        lastErrorMessage = formatParseError(error);
        appendDesignTrace(record, {
          stage: traceStage,
          attempt: attempt + 1,
          kind: "parse_error",
          rawOutput: truncateTraceRawOutput(content),
          errorMessage: lastErrorMessage,
        });
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage,
            progress: stageProgressValue(stage),
            message: "设计模型元素映射缺失，正在恢复可追踪关系",
          }),
        );
        onActivity?.();
        const designModelTraceability =
          autoFillCompleteDesignTraceability(filteredModels, requirementModels) ??
          (await generateDesignTraceabilityWithRepair(
            record,
            providerSettings,
            llmTransport,
            requirementBaseline,
            requirementModels,
            filteredModels,
            stage,
            onActivity,
            onBlankActivity,
            abortSignal,
          ));
        appendDesignTrace(record, {
          stage: traceStage,
          attempt: attempt + 1,
          kind: "parsed_model",
          parsedData: {
            models: filteredModels,
            designModelTraceability,
          },
        });
        return {
          models: filteredModels,
          designModelTraceability,
        };
      }

      logFailedStructuredOutput(
        stage,
        providerSettings.model,
        error,
        content,
        attempt + 1,
      );
      lastErrorMessage = formatParseError(error);
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parse_error",
        rawOutput: truncateTraceRawOutput(content),
        errorMessage: lastErrorMessage,
      });

      if (attempt === modelRepairAttempts) {
        throw new Error(
          `${stage} structured output failed: ${lastErrorMessage}`,
          { cause: error },
        );
      }

      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
            stage,
            progress: stageProgressValue(stage),
            message: `设计模型 JSON 结构不合法，正在尝试修复（${attempt + 1}/${modelRepairAttempts}）`,
          }),
        );
      onActivity?.();

      prompt = buildRepairDesignModelsPrompt(
        requirementBaseline,
        selectedDiagrams,
        previousOutput,
        lastErrorMessage,
      );
      // Empty or invalid output still needs the original use case and upstream models during repair.
      prompt += `\n\n本次原始建模任务与权威输入：\n${initialPrompt}`;
    }
  }

  throw new Error(`${stage} structured output failed: ${lastErrorMessage}`);
}

export function findRequirementModel(
  models: DiagramModelSpec[],
  diagramKind: DiagramKind,
) {
  return models.find((model) => model.diagramKind === diagramKind);
}

function getDesignModelId(model: Pick<DesignDiagramModelSpec, "diagramKind" | "modelId">) {
  return model.modelId ?? model.diagramKind;
}

function mergeDesignModels(
  existing: DesignDiagramModelSpec[],
  incoming: DesignDiagramModelSpec[],
) {
  const merged = new Map(existing.map((model) => [getDesignModelId(model), model]));
  for (const model of incoming) {
    merged.set(getDesignModelId(model), model);
  }
  return [...merged.values()];
}


function designArtifactKey(
  artifact: Pick<DesignPlantUmlArtifact | DesignSvgArtifact, "diagramKind" | "modelId">,
) {
  return artifact.modelId ?? artifact.diagramKind;
}

function replaceDesignPlantUmlArtifact(
  artifacts: DesignPlantUmlArtifact[],
  patch: DesignPlantUmlArtifact,
) {
  const key = designArtifactKey(patch);
  return [...artifacts.filter((artifact) => designArtifactKey(artifact) !== key), patch];
}

function replaceDesignSvgArtifact(
  artifacts: DesignSvgArtifact[],
  patch: DesignSvgArtifact,
) {
  const key = designArtifactKey(patch);
  return [...artifacts.filter((artifact) => designArtifactKey(artifact) !== key), patch];
}

function existingSequenceModelsForUseCases(
  models: DesignDiagramModelSpec[],
  useCaseModel: DiagramModelSpec,
) {
  const sequences = models.filter(
    (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
      model.diagramKind === "sequence",
  );
  try {
    validateUseCaseSequenceCoverage(sequences, useCaseModel);
    return sequences;
  } catch {
    return [];
  }
}

export function sourceRequirementKindForDesign(
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
): DiagramKind | undefined {
  return sourceRequirementKindsForDesign(diagramKind)[0];
}

function sourceRequirementKindsForDesign(
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
): DiagramKind[] {
  switch (diagramKind) {
    case "architecture":
      return ["function"];
    case "navigation":
      return ["prototype"];
    case "class":
      return ["class"];
    case "component":
      return [];
    case "deployment":
      return ["deployment"];
    case "table":
      return [];
  }
}

function findRequirementModelsForDesign(
  models: DiagramModelSpec[],
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
) {
  const sourceKinds = sourceRequirementKindsForDesign(diagramKind);
  if (sourceKinds.length === 0) {
    return models;
  }
  return sourceKinds
    .map((kind) => findRequirementModel(models, kind))
    .filter((model): model is DiagramModelSpec => Boolean(model));
}

function analysisModelsForUseCase(models: DiagramModelSpec[], useCaseId: string) {
  return models.filter((model) => {
    if (model.diagramKind !== "analysis") return false;
    const modelId = model.modelId ?? "";
    return model.sourceUseCaseId === useCaseId || modelId === `analysis:${useCaseId}`;
  });
}

// route -> pipeline -> record store contract: design runs update their snapshot and emit compatible SSE events.
export async function runDesignStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
  pngRenderClient?: PngRenderClient,
) {
  const snapshot = record.snapshot as DesignRunSnapshot;
  throwIfRunCancelled(record);
  if (!snapshot.requirementBaseline) {
    throw new Error("设计生成缺少当前需求基线，无法兼容旧设计快照结构");
  }
  const requirementBaseline = snapshot.requirementBaseline;
  assertRequirementBaselineAllowsDownstream(requirementBaseline);

  const stages = createStageLifecycle(record);
  const updateStage = (stage: RunStage, message?: string) => {
    throwIfRunCancelled(record);
    stages.advance(stage);
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage, tracksCompletion: true }));
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage,
        progress: stageProgressValue(stage),
        message,
      }),
    );
  };

  let models: DesignDiagramModelSpec[] = [...snapshot.models];
  let designModelTraceability: DesignRunSnapshot["designModelTraceability"] = [
    ...snapshot.designModelTraceability,
  ];
  let diagramErrors: Record<string, DiagramError> = {};
  let plantUml: DesignPlantUmlArtifact[] = [...snapshot.plantUml];
  let svgArtifacts: DesignSvgArtifact[] = [...snapshot.svgArtifacts];
  const renderFailures: string[] = [];
  const publishDesignModelSnapshot = () => {
    snapshot.models = models;
    snapshot.designModelTraceability = designModelTraceability;
    snapshot.diagramErrors = diagramErrors;
  };
  const renderDesignModelArtifact = async <T extends DesignDiagramModelSpec>(model: T, traceability: typeof designModelTraceability, designContext: DesignDiagramModelSpec[] = []) => {
    throwIfRunCancelled(record);
    try {
      const checked = await reviewRenderedArtifact({
        record, providerSettings, llmTransport, renderClient, pngRenderClient, model, mutable: true,
        basis: { stage: "design", baseline: snapshot.requirementBaseline,
          upstreamModels: model.diagramKind === "sequence"
            ? snapshot.requirementModels.filter((source) => source.diagramKind === "usecase" || (source.diagramKind === "analysis" && (source.sourceUseCaseId === model.sourceUseCaseId || source.modelId === `analysis:${model.sourceUseCaseId}`)))
            : [...findRequirementModelsForDesign(snapshot.requirementModels, model.diagramKind), ...models.filter((source) => source.diagramKind === "sequence"), ...designContext],
          traceability, requirementTraceability: snapshot.requirementModelTraceability },
        reconcileTraceability: (candidate) => {
          const normalized = normalizeDesignTraceabilityWithCoverage(traceability, [candidate as DesignDiagramModelSpec], snapshot.requirementModels);
          const derived = deriveDesignRelationshipTraceability(normalized.traceability, [candidate as DesignDiagramModelSpec]);
          const coverage = normalizeDesignTraceabilityWithCoverage(derived, [candidate as DesignDiagramModelSpec], snapshot.requirementModels);
          if (coverage.missingSources.length) throw new Error("修复后的设计模型缺少有效追踪关系");
          return coverage.traceability;
        },
      });
      throwIfRunCancelled(record);
      // Publish the accepted tuple together; rejected candidates stay private.
      models = mergeDesignModels(models, [checked.model as DesignDiagramModelSpec]);
      const acceptedTrace = (checked.traceability ?? traceability) as typeof designModelTraceability;
      designModelTraceability = [...designModelTraceability.filter((entry) => model.modelId ? entry.source.modelId !== model.modelId : entry.source.diagramKind !== model.diagramKind), ...acceptedTrace.filter((entry) => model.modelId ? entry.source.modelId === model.modelId : entry.source.diagramKind === model.diagramKind)];
      snapshot.models = models; snapshot.designModelTraceability = designModelTraceability;
      plantUml = replaceDesignPlantUmlArtifact(plantUml, checked.rendered.artifact as DesignPlantUmlArtifact);
      svgArtifacts = replaceDesignSvgArtifact(svgArtifacts, checked.rendered.svgArtifact as DesignSvgArtifact);
      snapshot.plantUml = plantUml; snapshot.svgArtifacts = svgArtifacts;
      snapshot.visualReviews[model.modelId ?? model.diagramKind] = checked.review;
      appendDesignTrace(record, { stage: "generate_plantuml", attempt: 1, kind: "plantuml_source", diagramKind: model.diagramKind, plantUmlSource: checked.rendered.artifact.source });
      for (const [stage, artifactKind] of [["generate_plantuml", "plantuml"], ["render_svg", "svg"]] as const) {
        emitEvent(record, artifactReadyRunEventSchema.parse({ type: "artifact_ready", stage, artifactKind,
          diagramKind: model.diagramKind, modelId: model.modelId, subtaskId: model.modelId ?? model.diagramKind,
          subtaskLabel: model.title, subtaskStatus: "completed" }));
      }
      return checked.model as T;
    } catch (error) {
      throwIfRunCancelled(record);
      if (error instanceof DiagramReviewRenderError) {
        snapshot.visualReviews[model.modelId ?? model.diagramKind] = error.review;
        renderFailures.push(error.message);
        const runError = createRunError(error.review.structureStatus === "failed" ? "RUN_STRUCTURED_OUTPUT_INVALID" : "RUN_RENDER_FAILED", error.message);
        diagramErrors[model.diagramKind] = diagramErrorSchema.parse({ stage: "verify_diagram_visual", error: runError });
        snapshot.diagramErrors = diagramErrors; throwRunError(runError);
      }
      throw error;
    }
  };
  const selectedDesignDiagrams = new Set(snapshot.selectedDiagrams);
  const selectedDownstreamDiagrams = snapshot.selectedDiagrams.filter(
    (diagram): diagram is Exclude<DesignDiagramKind, "sequence"> =>
      diagram !== "sequence",
  );
  const selectedDiagramsRequireUseCase =
    selectedDesignDiagrams.has("sequence") ||
    selectedDownstreamDiagrams.some(
      (diagram) => diagram === "class" || diagram === "navigation",
    );
  const useCaseModel = findRequirementModel(snapshot.requirementModels, "usecase");
  if (!useCaseModel && selectedDiagramsRequireUseCase) {
    throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少需求阶段用例模型，无法生成用例实现设计"));
  }

  let sequenceModels = useCaseModel
    ? existingSequenceModelsForUseCases(models, useCaseModel)
    : [];
  const shouldGenerateSequence = selectedDesignDiagrams.has("sequence");
  const modelTaskTimeoutConfig = readDesignModelTaskTimeoutConfig();

  if (shouldGenerateSequence) {
    if (!useCaseModel) {
      throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少需求阶段用例模型，无法生成用例实现设计"));
    }
    updateStage("generate_design_sequence", "正在生成用例实现设计");
    const sequenceRunErrors: ReturnType<typeof normalizeRunError>[] = [];
    record.conversationContext?.forkBranches(useCasesFromModel(useCaseModel).map((useCase) => `design:${sequenceModelIdForUseCase(useCase)}`));
    const sequenceResults = await mapWithConcurrency(
      useCasesFromModel(useCaseModel),
      readDesignSequenceConcurrency(),
      (useCase) => withConversationBranch(`design:${sequenceModelIdForUseCase(useCase)}`, async () => {
        throwIfRunCancelled(record);
        const modelId = sequenceModelIdForUseCase(useCase);
        const scopedUseCaseModel = useCaseModelForSingleUseCase(
          useCaseModel,
          useCase.id,
        );
        let lastErrorMessage = "";
        let lastRunError: ReturnType<typeof normalizeRunError> | null = null;
        for (let attempt = 0; attempt <= MAX_SEQUENCE_USE_CASE_RETRIES; attempt += 1) {
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_design_sequence",
              progress: stageProgressValue("generate_design_sequence"),
              message:
                attempt === 0
                  ? `正在生成用例实现设计：${useCase.name}`
                  : `正在重试用例实现设计：${useCase.name}（${attempt}/${MAX_SEQUENCE_USE_CASE_RETRIES}）`,
              diagramKind: "sequence",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `用例实现设计：${useCase.name}`,
              subtaskStatus: attempt === 0 ? "running" : "repairing",
            }),
          );
          try {
            const scopedAnalysisModels = analysisModelsForUseCase(
              snapshot.requirementModels,
              useCase.id,
            );
            const rawResult = await withModelTaskTimeout(
              (markActivity, markBlankActivity, abortSignal) => generateDesignModelsWithRepair(
                record,
                providerSettings,
                llmTransport,
                requirementBaseline,
                [scopedUseCaseModel],
                ["sequence"],
                buildGenerateDesignSequencePrompt(
                  requirementBaseline,
                  scopedUseCaseModel,
                  scopedAnalysisModels,
                ),
                "generate_design_sequence",
                { subtaskId: modelId, subtaskLabel: `${useCase.name}的顺序图`, validateModels: (models) => { for (const model of models) if (model.diagramKind === "sequence") assertSequenceDiffersFromRequirementAnalysis(model, scopedAnalysisModels); } },
                markActivity,
                markBlankActivity,
                abortSignal,
              ),
              {
                ...modelTaskTimeoutConfig,
                label: `${useCase.name}用例实现设计`,
                isCancelled: () => isRunCancelled(record),
                createCancelError: () => new RunCancelledError(snapshot.runId),
              },
            );
            const result = coerceSequenceModelForUseCase(rawResult, useCase);
            assertSequenceDiffersFromRequirementAnalysis(
              result.models[0]!,
              scopedAnalysisModels,
            );
            result.models = await Promise.all(result.models.map((model) => renderDesignModelArtifact(model, result.designModelTraceability)));
            result.designModelTraceability = designModelTraceability.filter((entry) => result.models.some((model) => model.modelId ? entry.source.modelId === model.modelId : entry.source.diagramKind === model.diagramKind)) as typeof result.designModelTraceability;
            models = mergeDesignModels(models, result.models);
            designModelTraceability = [
              ...designModelTraceability.filter(
                (entry) => entry.source.modelId !== modelId,
              ),
              ...result.designModelTraceability,
            ];
            delete diagramErrors.sequence;
            delete diagramErrors[modelId];
            publishDesignModelSnapshot();
            emitEvent(
              record,
              artifactReadyRunEventSchema.parse({
                type: "artifact_ready",
                stage: "generate_design_sequence",
                artifactKind: "model",
                diagramKind: "sequence",
                modelId,
                subtaskId: modelId,
                subtaskLabel: `用例实现设计：${useCase.name}`,
                subtaskStatus: "completed",
              }),
            );

            record.conversationContext?.commitValidatedBranch(`design:${modelId}`, JSON.stringify(result.models));
            return result;
          } catch (error) {
            throwIfRunCancelled(record);
            lastRunError = normalizeRunError(error);
            lastErrorMessage = lastRunError.message;
            // Rendering failures use the render gate and never restart model generation.
            if (lastRunError.code === "RUN_RENDER_FAILED") break;
          }
        }

        const message = lastErrorMessage || `${useCase.name}用例实现设计生成失败`;
        const runError = lastRunError ?? createRunError("RUN_MODEL_OUTPUT_EMPTY", message);
        sequenceRunErrors.push(runError);
        diagramErrors[modelId] = diagramErrorSchema.parse({
          stage: runError.code === "RUN_RENDER_FAILED" ? "render_svg" : "generate_design_sequence",
          error: runError,
        });
        publishDesignModelSnapshot();
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_design_sequence",
            progress: stageProgressValue("generate_design_sequence"),
            message,
            error: runError,
            diagramKind: "sequence",
            modelId,
            subtaskId: modelId,
            subtaskLabel: `用例实现设计：${useCase.name}`,
            subtaskStatus: "failed",
          }),
        );
        return null;
      }),
    );
    throwIfRunCancelled(record);
    sequenceModels = sequenceResults.flatMap((result) => result?.models ?? []).filter(
      (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
        model.diagramKind === "sequence",
    );
    if (sequenceModels.length === 0) {
      throwRunError(
        sequenceRunErrors[0] ??
          createRunError(
            "RUN_MODEL_OUTPUT_EMPTY",
            "用例实现设计未生成有效结果，请重试或检查模型输出。",
          ),
      );
    }
    const missingUseCaseSequences = validateUseCaseSequenceCoverage(
      sequenceModels,
      useCaseModel,
    );
    for (const useCase of missingUseCaseSequences) {
      const modelId = sequenceModelIdForUseCase(useCase);
      if (diagramErrors[modelId]) continue;
      diagramErrors[modelId] = diagramErrorSchema.parse({
        stage: "generate_design_sequence",
        error: createRunError(
          "RUN_MODEL_OUTPUT_EMPTY",
          `${useCase.name}用例实现设计未生成有效结果`,
        ),
      });
    }
    models = mergeDesignModels(models, sequenceModels);
    designModelTraceability = [
      ...designModelTraceability.filter(
        (entry) => entry.source.diagramKind !== "sequence",
      ),
      ...sequenceResults.flatMap((result) => result?.designModelTraceability ?? []),
    ];
  }
  publishDesignModelSnapshot();
  if (shouldGenerateSequence) {
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_design_sequence",
        artifactKind: "model",
        diagramKind: "sequence",
        subtaskId: "sequence",
        subtaskStatus: "completed",
      }),
    );
  }

  const requestedDownstream = selectedDownstreamDiagrams;
  const sequenceRequiredDiagrams = requestedDownstream.filter(
    (diagram) => diagram === "class" || diagram === "navigation",
  );
  if (sequenceRequiredDiagrams.length > 0 && sequenceModels.length === 0) {
    throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少用例实现设计，无法生成所选设计模型；请先生成用例实现设计或在本次请求中包含用例实现设计"));
  }

  const markDesignDependencyError = (
    diagram: Exclude<DesignDiagramKind, "sequence">,
    message: string,
  ) => {
    const dependencyError = createRunError("RUN_DEPENDENCY_MISSING", message);
    diagramErrors[diagram] = diagramErrorSchema.parse({
      stage: "generate_design_models",
      error: dependencyError,
    });
    publishDesignModelSnapshot();
    emitEvent(
      record,
      stageProgressRunEventSchema.parse({
        type: "stage_progress",
        stage: "generate_design_models",
        progress: stageProgressValue("generate_design_models"),
        message,
        error: dependencyError,
        diagramKind: diagram,
        subtaskId: diagram,
        subtaskLabel: designDiagramLabel(diagram),
        subtaskStatus: "failed",
      }),
    );
  };

  const downstreamWithSources = requestedDownstream.filter((diagram) => {
    const sourceKinds = sourceRequirementKindsForDesign(diagram);
    if (sourceKinds.length === 0) {
      return true;
    }
    const sourceModels = findRequirementModelsForDesign(
      snapshot.requirementModels,
      diagram,
    );
    if (sourceModels.length > 0) {
      return true;
    }
    const sourceKind = sourceRequirementKindForDesign(diagram);
    const dependencyError = createRunError(
      "RUN_DEPENDENCY_MISSING",
      sourceKind
        ? `缺少需求阶段${requirementDiagramLabel(sourceKind)}，无法生成${designDiagramLabel(diagram)}`
        : `缺少上游设计来源，无法生成${designDiagramLabel(diagram)}`,
    );
    markDesignDependencyError(diagram, dependencyError.message);
    return false;
  });

  if (downstreamWithSources.length > 0) {
    updateStage("generate_design_models", "正在生成设计阶段结构化模型");
    const generateDownstreamDiagram = async (
      diagram: Exclude<DesignDiagramKind, "sequence">,
      designContextModels: DesignDiagramModelSpec[] = [],
    ) => {
      throwIfRunCancelled(record);
      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_design_models",
          progress: stageProgressValue("generate_design_models"),
          message: `正在生成${designDiagramLabel(diagram)}`,
          diagramKind: diagram,
          subtaskId: diagram,
          subtaskLabel: designDiagramLabel(diagram),
          subtaskStatus: "running",
        }),
      );
      const sourceModels = findRequirementModelsForDesign(
        snapshot.requirementModels,
        diagram,
      );
      try {
        const result = await withModelTaskTimeout(
          (markActivity, markBlankActivity, abortSignal) => generateDesignModelsWithRepair(
            record,
            providerSettings,
            llmTransport,
            requirementBaseline,
            sourceModels,
            [diagram],
            buildGenerateDesignModelsPrompt(
              requirementBaseline,
              sourceModels,
              sequenceModels,
              [diagram],
              designContextModels,
            ),
            "generate_design_models",
            { subtaskId: diagram, subtaskLabel: designDiagramLabel(diagram) },
            markActivity,
            markBlankActivity,
            abortSignal,
          ),
          {
            ...modelTaskTimeoutConfig,
            label: designDiagramLabel(diagram),
            isCancelled: () => isRunCancelled(record),
            createCancelError: () => new RunCancelledError(snapshot.runId),
          },
        );
        throwIfRunCancelled(record);
        result.models = await Promise.all(result.models.map((model) => renderDesignModelArtifact(model, result.designModelTraceability, designContextModels)));
        result.designModelTraceability = designModelTraceability.filter((entry) => result.models.some((model) => model.modelId ? entry.source.modelId === model.modelId : entry.source.diagramKind === model.diagramKind)) as typeof result.designModelTraceability;
        models = mergeDesignModels(models, result.models);
        designModelTraceability = [
          ...designModelTraceability.filter(
            (entry) => entry.source.diagramKind !== diagram,
          ),
          ...result.designModelTraceability,
        ];
        delete diagramErrors[diagram];
        publishDesignModelSnapshot();
        emitEvent(
          record,
          artifactReadyRunEventSchema.parse({
            type: "artifact_ready",
            stage: "generate_design_models",
            artifactKind: "model",
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskStatus: "completed",
          }),
        );

        record.conversationContext?.commitValidatedBranch(`design:${diagram}`, JSON.stringify(result.models));
        return result;
      } catch (error) {
        throwIfRunCancelled(record);
        const runError = normalizeRunError(error);
        const message = runError.message || `${designDiagramLabel(diagram)}生成失败`;
        diagramErrors[diagram] = diagramErrorSchema.parse({
          stage: runError.code === "RUN_RENDER_FAILED" ? "render_svg" : "generate_design_models",
          error: runError,
        });
        publishDesignModelSnapshot();
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_design_models",
            progress: stageProgressValue("generate_design_models"),
            message,
            error: runError,
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskLabel: designDiagramLabel(diagram),
            subtaskStatus: "failed",
          }),
        );
        return null;
      }
    };

    const markEmptyResult = (
      diagram: Exclude<DesignDiagramKind, "sequence">,
    ) => {
      if (diagramErrors[diagram]) return;
      const emptyError = createRunError(
        "RUN_MODEL_OUTPUT_EMPTY",
        `${designDiagramLabel(diagram)}生成结果为空`,
      );
      diagramErrors[diagram] = diagramErrorSchema.parse({
        stage: "generate_design_models",
        error: emptyError,
      });
      publishDesignModelSnapshot();
    };
    const runDownstreamDiagram = async (
      diagram: Exclude<DesignDiagramKind, "sequence">,
      designContextModels: DesignDiagramModelSpec[] = [],
    ) => {
      const result = await withConversationBranch(`design:${diagram}`, () => generateDownstreamDiagram(diagram, designContextModels));
      throwIfRunCancelled(record);
      const resultModels = result?.models.filter(
        (model) => model.diagramKind === diagram,
      ) ?? [];
      if (result && resultModels.length === 0) {
        markEmptyResult(diagram);
      }
      return result;
    };
    type DownstreamKind = Exclude<DesignDiagramKind, "sequence">;
    const dependencies: Partial<Record<DownstreamKind, DownstreamKind>> = {
      table: "class", component: "class", deployment: "component",
    };
    const tasks = new Map<DownstreamKind, ReturnType<typeof runDownstreamDiagram>>();
    const schedule = (diagram: DownstreamKind): ReturnType<typeof runDownstreamDiagram> => {
      const existing = tasks.get(diagram);
      if (existing) return existing;
      // Independent branches start immediately; dependent branches wait for the accepted model/review tuple.
      const task = (async () => {
        const dependency = dependencies[diagram];
        if (dependency && downstreamWithSources.includes(dependency)) {
          const result = await schedule(dependency);
          if (!result?.models.some((model) => model.diagramKind === dependency)) {
            markDesignDependencyError(diagram, `${designDiagramLabel(dependency)}未能完成，无法生成${designDiagramLabel(diagram)}`);
            return null;
          }
        }
        throwIfRunCancelled(record);
        const source = dependency ? models.find((model) => model.diagramKind === dependency) : undefined;
        if (dependency && !source) {
          markDesignDependencyError(diagram, `缺少${designDiagramLabel(dependency)}，无法生成${designDiagramLabel(diagram)}；请先生成前置模型或在本次请求中包含它`);
          return null;
        }
        return runDownstreamDiagram(diagram, source ? [source] : []);
      })();
      tasks.set(diagram, task);
      return task;
    };
    await Promise.all(downstreamWithSources.map(schedule));
    throwIfRunCancelled(record);
    publishDesignModelSnapshot();
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "generate_design_models",
        artifactKind: "model",
      }),
    );
  }

  const trustedChain = buildDesignStageTrustedChain({
    runId: snapshot.runId,
    baseline: requirementBaseline,
    models: snapshot.requirementModels,
    requirementModelTraceability: snapshot.requirementModelTraceability,
    designModels: models,
    designModelTraceability,
  });
  snapshot.coverageMatrix = trustedChain.coverageMatrix;
  snapshot.traceabilityMatrix = trustedChain.traceabilityMatrix;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_models",
      artifactKind: "coverageMatrix",
      coverageMatrix: trustedChain.coverageMatrix,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_design_models",
      artifactKind: "traceabilityMatrix",
      traceabilityMatrix: trustedChain.traceabilityMatrix,
    }),
  );
  assertTrustedChainAllowsCompletion(trustedChain);

  snapshot.diagramErrors = diagramErrors;
  const selectedFailures = selectedDesignDiagramFailures(
    diagramErrors,
    snapshot.selectedDiagrams,
  );
  const selectedSuccesses = successfulSelectedDesignDiagrams({
    selectedDiagrams: snapshot.selectedDiagrams,
    svgArtifacts: snapshot.svgArtifacts,
    diagramErrors,
  });
  if (selectedFailures.length > 0 && selectedSuccesses.length === 0) {
    const providerFailure = firstSelectedPlatformProviderFailure(selectedFailures);
    if (providerFailure) throwRunError(providerFailure);
    throw new Error(
      `设计模型生成未全部完成：${summarizeSelectedDesignDiagramFailures(
        selectedFailures,
      )}`,
    );
  }

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  stages.finish("generate_design_models");
  stages.finish("generate_plantuml");
  stages.finish("render_svg");
  stages.finish("verify_diagram_visual");
  snapshot.currentStage = "verify_diagram_visual";
  throwIfRunCancelled(record);
  snapshot.status = "completed";
  snapshot.error = null;
  emitEvent(
    record,
    completedRunEventSchema.parse({
      type: "completed",
      snapshot,
    }),
  );
}
