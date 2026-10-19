// Runs model-backed feasibility stages with capability routing and section-scoped repair.
import { candidateRulesForDiagram, MAX_GENERATION_REPAIR_ATTEMPTS, contextDiagramSpecSchema, feasibilityBusinessFlowSchema, completeFeasibilityImplementationPlanSchema } from "@uml-platform/contracts";
import { GenerationRepairSession } from "./shared/generation-repair.js";
import { repairDiagnostics } from "../../normalizers/structured-output/repair-diagnostics.js";
import { createRunLlmChunkHandlers } from "./shared/llm-chunk-events.js";
import { readDiagramReviewCounters } from "../records/diagram-review-record.js";
import { withRunReasoning } from "./shared/run-reasoning.js";
import {
  artifactReadyRunEventSchema,
  buildAcceptedRequirementSnapshot,
  buildFeasibilityContextFingerprint,
  buildFeasibilityImplementationFingerprint,
  readFeasibilityBusinessFlowArtifact,
  completedRunEventSchema,
  snapshotInputFingerprint,
  stageProgressRunEventSchema,
  stageFinishedRunEventSchema,
  stageStartedRunEventSchema,
  type ContextDiagramSpec,
  type FeasibilityGenerationDiagnostics,
  type FeasibilityRunSnapshot,
  type FeasibilityValidationIssue,
  type ProviderSettings,
  type RunStage,
} from "@uml-platform/contracts";
import {
  buildGenerateFeasibilityContextPrompt,
  buildGenerateFeasibilityBusinessFlowPrompt,
  buildGenerateFeasibilityImplementationPrompt,
} from "@uml-platform/prompts";
import type {
  ChatCompletionResponseFormat,
  LlmTransport,
  ResponseFormatFallbackEvent,
} from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import {
  GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT,
  GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT,
} from "../../adapters/llm/response-formats/index.js";
import { getModelCapability } from "../../model-capabilities.js";
import { normalizeContextDiagram } from "../../normalizers/feasibility/context-normalizer.js";
import { normalizeFeasibilityBusinessFlow } from "../../normalizers/feasibility/business-flow-normalizer.js";
import { GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT } from "../../adapters/llm/response-formats/feasibility-response-formats.js";
import {
  normalizeFeasibilityImplementationDetailed,
} from "../../normalizers/feasibility/implementation-normalizer.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";

import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { isRunCancelled, throwIfRunCancelled } from "../records/run-cancellation.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createRunError, throwRunError } from "./shared/errors.js";

import { DiagramReviewRenderError, reviewRenderedArtifact } from "./render/review-rendered-artifact.js";
import { withConversationBranch } from "./shared/conversation-context.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";



function traceabilityFromContext(model: ContextDiagramSpec) {
  return [
    ...model.people.flatMap((element) => element.sourceRequirementIds.map((requirementId) => ({
      requirementId,
      targetId: element.id,
      targetKind: "person" as const,
      targetLabel: element.name,
    }))),
    ...model.externalSystems.flatMap((element) => element.sourceRequirementIds.map((requirementId) => ({
      requirementId,
      targetId: element.id,
      targetKind: "external-system" as const,
      targetLabel: element.name,
    }))),
    ...model.relationships.flatMap((relationship) => relationship.sourceRequirementIds.map((requirementId) => ({
      requirementId,
      targetId: relationship.id,
      targetKind: "relationship" as const,
      targetLabel: relationship.label,
    }))),
  ];
}

function pathSection(path: Array<string | number>, promptStage: "context" | "business-flow" | "implementation") {
  if (promptStage === "context") return "context" as const;
  if (promptStage === "business-flow") return "business-flow" as const;
  const implementationIndex = path.indexOf("implementation");
  const key = implementationIndex >= 0 ? path[implementationIndex + 1] : path[2];
  if (
    key === "architecture" ||
    key === "dataStrategy" ||
    key === "integrations" ||
    key === "integrationRationale" ||
    key === "deploymentAndOperations" ||
    key === "securityAndCompliance"
  ) return "technical" as const;
  if (key === "milestones" || key === "risks") return "delivery" as const;
  if (
    key === "analysisPeriodAssumption" ||
    key === "costEstimates" ||
    key === "benefitEstimates" ||
    key === "absenceDeclarations"
  ) return "economics" as const;
  if (key === "verdicts" || key === "decision" || key === "preconditions") {
    return "verdict" as const;
  }
  return "plan" as const;
}

