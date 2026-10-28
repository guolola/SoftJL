// Orchestrates requirement extraction, model generation, PlantUML, and SVG rendering.
import { generateWithModelConversation } from "./shared/model-generation-session.js";
import { assertGeneratedModelCandidate, assertAnalysisMappings } from "../../normalizers/modeling/model-candidate-validation.js";
import { assertRequirementMappings } from "../../normalizers/traceability/model-mapping-validation.js";
import { generatePlantUmlArtifacts } from "../../adapters/plantuml/model-renderer.js";
import { missingRequestedModelOutputs } from "../records/run-output-provenance.js";
import { getStageModelSchema, getModelReviewProfile, generationResponseSchema } from "@uml-platform/contracts";

import { createStageLifecycle } from "./shared/stage-lifecycle.js";
import { screenRequirementInput } from "./requirements/input-screening.js";
import { extractRequirementRulesWithRepair } from "./requirements/extract-requirement-rules.js";
import { prepareRequirementInput } from "./requirements/prepare-requirement-input.js";
import type { RequirementSourceUnit } from "../../normalizers/requirements/requirement-source-units.js";
import { withRequirementTokenUsage } from "../records/requirement-token-usage.js";
import { withRunReasoning } from "./shared/run-reasoning.js";
import {
  artifactReadyRunEventSchema,
  requirementModelTraceabilityEntrySchema,
  completedRunEventSchema,
  diagramErrorSchema,
  stageProgressRunEventSchema,
  stageStartedRunEventSchema,
  snapshotInputFingerprint,
  type DiagramError,
  type DiagramKind,
  type DiagramModelSpec,
  type PlantUmlArtifact,
  type ProviderSettings,
  type RequirementModelTraceabilityEntry,
  type RequirementRule,
  type RunSnapshot,
  type RunStage,
  type SvgArtifact,
} from "@uml-platform/contracts";
import {
  buildGenerateRequirementAnalysisPrompt,
  buildGenerateModelsPrompt,
  scopeUseCaseModelForPrompt,
} from "@uml-platform/prompts";
import { type LlmTransport } from "../../adapters/llm/llm-transport.js";
import { type RenderClient } from "../../adapters/render/render-client.js";
import {
  GENERATE_MODELS_RESPONSE_FORMAT,
} from "../../adapters/llm/response-formats/index.js";

import {
  parseGeneratedAnalysisModels,
  parseRequirementDiagramModelsResult,
} from "../../normalizers/requirements/requirement-model-normalizer.js";

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
  withModelTaskTimeout,
  type ModelTaskActivity,
} from "./shared/model-task-timeout.js";

import { appendRequirementTrace } from "./shared/trace-events.js";
import { createRunError, normalizeRunError, throwRunError } from "./shared/errors.js";
import {
  assertRequirementBaselineAllowsDownstream,
  buildEmptyRequirementBaseline,
  buildRequirementBaseline,
  reconcileExtractedRuleIds,
} from "../baselines/requirement-baseline.js";
import {
  buildRequirementStageTrustedChain,
} from "../traceability/trusted-chain-traceability.js";

const DEFAULT_REQUIREMENT_ANALYSIS_CONCURRENCY = 2;
const DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS = 300_000;
const DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL_TASK_MAX_RUNTIME_MS = 1_200_000;

function positiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compactText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
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
  await Promise.all(workers);
  return results;
}

function readRequirementAnalysisConcurrency() {
  const runConcurrency = positiveIntegerEnv(
    process.env.UML_LLM_RUN_CONCURRENCY,
    DEFAULT_REQUIREMENT_ANALYSIS_CONCURRENCY,
  );
  return positiveIntegerEnv(
    process.env.UML_REQUIREMENT_ANALYSIS_CONCURRENCY,
    runConcurrency,
  );
}

function readRequirementModelTaskTimeoutConfig() {
  const globalIdleTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_TIMEOUT_MS,
    DEFAULT_MODEL_TASK_IDLE_TIMEOUT_MS,
  );
  const idleTimeoutMs = positiveIntegerEnv(
    process.env.UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS,
    globalIdleTimeout,
  );
  const globalBlankOutputTimeout = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, DEFAULT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS),
  );
  const blankOutputTimeoutMs = positiveIntegerEnv(
    process.env.UML_REQUIREMENT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
    Math.min(idleTimeoutMs, globalBlankOutputTimeout),
  );
  const globalMaxRuntime = positiveIntegerEnv(
    process.env.UML_MODEL_TASK_MAX_RUNTIME_MS,
    DEFAULT_MODEL_TASK_MAX_RUNTIME_MS,
  );
  const maxRuntimeMs = positiveIntegerEnv(
    process.env.UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS,
    globalMaxRuntime,
  );
  return { idleTimeoutMs, blankOutputTimeoutMs, maxRuntimeMs };
}

function useCasesFromModel(useCaseModel: DiagramModelSpec) {
  return useCaseModel.diagramKind === "usecase" ? useCaseModel.useCases : [];
}

function useCaseHasEventFlows(useCase: UseCaseForAnalysis) {
  return Array.isArray(useCase.eventFlows) && useCase.eventFlows.length > 0;
}

type UseCaseForAnalysis = ReturnType<typeof useCasesFromModel>[number];
type AnalysisRequirementModel = Extract<DiagramModelSpec, { diagramKind: "analysis" }>;

