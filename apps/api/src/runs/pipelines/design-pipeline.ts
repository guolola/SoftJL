// Orchestrates design-model generation, PlantUML, and SVG rendering for design runs.
import { generateWithModelConversation } from "./shared/model-generation-session.js";
import { assertGeneratedModelCandidate } from "../../normalizers/modeling/model-candidate-validation.js";
import { assertDesignMappings } from "../../normalizers/traceability/model-mapping-validation.js";
import { generateDesignPlantUmlArtifacts } from "../../adapters/plantuml/model-renderer.js";
import { missingRequestedModelOutputs } from "../records/run-output-provenance.js";

import { createStageLifecycle } from "./shared/stage-lifecycle.js";
import { withRunReasoning } from "./shared/run-reasoning.js";
import {
  designRequirementSources,
  designDependencies,
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
  GENERATE_DESIGN_MODELS_RESPONSE_FORMAT,
} from "../../adapters/llm/response-formats/index.js";

import {
  parseDesignDiagramModelsResult,
} from "../../normalizers/design/design-model-normalizer.js";
import {
  collectModelRefs,
} from "@uml-platform/contracts";
import { formatParseError } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";

import {
  isRunCancelled,
  RunCancelledError,
  throwIfRunCancelled,
} from "../records/run-cancellation.js";

import { DiagramReviewRenderError, reviewRenderedArtifact } from "./render/review-rendered-artifact.js";

import { stageProgressValue } from "./shared/pipeline-events.js";

import {
  assertRequirementBaselineAllowsDownstream,
} from "../baselines/requirement-baseline.js";

import {
  withModelTaskTimeout,
  type ModelTaskActivity,
} from "./shared/model-task-timeout.js";
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

// Sequence generation already shares the artifact repair budget; do not multiply it in an outer retry loop.
const MAX_SEQUENCE_USE_CASE_RETRIES = 0;
const DEFAULT_DESIGN_SEQUENCE_CONCURRENCY = 2;
const DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TASK_MAX_RUNTIME_MS = 1_200_000;
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

function validateUseCaseSequenceCoverage(
  sequenceModels: SequenceDesignModel[],
  useCaseModel: DiagramModelSpec,
) {
  const useCases = useCasesFromModel(useCaseModel);
  const covered = new Set(sequenceModels.map((model) => model.sourceUseCaseId));
  return useCases.filter((useCase) => !covered.has(useCase.id));
}