function chineseIssueReason(message: string) {
  return message
    .replace("Required", "缺少必填字段")
    .replace("Invalid input", "字段值不符合要求")
    .replace("Expected", "应为")
    .replace("received", "实际为");
}

function validationIssuesFromError(
  error: unknown,
  promptStage: "context" | "business-flow" | "implementation",
): FeasibilityValidationIssue[] {
  const rawIssues = (error as {
    issues?: Array<{ path?: Array<string | number>; message?: string }>;
  } | null)?.issues ?? repairDiagnostics(error).map(issue => ({ path: issue.path.split(".").filter(Boolean).map(part => /^\d+$/.test(part) ? Number(part) : part), message: issue.message }));
  if (!Array.isArray(rawIssues) || rawIssues.length === 0) {
    return [{
      path: "",
      candidateIndex: null,
      section: promptStage === "implementation" ? "plan" : promptStage,
      reason: chineseIssueReason(formatParseError(error)),
    }];
  }
  return rawIssues.map((issue) => {
    const path = Array.isArray(issue.path) ? issue.path : [];
    const candidatesIndex = path.indexOf("candidates");
    const candidateIndex = candidatesIndex >= 0 && typeof path[candidatesIndex + 1] === "number"
      ? path[candidatesIndex + 1] as number
      : null;
    return {
      path: path.join("."),
      candidateIndex,
      section: pathSection(path, promptStage),
      reason: chineseIssueReason(issue.message ?? "字段不符合契约"),
    };
  });
}

function responseFormatFor(
  stage: "context" | "business-flow" | "implementation",
  diagnostics: FeasibilityGenerationDiagnostics,
): ChatCompletionResponseFormat | null {
  if (diagnostics.effectiveMode === "compatible") return null;
  if (diagnostics.effectiveMode === "json_object") return { type: "json_object" };
  if (stage === "business-flow") return GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT;
  return stage === "context"
    ? GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT
    : GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT;
}







// Repair responses may contain unrelated rewrites. Only invalid groups are
// merged back, keeping every already-validated candidate section unchanged.

