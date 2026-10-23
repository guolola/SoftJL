// Orchestrates design-model generation, PlantUML, and SVG rendering for design runs.
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "@uml-platform/contracts";
import { ModelGenerationConversation } from "./shared/model-generation-conversation.js";
import { assertDesignMappings } from "./shared/model-mapping-validation.js";
import { missingRequestedModelOutputs } from "../records/run-output-provenance.js";

import { createStageLifecycle } from "./shared/stage-lifecycle.js";
import { withRunReasoning } from "./shared/run-reasoning.js";
import {
  designRequirementSources,
  designModelTraceabilityEntrySchema,
  artifactReadyRunEventSchema,
  completedRunEventSchema,
  diagramErrorSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  type DesignDiagramKind,
  type DesignDiagramModelSpec,
  type DesignPlantUmlArtifact,
  type DesignRunSnapshot,
  type DesignSvgArtifact,
  type DiagramError,
  type DiagramKind,
  type DiagramModelSpec,
  type ProviderSettings,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateDesignModelsPrompt,
  buildGenerateDesignSequencePrompt,
  scopeUseCaseModelForPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../adapters/llm/llm-transport.js";
import { type RenderClient } from "../../adapters/render/render-client.js";
import {
  getGenerateDesignModelsResponseFormat,
} from "../../adapters/llm/response-formats/index.js";

import {
  parseDesignDiagramModelsResult,
} from "../../normalizers/design/design-model-normalizer.js";
import {
  collectModelRefs,
} from "@uml-platform/contracts";
import { formatParseError } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { readDiagramReviewCounters } from "../records/diagram-review-record.js";
import {
  isRunCancelled,
  RunCancelledError,
  throwIfRunCancelled,
} from "../records/run-cancellation.js";

import { DiagramReviewRenderError, reviewRenderedArtifact } from "./render/review-rendered-artifact.js";

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
  buildDesignStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const MAX_MODEL_REPAIR_ATTEMPTS = MAX_GENERATION_REPAIR_ATTEMPTS;
// Sequence generation already shares the artifact repair budget; do not multiply it in an outer retry loop.
const MAX_SEQUENCE_USE_CASE_RETRIES = 0;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
      }
    },
  );
  // Drain in-flight use cases before propagating cancellation or an unexpected failure.
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((result) => result.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return results;
}

function truncateTraceRawOutput(rawOutput: string) {
  if (rawOutput.length <= TRACE_RAW_OUTPUT_LIMIT) return rawOutput;
  return `${rawOutput.slice(0, TRACE_RAW_OUTPUT_LIMIT)}\n...[truncated ${rawOutput.length - TRACE_RAW_OUTPUT_LIMIT} chars]`;
}

type DesignModelTaskIdentity = {
  diagramKind?: DesignDiagramKind;
  modelId: string;
  subtaskId: string;
  subtaskLabel?: string;
};