function requirementModelId(model: DiagramModelSpec) {
  return compactText((model as unknown as { modelId?: string }).modelId) || model.diagramKind;
}

function requirementArtifactKey(
  artifact: Pick<PlantUmlArtifact | SvgArtifact, "diagramKind" | "modelId">,
) {
  return compactText(artifact.modelId) || artifact.diagramKind;
}

function replaceRequirementPlantUmlArtifact(
  artifacts: PlantUmlArtifact[],
  patch: PlantUmlArtifact,
) {
  const key = requirementArtifactKey(patch);
  return [...artifacts.filter((artifact) => requirementArtifactKey(artifact) !== key), patch];
}

function replaceRequirementSvgArtifact(
  artifacts: SvgArtifact[],
  patch: SvgArtifact,
) {
  const key = requirementArtifactKey(patch);
  return [...artifacts.filter((artifact) => requirementArtifactKey(artifact) !== key), patch];
}

function analysisModelIdForUseCase(useCase: UseCaseForAnalysis) {
  return `analysis:${useCase.id}`;
}

function mergeRequirementModels(
  current: DiagramModelSpec[],
  patch: DiagramModelSpec[],
) {
  const merged = new Map<string, DiagramModelSpec>();
  for (const model of [...current, ...patch]) {
    merged.set(requirementModelId(model), model);
  }
  return Array.from(merged.values());
}

function coerceAnalysisModelForUseCase(
  result: Pick<Awaited<ReturnType<typeof generateAnalysisModelWithRepair>>, "models" | "requirementModelTraceability">,
  useCase: UseCaseForAnalysis,
) {
  const analysisModels = result.models.filter(
    (model): model is AnalysisRequirementModel => model.diagramKind === "analysis",
  );
  const expectedModelId = analysisModelIdForUseCase(useCase);
  const selected = analysisModels.find((model) => model.sourceUseCaseId === useCase.id);
  if (!selected) {
    throw new Error(`${useCase.name}需求分析模型生成结果缺少对应的用例来源`);
  }

  const model: AnalysisRequirementModel = {
    ...selected,
    modelId: expectedModelId,
    sourceUseCaseId: useCase.id,
    sourceUseCaseName: useCase.name,
    title: selected.title?.trim() || `${useCase.name}需求分析模型`,
    summary:
      selected.summary?.trim() || `${useCase.name}用例事件流的需求阶段交互分析。`,
  };
  const requirementModelTraceability = result.requirementModelTraceability
    .filter((entry) => entry.target.diagramKind === "analysis")
    .map((entry) => ({
      ...entry,
      target: {
        ...entry.target,
        modelId: expectedModelId,
        diagramKind: "analysis" as const,
      },
    }));

  return {
    models: [model],
    requirementModelTraceability,
  };
}

async function generateAnalysisModelWithRepair(
  record: RunRecord, providerSettings: ProviderSettings, llmTransport: LlmTransport,
  scopedUseCaseModel: DiagramModelSpec, onActivity?: ModelTaskActivity, onBlankActivity?: ModelTaskActivity,
  abortSignal?: AbortSignal, promptOverride?: string,
): Promise<{ models: AnalysisRequirementModel[]; requirementModelTraceability: RequirementModelTraceabilityEntry[] }> {
  scopedUseCaseModel = structuredClone(scopedUseCaseModel);
  const sourceUseCase = scopedUseCaseModel.diagramKind === "usecase" ? scopedUseCaseModel.useCases[0] : undefined;
  const modelId = sourceUseCase ? analysisModelIdForUseCase(sourceUseCase) : "analysis";
  const result = await generateWithModelConversation<{ models: AnalysisRequirementModel[]; requirementModelTraceability: RequirementModelTraceabilityEntry[] }>({
    record, providerSettings, transport: llmTransport, stage: "generate_models", targetId: modelId,
    diagramKind: "analysis", label: sourceUseCase ? `需求分析模型：${sourceUseCase.name}` : "需求分析模型",
    prompt: promptOverride ?? buildGenerateRequirementAnalysisPrompt(scopedUseCaseModel),
    schema: requirementResponseSchema(["analysis"]),
    compile: result => { generatePlantUmlArtifacts(result.models, "requirements", "schema"); },
    onActivity, onBlankActivity, abortSignal,
    validate: raw => {
      assertGeneratedModelCandidate(raw, { stage: "requirements", kinds: ["analysis"], upstream: [scopedUseCaseModel] });
      const parsed = parseGeneratedAnalysisModels(raw);
      if (parsed.models.length !== 1 || parsed.models[0]?.diagramKind !== "analysis") throw new Error("单用例任务必须仅返回一个需求分析模型");
      const result = { models: parsed.models as AnalysisRequirementModel[], requirementModelTraceability: [] as RequirementModelTraceabilityEntry[] };
      return sourceUseCase ? coerceAnalysisModelForUseCase(result, sourceUseCase) : result;
    },
    onCandidate: (raw, attempt, error, parsed) => {
      appendRequirementTrace(record, { stage: "generate_models", attempt, kind: "llm_output", rawOutput: raw });
      appendRequirementTrace(record, { stage: "generate_models", attempt, kind: error ? "parse_error" : "parsed_model",
        ...(error ? { rawOutput: raw, errorMessage: formatParseError(error) } : { parsedData: parsed }) });
    },
  });
  return result;
}