async function generateFeasibilityJson<T>(input: {
  record: RunRecord;
  stage: RunStage;
  promptStage: "context" | "business-flow" | "implementation";
  prompt: string;
  providerSettings: ProviderSettings;
  llmTransport: LlmTransport;
  diagnostics: FeasibilityGenerationDiagnostics;
  parse: (value: unknown) => { value: T; normalizationActions?: string[] };
}) {
  let prompt = input.prompt;
  const targetId = input.promptStage === "business-flow" ? "activity" : input.promptStage;
  const sourceMarker = "\n输入：\n";
  const sourceStart = input.prompt.lastIndexOf(sourceMarker);
  const facts = sourceStart >= 0 ? input.prompt.slice(sourceStart + sourceMarker.length) : input.record.snapshot.requirementBaseline;
  const schema = input.promptStage === "context" ? contextDiagramSpecSchema : input.promptStage === "business-flow" ? feasibilityBusinessFlowSchema : completeFeasibilityImplementationPlanSchema;
  const repair = new GenerationRepairSession(targetId, facts, [], MAX_GENERATION_REPAIR_ATTEMPTS, input.prompt, schema);
  let lastIssues: FeasibilityValidationIssue[] = [];
  for (let attempt = 0; attempt <= MAX_GENERATION_REPAIR_ATTEMPTS; attempt++) {
    throwIfRunCancelled(input.record);
    const used = readDiagramReviewCounters(input.record, targetId, targetId).repairAttempts;
    if (attempt > 0 && used >= MAX_GENERATION_REPAIR_ATTEMPTS) break;
    const fallback = (event: ResponseFormatFallbackEvent) => {
      input.diagnostics.effectiveMode = "json_object";
      input.diagnostics.downgradeReasons.push(`HTTP ${event.status}: ${event.reason}`);
    };
    const raw = await collectTextResult(input.llmTransport, input.providerSettings,
      [{ role: "system", content: "你是严谨的软件可行性分析师，只能基于给定事实输出契约要求的 JSON。" }, { role: "user", content: prompt }],
      createRunLlmChunkHandlers({ record: input.record, stage: input.stage, modelId: targetId, subtaskId: targetId, subtaskLabel: input.promptStage === "business-flow" ? "业务流程图" : undefined,
        operation: attempt > 0 ? "model_repair" : undefined, round: attempt > 0 ? attempt : undefined }),
      repair.repairing ? { type: "json_object" } : responseFormatFor(input.promptStage, input.diagnostics), undefined, fallback);
    try {
      const parsedValue = parseJson(repair.accept(raw));
      const result = input.parse(parsedValue);
      input.diagnostics.normalizationActions.push(...(result.normalizationActions ?? []));
      input.diagnostics.normalizationActions = [...new Set(input.diagnostics.normalizationActions)];
      for (const entry of input.diagnostics.repairs) if (entry.stage === input.promptStage) entry.succeeded = true;
      return result.value;
    } catch (error) {
      logFailedStructuredOutput(input.stage, input.providerSettings.model, error, raw, attempt + 1);
      lastIssues = validationIssuesFromError(error, input.promptStage);
      if (attempt >= MAX_GENERATION_REPAIR_ATTEMPTS) break;
      const groups = new Map(lastIssues.map(issue => [`${issue.candidateIndex}:${issue.section}`, issue]));
      for (const issue of groups.values()) input.diagnostics.repairs.push({ stage: input.promptStage, candidateIndex: issue.candidateIndex, section: issue.section, round: attempt + 1, succeeded: false });
      const paths = lastIssues.map(issue => issue.path).filter(path => path && path !== "<root>");
      const instruction = [...groups.values()].map(issue => issue.candidateIndex === null ? issue.reason : `仅修复候选方案索引 ${issue.candidateIndex} 的 ${issue.section} 章节；${issue.reason}`).join("；");
      emitEvent(input.record, stageProgressRunEventSchema.parse({ type: "stage_progress", stage: input.stage,
        progress: stageProgressValue(input.stage), subtaskId: targetId, modelId: targetId, subtaskStatus: "repairing",
        message: `正在定点修复（${attempt + 1}/${MAX_GENERATION_REPAIR_ATTEMPTS}）：${instruction}` }));
      prompt = repair.prepare(error, { paths, instruction, sourceFacts: facts });
    }
  }
  const label = input.promptStage === "business-flow" ? "业务流程图" : input.promptStage === "context" ? "上下文模型" : "实现方案";
  throwRunError(createRunError("RUN_STRUCTURED_OUTPUT_INVALID", `${label}结构化输出在共享 5 次修复后仍未通过：${lastIssues.map(issue => issue.reason).join("；")}`));
}