// One conversation owns generation and backend validation before backend rendering for each design task.
export async function generateDesignModelsWithRepair(
  record: RunRecord, providerSettings: ProviderSettings, llmTransport: LlmTransport,
  requirementModels: DiagramModelSpec[], selectedDiagrams: DesignDiagramKind[], stage: RunStage,
  options: { modelRepairAttempts?: number;
    subtaskId?: string; subtaskLabel?: string; sourceUseCaseId?: string; upstreamDesignModels?: DesignDiagramModelSpec[] } = {},
  onActivity?: ModelTaskActivity, onBlankActivity?: ModelTaskActivity, abortSignal?: AbortSignal,
) {
  const requirementKinds = new Set(selectedDiagrams.flatMap(kind => designRequirementSources[kind] ?? []));
  const designKinds = new Set(selectedDiagrams.flatMap(kind => [...designDependencies[kind] ?? [], ...(kind === "class" ? ["sequence"] : [])]));
  const boundRequirements = structuredClone(requirementModels.filter(model => requirementKinds.has(model.diagramKind)))
    .filter(model => !options.sourceUseCaseId || model.diagramKind !== "analysis" ||
      model.sourceUseCaseId === options.sourceUseCaseId || model.modelId === `analysis:${options.sourceUseCaseId}`)
    .map(model => options.sourceUseCaseId && model.diagramKind === "usecase" ? scopeUseCaseModelForPrompt(model, options.sourceUseCaseId) : model);
  const boundDesigns = structuredClone((options.upstreamDesignModels ?? []).filter(model => designKinds.has(model.diagramKind)));
  const upstream = [...boundRequirements, ...boundDesigns];
  const useCaseModel = boundRequirements.find(model => model.diagramKind === "usecase");
  if (selectedDiagrams.includes("sequence") && !useCaseModel) throw new Error("用例实现设计缺少绑定的用例模型");
  if (!upstream.length) throw new Error("生成任务缺少绑定的上游来源");
  // A single task binding drives every channel; the baseline stays in backend metadata.
  const prompt = selectedDiagrams.length === 1 && selectedDiagrams[0] === "sequence"
    ? buildGenerateDesignSequencePrompt(useCaseModel!, boundRequirements.filter(model => model.diagramKind === "analysis"), options.sourceUseCaseId)
    : buildGenerateDesignModelsPrompt(boundRequirements, boundDesigns.filter(model => model.diagramKind === "sequence"), selectedDiagrams,
      boundDesigns.filter(model => model.diagramKind !== "sequence"));
  const existingMappings = structuredClone((record.snapshot as DesignRunSnapshot).designModelTraceability);
  const format = structuredClone(GENERATE_DESIGN_MODELS_RESPONSE_FORMAT);
  const models = (format.json_schema.schema.properties as any).models;
  models.minItems = models.maxItems = selectedDiagrams.length;
  const items = models.items;
  items.anyOf = items.anyOf.filter((variant: any) => selectedDiagrams.includes(variant.properties.diagramKind.enum[0]));
  return generateWithModelConversation<ReturnType<typeof parseDesignDiagramModelsResult>>({
    record, providerSettings, transport: llmTransport, stage,
    targetId: options.subtaskId ?? selectedDiagrams.join(","), diagramKind: selectedDiagrams.length === 1 ? selectedDiagrams[0] : undefined,
    label: options.subtaskLabel, prompt, schema: format,
    compile: result => { generateDesignPlantUmlArtifacts(result.models, "schema"); },
    maxRepairs: options.modelRepairAttempts, onActivity, onBlankActivity, abortSignal,
    validate: raw => {
      assertGeneratedModelCandidate(raw, { stage: "design", kinds: selectedDiagrams, upstream,
        existingMappings });
      const parsed = parseDesignDiagramModelsResult(raw, upstream);
      return parsed;
    },
    onCandidate: (raw, attempt, error, parsed) => {
      const traceStage = stage === "generate_design_sequence" ? "generate_design_sequence" : "generate_design_models";
      appendDesignTrace(record, { stage: traceStage, attempt, kind: "llm_output", rawOutput: truncateTraceRawOutput(raw) });
      appendDesignTrace(record, { stage: traceStage, attempt, kind: error ? "parse_error" : "parsed_model",
        ...(error ? { rawOutput: truncateTraceRawOutput(raw), errorMessage: formatParseError(error) } : { parsedData: parsed }) });
    },
  });
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
    requirementModels: DiagramModelSpec[];
    upstreamDesignModels: DesignDiagramModelSpec[];
  }) => {
    throwIfRunCancelled(record);
    try {
      const upstreamModels = [...generation.requirementModels, ...generation.upstreamDesignModels];
      const modelTrace = (candidate: DesignDiagramModelSpec, value: unknown) => designModelTraceabilityEntrySchema.array().parse(value)
        .filter(entry => entry.source.diagramKind === candidate.diagramKind && (!candidate.modelId || entry.source.modelId === candidate.modelId));
      const checked = await reviewRenderedArtifact({
        record, providerSettings, llmTransport, renderClient, model, mutable: false,
        basis: { stage: "design", baseline: snapshot.requirementBaseline,
          upstreamModels,
          traceability, requirementTraceability: snapshot.requirementModelTraceability },
        validateTraceability: (candidate, value) => assertDesignMappings([candidate as DesignDiagramModelSpec], upstreamModels, modelTrace(candidate as DesignDiagramModelSpec, value)),

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
                "generate_design_sequence",
                { subtaskId: modelId, subtaskLabel: `用例实现设计：${useCase.name}`, sourceUseCaseId: useCase.id },
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
            result.models = await Promise.all(result.models.map((model) => renderDesignModelArtifact(model, result.designModelTraceability, {
              requirementModels: [scopedUseCaseModel, ...scopedAnalysisModels], upstreamDesignModels: [],
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
          requirementModels: sourceModels,
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