function missingUseCasesForAnalysis(
  analysisModels: AnalysisRequirementModel[],
  useCaseModel: DiagramModelSpec,
  targetUseCaseIds = new Set<string>(),
) {
  const covered = new Set(analysisModels.map((model) => model.sourceUseCaseId));
  return useCasesFromModel(useCaseModel).filter(
    (useCase) =>
      (targetUseCaseIds.size === 0 || targetUseCaseIds.has(useCase.id)) &&
      !covered.has(useCase.id),
  );
}

function analysisTargetUseCaseIds(snapshot: RunSnapshot) {
  return new Set(
    (snapshot.analysisTargetUseCaseIds ?? [])
      .map((id) => compactText(id))
      .filter((id) => id.length > 0),
  );
}

function analysisModelMatchesTarget(
  model: AnalysisRequirementModel,
  targetUseCaseIds: Set<string>,
) {
  return targetUseCaseIds.has(model.sourceUseCaseId);
}

function validateUseCaseAnalysisCoverage(
  analysisModels: AnalysisRequirementModel[],
  useCaseModel: DiagramModelSpec,
  targetUseCaseIds = new Set<string>(),
) {
  const useCases = useCasesFromModel(useCaseModel).filter(
    (useCase) => targetUseCaseIds.size === 0 || targetUseCaseIds.has(useCase.id),
  );
  const missing = missingUseCasesForAnalysis(
    analysisModels,
    useCaseModel,
    targetUseCaseIds,
  );
  if (
    (targetUseCaseIds.size === 0 && analysisModels.length !== useCases.length) ||
    missing.length > 0
  ) {
    const preview = missing
      .slice(0, 8)
      .map((useCase) => `${useCase.id}:${useCase.name}`)
      .join("、");
    throw new Error(
      `需求分析模型必须为每个用例生成一个独立分析顺序图；缺少 ${missing.length} 个用例：${preview}`,
    );
  }
}


function buildCompactActivityModelPrompt(
  rules: RequirementRule[],
) {
  return [
    "请只生成需求阶段总体业务流程 activity 模型，使用与可行性分析一致的竖向泳道结构。每个 activity 的 actorOrLane 引用真实泳道，关系仅使用 control_flow；分支用 decision/merge，并行用 fork/join，循环用明确判断和回路。",
    "这是 activity 子任务超时后的精简重试：优先返回完整、合法、较小的 JSON，不要输出解释、Markdown 或代码块。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[...]}。",
    "models 必须且只能包含一个 diagramKind=\"activity\" 的模型。",
    "直接上游与映射依据：下方需求规则是本次生成的唯一业务依据，也是 requirementModelTraceability.ruleId 的唯一引用范围；结构规则不是业务事实。",
    `当前阶段的字段与枚举：${JSON.stringify(generationResponseSchema(getStageModelSchema("requirements", "activity")!))}`,
    ...getModelReviewProfile("requirements", "activity").structure,
    "只使用控制流，端点必须引用真实节点。同名动作、循环、并发和业务条件不能合并或替换。",
    "requirementModelTraceability 必须与模型同时返回，每个业务元素和业务关系至少有一条真实规则来源；没有来源的业务元素不得生成，禁止按类别或位置猜测关联。",
    "",
    "Activity 相关规则：",
    JSON.stringify(rules, null, 2),
  ].join("\n");
}

function buildCompactAnalysisModelPrompt(useCase: UseCaseForAnalysis, scopedUseCaseModel: DiagramModelSpec) {
  const compactUseCase = {
    id: useCase.id,
    name: useCase.name,
    goal: useCase.goal,
    preconditions: useCase.preconditions,
    postconditions: useCase.postconditions,
    eventFlows: useCase.eventFlows,
  };
  return [
    "请只为单个用例生成需求分析顺序图 analysis 模型。",
    "这是 analysis 子任务超时后的精简重试：优先返回完整、合法、较小的 JSON，不要输出解释、Markdown 或代码块。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[]}。",
    "models 必须且只能包含一个 diagramKind=\"analysis\" 的模型。",
    "直接上游与映射依据：下方完整用例模型是唯一直接上游，也是所有 sourceElementIds 的唯一引用范围；目标用例摘要不是另一份上游。结合目标、参与者、前后置条件和事件流理解业务，禁止引用原始需求规则或未提供的模型。",
    `analysis 模型必须使用 modelId=\"${analysisModelIdForUseCase(useCase)}\"、sourceUseCaseId=\"${useCase.id}\"、sourceUseCaseName=\"${useCase.name}\"。`,
    "analysis 模型字段必须包含 diagramKind, modelId, sourceUseCaseId, sourceUseCaseName, title, summary, notes, participants, messages, fragments。",
    `字段与枚举：${JSON.stringify(generationResponseSchema(getStageModelSchema("requirements", "analysis")!))}`,
    ...getModelReviewProfile("requirements", "analysis").structure,
    "消息数量以完整表达目标用例为准，不为缩短输出删除主成功场景、明确的业务条件、备选、异常或系统响应；sourceId/targetId 必须引用真实参与对象。使用 actor/boundary/control/entity 业务职责和业务语义消息，不引入 Service、Repository、数据库或具体方法调用。",
    "每个带 id 的元素，包括 participants、messages、fragments、branches、activations，必须填写非空 sourceElementIds 并引用输入用例模型中的真实元素 id；步骤没有独立 id 时引用所属事件流 id，不得使用 order 顺序号、名称或数组位置代替。",
    "存在不同执行路径时使用相应条件片段，不能为缩短输出省略分支；无分支业务的 fragments 可以为空数组。片段 messageIds 引用真实消息。",
    "requirementModelTraceability 固定返回 []。",
    "",
    "单个用例上下文：",
    JSON.stringify(compactUseCase, null, 2),
    "关联用例仅作为参考，沿 include/extend/generalization 保留其事件流和异常；只能输出上述目标用例的一个 analysis 模型。",
    "完整用例来源：",
    JSON.stringify(scopedUseCaseModel),
  ].join("\n");
}