export async function runFeasibilityStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
  pngRenderClient?: PngRenderClient,
) {
  const snapshot = record.snapshot as FeasibilityRunSnapshot;
  // Validate saved facts before the first provider call; replay never rewrites provenance.
  const requirementSource = buildAcceptedRequirementSnapshot(snapshot.rules, snapshot.requirementBaseline);
  snapshot.requirementSource = requirementSource.snapshot;
  llmTransport = withRunReasoning(llmTransport, snapshot.reasoning);
  const validRequirementIds = new Set(snapshot.rules.map((rule) => rule.id));
  const capability = getModelCapability(providerSettings);
  const diagnostics = snapshot.generationDiagnostics ?? {
    requestedMode: capability.structuredOutputMode,
    effectiveMode: capability.structuredOutputMode,
    downgradeReasons: [],
    normalizationActions: [],
    repairs: [],
  };
  snapshot.generationDiagnostics = diagnostics;
  const activeStages = new Set<RunStage>();
  const finishStage = (stage: RunStage, status: "completed" | "failed" | "cancelled" = "completed") => {
    if (!activeStages.delete(stage)) return;
    emitEvent(record, stageFinishedRunEventSchema.parse({ type: "stage_finished", stage, status }));
  };
  const updateStage = (stage: RunStage, message: string) => {
    throwIfRunCancelled(record);
    snapshot.currentStage = stage as FeasibilityRunSnapshot["currentStage"];
    snapshot.status = "running";
    if (!activeStages.has(stage)) {
      activeStages.add(stage);
      emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage }));
    }
    emitEvent(record, stageProgressRunEventSchema.parse({
      type: "stage_progress",
      stage,
      progress: stageProgressValue(stage),
      message,
    }));
  };

  let activeReviews = 0;
  let reviewFailed = false;
  const reviewCandidate = async (input: Parameters<typeof reviewRenderedArtifact>[0]) => {
    activeReviews++;
    updateStage("verify_diagram_visual", "正在核对模型结构与业务内容");
    try { return await reviewRenderedArtifact(input); }
    catch (error) {
      reviewFailed = true;
      throwIfRunCancelled(record);
      if (error instanceof DiagramReviewRenderError) {
        snapshot.visualReviews[input.model.modelId ?? input.model.diagramKind] = error.review;
        throwRunError(createRunError(error.review.structureStatus === "failed" ? "RUN_STRUCTURED_OUTPUT_INVALID" : "RUN_RENDER_FAILED", error.message));
      }
      throw error;
    }
    finally { if (--activeReviews === 0) finishStage("verify_diagram_visual", isRunCancelled(record) ? "cancelled" : reviewFailed ? "failed" : "completed"); }
  };

  const generateContext = async () => {
    if (!snapshot.selectedArtifacts.includes("context")) return;
    updateStage("generate_context", "正在使用所选模型生成系统上下文");
    let contextModel = await generateFeasibilityJson({
      record,
      stage: "generate_context",
      promptStage: "context",
      prompt: buildGenerateFeasibilityContextPrompt(snapshot),
      providerSettings,
      llmTransport,
      diagnostics,
      parse: (value) => ({
        value: normalizeContextDiagram(value, validRequirementIds),
      }),
    });
    finishStage("generate_context");
    updateStage("render_context", "正在核对并渲染系统环境图");
    const checked = await reviewCandidate({ record, providerSettings, llmTransport, renderClient,
      model: contextModel, mutable: true,
      basis: { stage: "feasibility", baseline: snapshot.requirementBaseline, rules: candidateRulesForDiagram(snapshot.rules, "context"), traceability: traceabilityFromContext(contextModel) },
      validateModel: (model) => { normalizeContextDiagram(model, validRequirementIds); },
    });
    throwIfRunCancelled(record);
    contextModel = checked.model as typeof contextModel;
    const artifact = checked.rendered.artifact;
    // Preserve previous artifacts until the entire candidate tuple is accepted.
    snapshot.contextModel = contextModel;
    snapshot.contextTraceability = traceabilityFromContext(contextModel);
    snapshot.visualReviews[contextModel.modelId ?? "context"] = checked.review;
    snapshot.contextPlantUml = checked.rendered.artifact as NonNullable<FeasibilityRunSnapshot["contextPlantUml"]>;
    snapshot.contextSvg = checked.rendered.svgArtifact as NonNullable<FeasibilityRunSnapshot["contextSvg"]>;
    snapshot.contextFingerprint = buildFeasibilityContextFingerprint({
      rules: snapshot.rules,
      requirementBaseline: snapshot.requirementBaseline,
      inputs: snapshot.inputs,
    });
    emitEvent(record, artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "render_context",
      artifactKind: "feasibilityContext",
      modelId: artifact.modelId ?? "context",
      subtaskId: "context",
      subtaskLabel: "系统环境图",
      subtaskStatus: "completed",
    }));
    finishStage("render_context");
  };

  const generateBusinessFlow = async () => {
    if (!snapshot.selectedArtifacts.includes("business-flow")) return;
    updateStage("generate_business_flow", "正在根据需求规则生成业务流程图");
    const result = await generateFeasibilityJson({
      record,
      stage: "generate_business_flow",
      promptStage: "business-flow",
      prompt: buildGenerateFeasibilityBusinessFlowPrompt({ rules: snapshot.rules, requirementBaseline: snapshot.requirementBaseline }),
      providerSettings,
      llmTransport,
      diagnostics,
      parse: (value) => ({ value: normalizeFeasibilityBusinessFlow(value, validRequirementIds) }),
    });
    finishStage("generate_business_flow");
    updateStage("render_business_flow", "正在渲染业务流程图");
    const checked = await reviewCandidate({ record, providerSettings, llmTransport, renderClient,
      model: result.model, mutable: true,
      basis: { stage: "feasibility", baseline: snapshot.requirementBaseline, rules: snapshot.rules, traceability: result.traceability },
      validateModel: (model) => { normalizeFeasibilityBusinessFlow({ model, traceability: result.traceability }, validRequirementIds); },
    });
    throwIfRunCancelled(record);
    const artifact = checked.rendered.artifact;
    result.model = checked.model as typeof result.model;
    snapshot.visualReviews[artifact.modelId ?? "business-flow"] = checked.review;
    snapshot.businessFlow = {
      ...result,
      plantUml: checked.rendered.artifact as NonNullable<FeasibilityRunSnapshot["contextPlantUml"]>,
      svg: checked.rendered.svgArtifact as NonNullable<FeasibilityRunSnapshot["contextSvg"]>,
      fingerprint: snapshotInputFingerprint({ rules: snapshot.rules, requirementBaseline: snapshot.requirementBaseline }),
    };
    emitEvent(record, artifactReadyRunEventSchema.parse({
      type: "artifact_ready", stage: "render_business_flow", artifactKind: "feasibilityBusinessFlow",
      modelId: result.model.modelId, subtaskId: "business-flow", subtaskLabel: "业务流程图", subtaskStatus: "completed",
    }));
    finishStage("render_business_flow");
  };

  // Settle both independent branches so one failure does not discard the other's accepted artifacts.
  record.conversationContext?.forkBranches(["feasibility:context", "feasibility:business-flow"]);
  const sourceResults = await Promise.allSettled([
    withConversationBranch("feasibility:context", generateContext),
    withConversationBranch("feasibility:business-flow", generateBusinessFlow),
  ]);
  const sourceFailure = sourceResults.find((result) => result.status === "rejected");
  if (sourceFailure?.status === "rejected") {
    for (const stage of [...activeStages]) finishStage(stage, isRunCancelled(record) ? "cancelled" : "failed");
    throw sourceFailure.reason;
  }

  if (snapshot.selectedArtifacts.includes("implementation")) {
    const requirementFingerprint = buildAcceptedRequirementSnapshot(snapshot.rules, snapshot.requirementBaseline).snapshot.fingerprint;
    if (!snapshot.contextModel || !snapshot.contextPlantUml?.source || !snapshot.contextSvg?.svg ||
      snapshot.contextFingerprint !== buildFeasibilityContextFingerprint(snapshot)) {
      throwRunError(createRunError(
        "RUN_DEPENDENCY_MISSING",
        "请先生成最新有效的系统环境图。",
      ));
    }
    const businessFlow = readFeasibilityBusinessFlowArtifact(snapshot.businessFlow);
    if (!businessFlow || businessFlow.fingerprint !== requirementFingerprint) {
      throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "请先生成最新有效的业务流程图。"));
    }
    updateStage("generate_implementation", "正在使用所选模型生成实现方案");
    const contextExternalSystems = snapshot.contextModel.externalSystems.map(({ id, name }) => ({
      id,
      name,
    }));
    snapshot.implementationPlan = await generateFeasibilityJson({
      record,
      stage: "generate_implementation",
      promptStage: "implementation",
      prompt: buildGenerateFeasibilityImplementationPrompt({
        rules: snapshot.rules,
        requirementBaseline: snapshot.requirementBaseline,
        inputs: snapshot.inputs,
        contextModel: snapshot.contextModel,
        businessFlow: { model: businessFlow.model, traceability: businessFlow.traceability },
      }),
      providerSettings,
      llmTransport,
      diagnostics,
      parse: (value) => {
        const normalized = normalizeFeasibilityImplementationDetailed(
          value,
          validRequirementIds,
          contextExternalSystems,
        );
        return {
          value: normalized.plan,
          normalizationActions: normalized.actions,
        };
      },
    });
    snapshot.implementationFingerprint = buildFeasibilityImplementationFingerprint({
      rules: snapshot.rules,
      requirementBaseline: snapshot.requirementBaseline,
      contextModel: snapshot.contextModel,
      businessFlow,
      inputs: snapshot.inputs,
    });
    emitEvent(record, artifactReadyRunEventSchema.parse({
      type: "artifact_ready",
      stage: "generate_implementation",
      artifactKind: "feasibilityImplementation",
      subtaskId: "implementation",
      subtaskLabel: "实现方案",
      subtaskStatus: "completed",
    }));
  }

  for (const stage of [...activeStages]) finishStage(stage);
  snapshot.currentStage = null;
  snapshot.status = "completed";
  snapshot.error = null;
  emitEvent(record, completedRunEventSchema.parse({ type: "completed", snapshot }));
}