function createLimitedLlmChunkEmitter(
  record: RunRecord,
  stage: RunStage,
  taskIdentity: DesignModelTaskIdentity,
  onActivity?: ModelTaskActivity,
  onBlankActivity?: ModelTaskActivity,
  repairRound?: number,
) {
  return createRunLlmChunkHandlers({
    record,
    stage,
    onActivity,
    onBlankActivity,
    ...taskIdentity,
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
  result: Pick<Awaited<ReturnType<typeof generateDesignModelsWithRepair>>, "models" | "designModelTraceability">,
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
  const siblingElementIds = new Set(collectModelRefs(sequenceModels.filter((candidate) => candidate !== selected)).refs.map((ref) => ref.elementId));
  const designModelTraceability = result.designModelTraceability
    // A response can contain sibling use-case models; renaming all their traces would fabricate local references.
    .filter((entry) => entry.source.diagramKind === "sequence" &&
      (entry.source.modelId ? entry.source.modelId === selected.modelId : !siblingElementIds.has(entry.source.elementId)))
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

// LLM structured output repair retries malformed design models while preserving trace schema.
export async function generateDesignModelsWithRepair(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  requirementModels: DiagramModelSpec[],
  selectedDiagrams: DesignDiagramKind[],
  initialPrompt: string,
  stage: RunStage,
  options: {
    modelRepairAttempts?: number;
    validateModels?: (models: DesignDiagramModelSpec[]) => void;
    subtaskId?: string;
    subtaskLabel?: string;
    upstreamDesignModels?: DesignDiagramModelSpec[];
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
  let lastErrorMessage = "";
  const traceStage =
    stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";

  // Repairs belong to the requested task, even when
  // the provider returns a different model id before sequence coercion.
  const repairIdentity = options.subtaskId ?? selectedDiagrams.join(",");
  const diagramKind = selectedDiagrams.length === 1 ? selectedDiagrams[0] : undefined;
  const taskIdentity: DesignModelTaskIdentity = {
    subtaskId: repairIdentity,
    modelId: repairIdentity,
    diagramKind,
    subtaskLabel: options.subtaskLabel ?? (diagramKind ? designDiagramLabel(diagramKind) : undefined),
  };

  const repair = new ModelGenerationConversation(repairIdentity, createMessages(initialPrompt), modelRepairAttempts);
  for (let attempt = 0; attempt <= modelRepairAttempts; attempt += 1) {
    if (attempt > 0 && readDiagramReviewCounters(record, repairIdentity, selectedDiagrams[0]).repairAttempts >= MAX_MODEL_REPAIR_ATTEMPTS) throw new Error("已达到共享 5 次结构修复上限");
    const repairRound = readDiagramReviewCounters(record, repairIdentity, diagramKind).repairAttempts + 1;
    const emitLimitedChunk = createLimitedLlmChunkEmitter(
      record,
      stage,
      taskIdentity,
      onActivity,
      onBlankActivity,
      attempt > 0 ? repairRound : undefined,
    );
    let content = await collectTextResult(
      llmTransport,
      providerSettings,
      repair.messages,
      emitLimitedChunk,
      responseFormat,
      abortSignal,
    );
    appendDesignTrace(record, {
      stage: traceStage,
      attempt: attempt + 1,
      kind: "llm_output",
      rawOutput: truncateTraceRawOutput(content),
    });

    try {
      content = repair.accept(content);
      const parsed = parseDesignDiagramModelsResult(content, requirementModels);
      validateSelectedModels(parsed.models);
      const filteredModels = parsed.models.filter((model) =>
        selectedDiagrams.includes(model.diagramKind),
      );
      const filteredDiagramKinds = new Set(filteredModels.map((model) => model.diagramKind));
      const filteredTraceability = parsed.designModelTraceability.filter((entry) =>
        filteredDiagramKinds.has(entry.source.diagramKind as DesignDiagramKind),
      );
      assertDesignMappings(filteredModels, [...requirementModels, ...options.upstreamDesignModels ?? []], filteredTraceability);
      appendDesignTrace(record, {
        stage: traceStage,
        attempt: attempt + 1,
        kind: "parsed_model",
        parsedData: {
          models: filteredModels,
          designModelTraceability: filteredTraceability,
        },
      });
      return { models: filteredModels, designModelTraceability: filteredTraceability, conversation: repair };
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

      if (attempt === modelRepairAttempts) {
        throw new Error(
          `${stage} structured output failed: ${lastErrorMessage}（已达到共享 ${modelRepairAttempts} 次修复上限）`,
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
          ...taskIdentity,
        }),
      );
      onActivity?.();

      repair.prepare(error);
    }
  }

  throw new Error(`${stage} structured output failed: ${lastErrorMessage}（已达到共享 ${modelRepairAttempts} 次修复上限）`);
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

function sourceRequirementKindsForDesign(
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
): DiagramKind[] {
  return [...(designRequirementSources[diagramKind] ?? [])];
}

function findRequirementModelsForDesign(
  models: DiagramModelSpec[],
  diagramKind: Exclude<DesignDiagramKind, "sequence">,
) {
  const sourceKinds = sourceRequirementKindsForDesign(diagramKind);
  if (sourceKinds.length === 0) {
    return [];
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
) {
  const snapshot = record.snapshot as DesignRunSnapshot;
  llmTransport = withRunReasoning(llmTransport, snapshot.reasoning);
  throwIfRunCancelled(record);
  if (!snapshot.requirementBaseline) {
    throw new Error("设计生成缺少当前需求基线，无法兼容旧设计快照结构");
  }
  const requirementBaseline = snapshot.requirementBaseline;
  assertRequirementBaselineAllowsDownstream(requirementBaseline);

  const stages = createStageLifecycle(record);
  const updateStage = (stage: RunStage, message?: string) => {
    throwIfRunCancelled(record);
    snapshot.currentStage = stage;
    snapshot.status = "running";
    emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
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
  const renderDesignModelArtifact = async <T extends DesignDiagramModelSpec>(model: T, traceability: typeof designModelTraceability, generation: {
    conversation: ModelGenerationConversation;
    requirementModels: DiagramModelSpec[];
    upstreamDesignModels: DesignDiagramModelSpec[];
  }) => {
    throwIfRunCancelled(record);
    try {
      const upstreamModels = [...generation.requirementModels, ...generation.upstreamDesignModels];
      const modelTrace = (candidate: DesignDiagramModelSpec, value: unknown) => designModelTraceabilityEntrySchema.array().parse(value)
        .filter(entry => entry.source.diagramKind === candidate.diagramKind && (!candidate.modelId || entry.source.modelId === candidate.modelId));
      const checked = await reviewRenderedArtifact({
        record, providerSettings, llmTransport, renderClient, model, mutable: true,
        basis: { stage: "design", baseline: snapshot.requirementBaseline,
          upstreamModels,
          traceability, requirementTraceability: snapshot.requirementModelTraceability },
        validateTraceability: (candidate, value) => assertDesignMappings([candidate as DesignDiagramModelSpec], upstreamModels, modelTrace(candidate as DesignDiagramModelSpec, value)),
        generationRepair: {
          conversation: generation.conversation.fork(model.modelId ?? model.diagramKind),
          parse: (raw, current) => {
            let parsed = parseDesignDiagramModelsResult(raw, generation.requirementModels);
            if (current.diagramKind === "sequence") {
              const source = generation.requirementModels.find(source => source.diagramKind === "usecase");
              const useCase = source && useCasesFromModel(source).find(useCase => useCase.id === current.sourceUseCaseId);
              if (!useCase) throw new Error("修复对象的上游用例不存在");
              parsed = coerceSequenceModelForUseCase(parsed, useCase);
            }
            const candidates = parsed.models.filter(candidate => candidate.diagramKind === current.diagramKind && candidate.modelId === current.modelId);
            if (candidates.length !== 1 || parsed.models.length !== 1) throw new Error("结构修复必须只返回当前模型并保持模型 ID");
            const candidate = candidates[0]!;
            const sources = modelTrace(candidate, parsed.designModelTraceability);
            assertDesignMappings([candidate], upstreamModels, sources);
            return { model: candidate, traceability: sources };
          },
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
        diagramErrors[model.diagramKind === "sequence" ? model.modelId ?? `sequence:${model.sourceUseCaseId}` : model.diagramKind] = diagramErrorSchema.parse({ stage: "verify_diagram_visual", error: runError });
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
  const selectedDiagramsRequireUseCase = selectedDesignDiagrams.has("sequence");
  const useCaseModel = findRequirementModel(snapshot.requirementModels, "usecase");
  if (!useCaseModel && selectedDiagramsRequireUseCase) {
    throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少需求阶段用例模型，无法生成用例实现设计"));
  }

  let sequenceModels = useCaseModel
    ? existingSequenceModelsForUseCases(models, useCaseModel)
    : [];
  const shouldGenerateSequence = selectedDesignDiagrams.has("sequence");
  const sequenceTargets = new Set(snapshot.sequenceTargetUseCaseIds ?? []);
  const modelTaskTimeoutConfig = readDesignModelTaskTimeoutConfig();

  const generateSequenceModels = async () => {
    if (!shouldGenerateSequence) return;
    if (!useCaseModel) {
      throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "缺少需求阶段用例模型，无法生成用例实现设计"));
    }
    updateStage("generate_design_sequence", "正在生成用例实现设计");
    const targetUseCases = useCasesFromModel(useCaseModel).filter(useCase => !sequenceTargets.size || sequenceTargets.has(useCase.id));
    if (sequenceTargets.size && targetUseCases.length !== sequenceTargets.size) throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "待重试的用例已不存在，请从当前工作区重新生成。"));
    const sequenceRunErrors: ReturnType<typeof normalizeRunError>[] = [];

    const sequenceResults = await mapWithConcurrency(
      targetUseCases,
      readDesignSequenceConcurrency(),
      async (useCase) => {
        throwIfRunCancelled(record);
        const modelId = sequenceModelIdForUseCase(useCase);
        const scopedUseCaseModel = scopeUseCaseModelForPrompt(
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
                [scopedUseCaseModel, ...scopedAnalysisModels],
                ["sequence"],
                buildGenerateDesignSequencePrompt(
                  requirementBaseline,
                  scopedUseCaseModel,
                  scopedAnalysisModels,
                  useCase.id,
                ),
                "generate_design_sequence",
                { subtaskId: modelId, subtaskLabel: `用例实现设计：${useCase.name}`, validateModels: (models) => { for (const model of models) if (model.diagramKind === "sequence") assertSequenceDiffersFromRequirementAnalysis(model, scopedAnalysisModels); } },
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
            result.models = await Promise.all(result.models.map((model) => renderDesignModelArtifact(model, result.designModelTraceability, {
              conversation: rawResult.conversation, requirementModels: [scopedUseCaseModel, ...scopedAnalysisModels], upstreamDesignModels: [],
            })));
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
      },
    );
    throwIfRunCancelled(record);
    const generatedSequences = sequenceResults.flatMap((result) => result?.models ?? []).filter(
      (model): model is Extract<DesignDiagramModelSpec, { diagramKind: "sequence" }> =>
        model.diagramKind === "sequence",
    );
    if (generatedSequences.length === 0) {
      throwRunError(
        sequenceRunErrors[0] ??
          createRunError(
            "RUN_MODEL_OUTPUT_EMPTY",
            "用例实现设计未生成有效结果，请重试或检查模型输出。",
          ),
      );
    }
    // A scoped retry replaces only requested instances, preserving every accepted sibling and its provenance.
    sequenceModels = sequenceTargets.size ? mergeDesignModels(sequenceModels, generatedSequences).filter((model): model is SequenceDesignModel => model.diagramKind === "sequence") : generatedSequences;
    const missingUseCaseSequences = validateUseCaseSequenceCoverage(
      sequenceModels,
      useCaseModel,
    ).filter(useCase => !sequenceTargets.size || sequenceTargets.has(useCase.id));
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
        (entry) => entry.source.diagramKind !== "sequence" || (sequenceTargets.size > 0 && !sequenceTargets.has((entry.source.modelId ?? "").replace(/^sequence:/, ""))),
      ),
      ...sequenceResults.flatMap((result) => result?.designModelTraceability ?? []),
    ];
    publishDesignModelSnapshot();
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
  };

  const requestedDownstream = selectedDownstreamDiagrams;

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
    if (sourceModels.length === sourceKinds.length) {
      return true;
    }
    const sourceKind = sourceKinds.find((kind) => !sourceModels.some((model) => model.diagramKind === kind));
    const dependencyError = createRunError(
      "RUN_DEPENDENCY_MISSING",
      sourceKind
        ? `缺少需求阶段${requirementDiagramLabel(sourceKind)}，无法生成${designDiagramLabel(diagram)}`
        : `缺少上游设计来源，无法生成${designDiagramLabel(diagram)}`,
    );
    markDesignDependencyError(diagram, dependencyError.message);
    return false;
  });

  const generateDownstreamModels = async () => {
    if (downstreamWithSources.length === 0) return;
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
            { subtaskId: diagram, subtaskLabel: designDiagramLabel(diagram), upstreamDesignModels: [...(diagram === "class" ? sequenceModels : []), ...designContextModels] },
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
        result.models = await Promise.all(result.models.map((model) => renderDesignModelArtifact(model, result.designModelTraceability, {
          conversation: result.conversation, requirementModels: sourceModels,
          upstreamDesignModels: [...(diagram === "class" ? sequenceModels : []), ...designContextModels],
        })));
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
      const result = await generateDownstreamDiagram(diagram, designContextModels);
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
    const settled = await Promise.allSettled(downstreamWithSources.map(schedule));
    const rejected = settled.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
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
  };

  // Sequence models and the structural DAG share requirement inputs, but have no mutual dependency.
  // Finish each stage independently and drain both branches before reporting a failure/cancellation.
  const runBranch = async (stage: RunStage, generate: () => Promise<void>) => {
    try {
      await generate();
      stages.finish(stage);
    } catch (error) {
      stages.finish(stage, isRunCancelled(record) ? "cancelled" : "failed");
      throw error;
    }
  };
  const branches = await Promise.allSettled([
    runBranch("generate_design_sequence", generateSequenceModels),
    runBranch("generate_design_models", generateDownstreamModels),
  ]);
  throwIfRunCancelled(record);
  const rejectedBranch = branches.find((result) => result.status === "rejected");
  if (rejectedBranch?.status === "rejected") throw rejectedBranch.reason;

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

  const missingOutputs = missingRequestedModelOutputs(snapshot);
  if (missingOutputs.length) {
    const failedTarget = Object.entries(snapshot.diagramErrors).find(([key]) => missingOutputs.some(target => target.split(":")[0] === key.split(":")[0]))?.[1]?.error;
    if (failedTarget) throwRunError(failedTarget);
    throwRunError(createRunError("RUN_MODEL_OUTPUT_EMPTY", "请求的模型未全部生成：" + missingOutputs.join("、"), { details: { missingTargets: missingOutputs } }));
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