function isProviderTimeout(runError: ReturnType<typeof normalizeRunError>) {
  return (
    runError.code === "PLATFORM_PROVIDER_TIMEOUT" ||
    runError.message.includes("长时间无有效输出") ||
    runError.message.includes("响应超时")
  );
}

// JSON responses and local validation share the current model contracts.
function requirementResponseSchema(selectedDiagrams: DiagramKind[]) {
  const schema = structuredClone(GENERATE_MODELS_RESPONSE_FORMAT);
  const models = (schema.json_schema.schema.properties as any).models;
  models.minItems = models.maxItems = selectedDiagrams.length;
  const items = models.items;
  items.anyOf = items.anyOf.filter((variant: any) => selectedDiagrams.includes(variant.properties.diagramKind.enum[0]));
  return schema;
}

export async function generateModelsWithRepair(
  record: RunRecord, providerSettings: ProviderSettings, llmTransport: LlmTransport,
  rules: RequirementRule[], selectedDiagrams: DiagramKind[],
  promptOverride?: string, onActivity?: ModelTaskActivity, onBlankActivity?: ModelTaskActivity, abortSignal?: AbortSignal,
) {
  rules = structuredClone(rules);
  const existingMappings = structuredClone((record.snapshot as RunSnapshot).requirementModelTraceability);
  return generateWithModelConversation<ReturnType<typeof parseRequirementDiagramModelsResult>>({
    record, providerSettings, transport: llmTransport, stage: "generate_models",
    targetId: selectedDiagrams.join(","), diagramKind: selectedDiagrams.length === 1 ? selectedDiagrams[0] : undefined,
    prompt: promptOverride ?? buildGenerateModelsPrompt(rules, selectedDiagrams),
    schema: requirementResponseSchema(selectedDiagrams),
    compile: result => { generatePlantUmlArtifacts(result.models, "requirements", "schema"); },
    onActivity, onBlankActivity, abortSignal,
    validate: raw => {
      assertGeneratedModelCandidate(raw, { stage: "requirements", kinds: selectedDiagrams, rules,
        existingMappings });
      const parsed = parseRequirementDiagramModelsResult(raw, rules);
      return parsed;
    },
    onCandidate: (raw, attempt, error, parsed) => {
      appendRequirementTrace(record, { stage: "generate_models", attempt, kind: "llm_output", rawOutput: raw });
      appendRequirementTrace(record, { stage: "generate_models", attempt, kind: error ? "parse_error" : "parsed_model",
        ...(error ? { rawOutput: raw, errorMessage: formatParseError(error) } : { parsedData: parsed }) });
    },
  });
}

// route -> pipeline -> record store contract: this pipeline mutates the run snapshot and emits stage/artifact events.
export async function runStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as RunSnapshot;
  llmTransport = withRequirementTokenUsage(record, providerSettings.model, llmTransport);
  llmTransport = withRunReasoning(llmTransport, snapshot.reasoning);

  const stages = createStageLifecycle(record);
  const updateStage = (stage: RunStage, message?: string) => {
    throwIfRunCancelled(record);
    stages.advance(stage);
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

  let rules: RequirementRule[] = [...snapshot.rules];
  let models: DiagramModelSpec[] = [...snapshot.models];
  let requirementModelTraceability: RunSnapshot["requirementModelTraceability"] = [
    ...snapshot.requirementModelTraceability,
  ];
  let plantUml: PlantUmlArtifact[] = [...snapshot.plantUml];
  let svgArtifacts: SvgArtifact[] = [...snapshot.svgArtifacts];
  const renderFailures: string[] = [];
  let diagramErrors: Record<string, DiagramError> = {};

  const renderRequirementModelArtifact = async <T extends DiagramModelSpec>(model: T, traceability: typeof requirementModelTraceability) => {
    throwIfRunCancelled(record);
    try {
      const modelTrace = (candidate: DiagramModelSpec, value: unknown) => requirementModelTraceabilityEntrySchema.array().parse(value)
        .filter(entry => entry.target.diagramKind === candidate.diagramKind && (!candidate.modelId || entry.target.modelId === candidate.modelId));
      const checked = await reviewRenderedArtifact({
        record, providerSettings, llmTransport, renderClient, model, mutable: false,
        basis: { stage: "requirements", baseline: snapshot.requirementBaseline, rules: snapshot.rules,
          upstreamModels: models, traceability },
        validateTraceability: (candidate, value) => {
          if (candidate.diagramKind === "analysis") assertAnalysisMappings(candidate, models.filter(model => model.diagramKind === "usecase"));
          else assertRequirementMappings([candidate as DiagramModelSpec], snapshot.rules, modelTrace(candidate as DiagramModelSpec, value));
        },

      });
      throwIfRunCancelled(record);
      // Publish the accepted tuple together; rejected candidates stay private.
      models = mergeRequirementModels(models, [checked.model as DiagramModelSpec]);
      const acceptedTrace = (checked.traceability ?? traceability) as typeof requirementModelTraceability;
      requirementModelTraceability = [...requirementModelTraceability.filter((entry) => model.modelId ? entry.target.modelId !== model.modelId : entry.target.diagramKind !== model.diagramKind), ...acceptedTrace.filter((entry) => model.modelId ? entry.target.modelId === model.modelId : entry.target.diagramKind === model.diagramKind)];
      snapshot.models = models; snapshot.requirementModelTraceability = requirementModelTraceability;
      plantUml = replaceRequirementPlantUmlArtifact(plantUml, checked.rendered.artifact as PlantUmlArtifact);
      svgArtifacts = replaceRequirementSvgArtifact(svgArtifacts, checked.rendered.svgArtifact as SvgArtifact);
      snapshot.plantUml = plantUml; snapshot.svgArtifacts = svgArtifacts;
      snapshot.visualReviews[model.modelId ?? model.diagramKind] = checked.review;
      appendRequirementTrace(record, { stage: "generate_plantuml", attempt: 1, kind: "plantuml_source", diagramKind: model.diagramKind, plantUmlSource: checked.rendered.artifact.source });
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
        diagramErrors[model.diagramKind === "analysis" ? model.modelId ?? `analysis:${model.sourceUseCaseId}` : model.diagramKind] = diagramErrorSchema.parse({ stage: "verify_diagram_visual", error: runError });
        snapshot.diagramErrors = diagramErrors; throwRunError(runError);
      }
      throw error;
    }
  };

  throwIfRunCancelled(record);
  if (rules.length === 0 || snapshot.selectedDiagrams.length === 0) {
    updateStage("extract_rules", "正在抽取需求规则");
    const timeoutConfig = readRequirementModelTaskTimeoutConfig();
    // Build an isolated source candidate; publish text and rules together only after validation succeeds.
    const sourceFingerprint = () => snapshotInputFingerprint({ requirementText: snapshot.requirementText,
      submittedRequirementText: snapshot.submittedRequirementText, attachments: snapshot.attachments });
    const pinnedSource = sourceFingerprint();
    const preparedInput = prepareRequirementInput(snapshot);
    const { sourceText } = preparedInput;
    throwIfRunCancelled(record);
    let screenedText: string;
    let sourceUnits: RequirementSourceUnit[];
    try {
      const screening = await withModelTaskTimeout(
        (markActivity, _markBlankActivity, abortSignal) =>
          screenRequirementInput(sourceText, providerSettings, llmTransport, abortSignal, markActivity, preparedInput),
        {
          ...timeoutConfig,
          label: "需求输入预检",
          isCancelled: () => isRunCancelled(record),
          createCancelError: () => new RunCancelledError(snapshot.runId),
        },
      );
      throwIfRunCancelled(record);
      snapshot.inputScreening = { ignoredSpans: screening.ignoredSpans };
      if (screening.unsafeSpans.length > 0) {
        const first = screening.unsafeSpans[0]!;
        const line = sourceText.slice(0, first.startOffset).split(/\r?\n/u).length;
        throwRunError(createRunError("RUN_REQUIREMENT_INPUT_UNSAFE", undefined, {
          params: { line },
          details: { line, ...first },
        }));
      }
      if (!screening.hasRequirement || !screening.acceptedText.trim()) {
        throwRunError(createRunError("RUN_REQUIREMENT_INPUT_IRRELEVANT"));
      }
      screenedText = screening.acceptedText;
      sourceUnits = screening.acceptedUnits;
    } catch (error) {
      if (isRunCancelled(record) || error instanceof RunCancelledError) throw error;
      if (error instanceof Error && "runError" in error) throw error;
      // Preserve actionable provider failures instead of masking them as invalid screening output.
      const normalized = normalizeRunError(error);
      if (normalized.category === "platform_provider") throwRunError(normalized);
      throwRunError(createRunError("RUN_REQUIREMENT_SCREENING_FAILED"));
    }
    // Screening and extraction must bind the same originals, including image bytes.
    if (sourceFingerprint() !== pinnedSource) throw new Error("需求来源已变化，请重新发起抽取");
    const ruleResult = await withModelTaskTimeout(
      (markActivity, markBlankActivity, abortSignal) =>
        extractRequirementRulesWithRepair({
          record,
          requirementText: screenedText,
          sourceText,
          sourceUnits,
          images: preparedInput.images.filter(image => sourceUnits.some(unit => unit.id === image.unitId)),
          providerSettings,
          llmTransport,
          onActivity: markActivity,
          onBlankActivity: markBlankActivity,
          abortSignal,
        }),
      {
        ...timeoutConfig,
        label: "需求规则抽取",
        isCancelled: () => isRunCancelled(record),
        createCancelError: () => new RunCancelledError(snapshot.runId),
      },
    );
    throwIfRunCancelled(record);
    // Exact source validation belongs to extraction's bounded repair loop; never
    // silently publish only a subset of a returned requirement set.
    rules = reconcileExtractedRuleIds(ruleResult.rules, snapshot.requirementBaseline, snapshot.runId);
    if (rules.length === 0) {
      throwRunError(createRunError("RUN_REQUIREMENT_RULES_EMPTY"));
    }
    const acceptedBaseline = buildRequirementBaseline({
      runId: snapshot.runId,
      requirementText: sourceText,
      rules,
      previousBaseline: snapshot.requirementBaseline,
    });
    snapshot.requirementText = sourceText;
    snapshot.rules = rules;
    snapshot.requirementBaseline = acceptedBaseline;

    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "extract_rules",
        artifactKind: "rules",
      }),
    );
    emitEvent(
      record,
      artifactReadyRunEventSchema.parse({
        type: "artifact_ready",
        stage: "extract_rules",
        artifactKind: "requirementBaseline",
      }),
    );
  }

  if (rules.length > 0) {
    // Also reconcile persisted/queued runs that predate rule-snapshot baselines.
    snapshot.requirementBaseline = buildRequirementBaseline({
      runId: snapshot.runId,
      requirementText: snapshot.requirementText,
      rules,
      previousBaseline: snapshot.requirementBaseline,
    });
  }
  const requirementBaseline =
    snapshot.requirementBaseline ?? buildEmptyRequirementBaseline({ runId: snapshot.runId });
  snapshot.requirementBaseline = requirementBaseline;
  assertRequirementBaselineAllowsDownstream(requirementBaseline);

  updateStage("generate_models", "正在生成结构化模型");
  if (snapshot.selectedDiagrams.length > 0) {
    const generateRequirementDiagram = async (
      diagram: Exclude<DiagramKind, "analysis">,
    ) => {
      const diagramRules = rules;
      emitEvent(
        record,
        stageProgressRunEventSchema.parse({
          type: "stage_progress",
          stage: "generate_models",
          progress: stageProgressValue("generate_models"),
          message: `正在生成：${diagram}`,
          diagramKind: diagram,
          subtaskId: diagram,
          subtaskStatus: "running",
        }),
      );
      try {
        throwIfRunCancelled(record);
        // Generation needs at least one real upstream rule; its classification does not restrict mappings.
        if (!diagramRules.length) throw new Error(`${diagram} 缺少上游需求规则，请先添加需求规则。`);
        const modelRules = diagramRules;
        const timeoutConfig = readRequirementModelTaskTimeoutConfig();
        const runModelGeneration = (promptOverride?: string, labelSuffix = "") =>
          withModelTaskTimeout(
            (markActivity, markBlankActivity, abortSignal) => generateModelsWithRepair(
              record,
              providerSettings,
              llmTransport,
              modelRules,
              [diagram],
              promptOverride,
              markActivity,
              markBlankActivity,
              abortSignal,
            ),
            {
              ...timeoutConfig,
              label: `${diagram}需求模型生成${labelSuffix}`,
              isCancelled: () => isRunCancelled(record),
              createCancelError: () => new RunCancelledError(snapshot.runId),
            },
          );
        let result: Awaited<ReturnType<typeof generateModelsWithRepair>>;
        try {
          result = await runModelGeneration();
        } catch (error) {
          const runError = normalizeRunError(error);
          if (diagram !== "activity" || !isProviderTimeout(runError)) {
            throw error;
          }
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_models",
              progress: stageProgressValue("generate_models"),
              message: "activity 需求模型长时间无有效输出，正在使用精简活动图提示重试",
              diagramKind: diagram,
              subtaskId: diagram,
              subtaskStatus: "repairing",
            }),
          );
          result = await runModelGeneration(
            buildCompactActivityModelPrompt(modelRules),
            "（精简重试）",
          );
        }
        result.models = await Promise.all(result.models.map((model) => renderRequirementModelArtifact(model, result.requirementModelTraceability)));
        result.requirementModelTraceability = requirementModelTraceability.filter((entry) => result.models.some((model) => model.modelId ? entry.target.modelId === model.modelId : entry.target.diagramKind === model.diagramKind)) as typeof result.requirementModelTraceability;
        models = [
          ...models.filter((model) => model.diagramKind !== diagram),
          ...result.models,
        ];
        requirementModelTraceability = [
          ...requirementModelTraceability.filter(
            (entry) => entry.target.diagramKind !== diagram,
          ),
          ...result.requirementModelTraceability,
        ];
        delete diagramErrors[diagram];
        snapshot.models = models;
        snapshot.requirementModelTraceability = requirementModelTraceability;
        snapshot.diagramErrors = diagramErrors;
        emitEvent(
          record,
          artifactReadyRunEventSchema.parse({
            type: "artifact_ready",
            stage: "generate_models",
            artifactKind: "model",
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskStatus: "completed",
          }),
        );
        throwIfRunCancelled(record);

        return { diagram, result };
      } catch (error) {
        throwIfRunCancelled(record);
        const runError = normalizeRunError(error);
        const message = runError.message || `${diagram} 模型生成失败`;
        diagramErrors[diagram] = diagramErrorSchema.parse({
          stage: runError.code === "RUN_RENDER_FAILED" ? "render_svg" : "generate_models",
          error: runError,
        });
        snapshot.diagramErrors = diagramErrors;
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message,
            error: runError,
            diagramKind: diagram,
            subtaskId: diagram,
            subtaskStatus: "failed",
          }),
        );
        return null;
      }
    };

    const selectedSet = new Set(snapshot.selectedDiagrams);
    const needsAnalysis = selectedSet.has("analysis");
    const prerequisiteDiagrams = snapshot.selectedDiagrams.filter(
      (diagram): diagram is Exclude<DiagramKind, "analysis"> =>
        diagram !== "analysis",
    );
    const hasUseCaseContext = models.some((model) => model.diagramKind === "usecase");
    if (needsAnalysis && !hasUseCaseContext && !prerequisiteDiagrams.includes("usecase")) {
      prerequisiteDiagrams.unshift("usecase");
      snapshot.requestedDiagrams ??= ["analysis"];
      snapshot.dependencyDiagrams = [
        ...new Set([...(snapshot.dependencyDiagrams ?? []), "usecase"]),
      ] as DiagramKind[];
      snapshot.selectedDiagrams = [
        ...new Set(["usecase", ...snapshot.selectedDiagrams]),
      ] as DiagramKind[];
    }


    const prerequisiteTasks = new Map(
      prerequisiteDiagrams.map((diagram) => [
        diagram,
        generateRequirementDiagram(diagram),
      ] as const),
    );
    if (needsAnalysis && prerequisiteTasks.has("usecase")) {
      await prerequisiteTasks.get("usecase");
      throwIfRunCancelled(record);
    }

    if (needsAnalysis) {
      const useCaseModel = models.find((model) => model.diagramKind === "usecase");
      if (!useCaseModel) {
        await Promise.all(prerequisiteTasks.values());
        throw new Error("缺少用例模型，无法基于事件流生成需求分析模型");
      }

      const targetUseCaseIds = analysisTargetUseCaseIds(snapshot);
      const allAnalysisUseCases = useCasesFromModel(useCaseModel);
      const analysisUseCases =
        targetUseCaseIds.size > 0
          ? allAnalysisUseCases.filter((useCase) => targetUseCaseIds.has(useCase.id))
          : allAnalysisUseCases;
      if (targetUseCaseIds.size > 0 && analysisUseCases.length === 0) {
        throw new Error(
          `未找到可补跑的需求分析用例：${Array.from(targetUseCaseIds).join("、")}`,
        );
      }

      const preservedAnalysisModels = models.filter(
        (model): model is AnalysisRequirementModel =>
          model.diagramKind === "analysis" &&
          targetUseCaseIds.size > 0 &&
          !analysisModelMatchesTarget(model, targetUseCaseIds),
      );


      const generateAnalysisForUseCase = async (useCase: UseCaseForAnalysis, missingModelRetryRound?: number) => {
        throwIfRunCancelled(record);
        const modelId = analysisModelIdForUseCase(useCase);
        const scopedUseCaseModel = scopeUseCaseModelForPrompt(
          useCaseModel,
          useCase.id,
        );
        emitEvent(
          record,
          stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage: "generate_models",
            progress: stageProgressValue("generate_models"),
            message: missingModelRetryRound
              ? `正在补跑缺失的需求分析模型：${useCase.name}（第 ${missingModelRetryRound} 轮）`
              : `正在生成需求分析模型：${useCase.name}`,
            diagramKind: "analysis",
            modelId,
            subtaskId: modelId,
            subtaskLabel: `需求分析模型：${useCase.name}`,
            subtaskStatus: "running",
          }),
        );
        try {
          if (!useCaseHasEventFlows(useCase)) {
            throw new Error(`${useCase.name}缺少事件流，无法生成需求分析模型`);
          }
          const timeoutConfig = readRequirementModelTaskTimeoutConfig();
          const runAnalysisGeneration = (promptOverride?: string, labelSuffix = "") =>
            withModelTaskTimeout(
              (markActivity, markBlankActivity, abortSignal) =>
                generateAnalysisModelWithRepair(
                  record,
                  providerSettings,
                  llmTransport,
                  scopedUseCaseModel,
                  markActivity,
                  markBlankActivity,
                  abortSignal,
                  promptOverride,
                ),
              {
                ...timeoutConfig,
                label: `${useCase.name}需求分析模型生成${labelSuffix}`,
                isCancelled: () => isRunCancelled(record),
                createCancelError: () => new RunCancelledError(snapshot.runId),
              },
            );
          let rawResult: Awaited<ReturnType<typeof generateAnalysisModelWithRepair>>;
          try {
            rawResult = await runAnalysisGeneration();
          } catch (error) {
            const runError = normalizeRunError(error);
            if (!isProviderTimeout(runError)) {
              throw error;
            }
            emitEvent(
              record,
              stageProgressRunEventSchema.parse({
                type: "stage_progress",
                stage: "generate_models",
                progress: stageProgressValue("generate_models"),
                message: `需求分析模型 ${useCase.name} 长时间无有效输出，正在使用精简单用例提示重试`,
                diagramKind: "analysis",
                modelId,
                subtaskId: modelId,
                subtaskLabel: `需求分析模型：${useCase.name}`,
                subtaskStatus: "repairing",
              }),
            );
            rawResult = await runAnalysisGeneration(
              buildCompactAnalysisModelPrompt(useCase, scopedUseCaseModel),
              "（精简重试）",
            );
          }
          const result = coerceAnalysisModelForUseCase(rawResult, useCase);
          result.models = await Promise.all(result.models.map((model) => renderRequirementModelArtifact(model, result.requirementModelTraceability)));
        result.requirementModelTraceability = requirementModelTraceability.filter((entry) => result.models.some((model) => model.modelId ? entry.target.modelId === model.modelId : entry.target.diagramKind === model.diagramKind)) as typeof result.requirementModelTraceability;
          models = mergeRequirementModels(models, result.models);
          requirementModelTraceability = [
            ...requirementModelTraceability.filter(
              (entry) => entry.target.modelId !== modelId,
            ),
            ...result.requirementModelTraceability,
          ];
          delete diagramErrors.analysis;
          delete diagramErrors[modelId];
          snapshot.models = models;
          snapshot.requirementModelTraceability = requirementModelTraceability;
          snapshot.diagramErrors = diagramErrors;
          emitEvent(
            record,
            artifactReadyRunEventSchema.parse({
              type: "artifact_ready",
              stage: "generate_models",
              artifactKind: "model",
              diagramKind: "analysis",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `需求分析模型：${useCase.name}`,
              subtaskStatus: "completed",
            }),
          );

          return result;
        } catch (error) {
          throwIfRunCancelled(record);
          const runError = normalizeRunError(error);
          const message = runError.message || `${useCase.name}需求分析模型生成失败`;
          diagramErrors[modelId] = diagramErrorSchema.parse({
            stage: runError.code === "RUN_RENDER_FAILED" ? "render_svg" : "generate_models",
            error: runError,
          });
          snapshot.diagramErrors = diagramErrors;
          emitEvent(
            record,
            stageProgressRunEventSchema.parse({
              type: "stage_progress",
              stage: "generate_models",
              progress: stageProgressValue("generate_models"),
              message,
              error: runError,
              diagramKind: "analysis",
              modelId,
              subtaskId: modelId,
              subtaskLabel: `需求分析模型：${useCase.name}`,
              subtaskStatus: "failed",
            }),
          );
          return null;
        }
      };


      let analysisResults = await mapWithConcurrency(
        analysisUseCases,
        readRequirementAnalysisConcurrency(),
        (useCase) => generateAnalysisForUseCase(useCase),
      );
      throwIfRunCancelled(record);
      let analysisModels = analysisResults
        .flatMap((result) => result?.models ?? [])
        .filter(
          (model): model is AnalysisRequirementModel =>
            model.diagramKind === "analysis",
        );
      analysisModels = mergeRequirementModels(
        preservedAnalysisModels,
        analysisModels,
      ).filter(
        (model): model is AnalysisRequirementModel => model.diagramKind === "analysis",
      );
      const missingModelRetryLimit = 2;
      for (let attempt = 0; attempt < missingModelRetryLimit; attempt += 1) {
        const missingUseCases = missingUseCasesForAnalysis(
          analysisModels,
          useCaseModel,
          targetUseCaseIds,
        );
        if (missingUseCases.length === 0) break;
        // Retry missing artifacts only; this does not recheck or repair their declared sources.

        const retryResults = await mapWithConcurrency(
          missingUseCases,
          readRequirementAnalysisConcurrency(),
          (useCase) => generateAnalysisForUseCase(useCase, attempt + 1),
        );
        analysisResults = [...analysisResults, ...retryResults];
        analysisModels = analysisResults
          .flatMap((result) => result?.models ?? [])
          .filter(
            (model): model is AnalysisRequirementModel =>
              model.diagramKind === "analysis",
          );
        analysisModels = mergeRequirementModels(
          preservedAnalysisModels,
          analysisModels,
        ).filter(
          (model): model is AnalysisRequirementModel => model.diagramKind === "analysis",
        );
      }
      if (analysisModels.length === 0) {
        throw new Error("需求分析模型生成结果缺少 analysis 模型");
      }
      validateUseCaseAnalysisCoverage(analysisModels, useCaseModel, targetUseCaseIds);
      models = mergeRequirementModels(models, analysisModels);
      // Per-model commits already reconciled valid analysis traceability.
    }
    await Promise.all(prerequisiteTasks.values());
    throwIfRunCancelled(record);

    if (snapshot.selectedDiagrams.length > 0 && models.length === 0) {
      const firstError = Object.values(diagramErrors)[0]?.error;
      if (firstError) throwRunError(firstError);
      throwRunError(createRunError("RUN_MODEL_OUTPUT_EMPTY", "需求模型生成失败"));
    }
  }
  snapshot.models = models;
  snapshot.requirementModelTraceability = requirementModelTraceability;
  snapshot.diagramErrors = diagramErrors;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "model",
    }),
  );
  const trustedChain = buildRequirementStageTrustedChain({
    runId: snapshot.runId,
    baseline: requirementBaseline,
    models,
    requirementModelTraceability,
  });
  snapshot.coverageMatrix = trustedChain.coverageMatrix;
  snapshot.traceabilityMatrix = trustedChain.traceabilityMatrix;
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "coverageMatrix",
      coverageMatrix: trustedChain.coverageMatrix,
    }),
  );
  emitEvent(
    record,
    artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_models",
      artifactKind: "traceabilityMatrix",
      traceabilityMatrix: trustedChain.traceabilityMatrix,
    }),
  );

  snapshot.diagramErrors = diagramErrors;

  if (plantUml.length > 0 && svgArtifacts.length === 0) {
    throw new Error(renderFailures.join("；"));
  }

  const missingOutputs = missingRequestedModelOutputs(snapshot);
  if (missingOutputs.length) {
    const failedTarget = Object.entries(snapshot.diagramErrors).find(([key]) => missingOutputs.some(target => target.split(":")[0] === key.split(":")[0]))?.[1]?.error;
    if (failedTarget) throwRunError(failedTarget);
    throwRunError(createRunError("RUN_MODEL_OUTPUT_EMPTY", "请求的模型未全部生成：" + missingOutputs.join("、"), { details: { missingTargets: missingOutputs } }));
  }
  stages.finish("generate_models");
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
