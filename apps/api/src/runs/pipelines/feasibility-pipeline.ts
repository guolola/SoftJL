// Runs feasibility stages through scoped upstream queries and validation before backend rendering and persistence.
import { contractResponseSchema, contextDiagramSpecSchema, feasibilityBusinessFlowSchema, completeFeasibilityImplementationPlanSchema } from "@uml-platform/contracts";
import { generateWithModelConversation } from "./shared/model-generation-session.js";
import { assertFeasibilityCandidate } from "../../normalizers/modeling/model-candidate-validation.js";
import { normalizeContractNulls } from "../../normalizers/structured-output/contract-nulls.js";
import { repairDiagnostics } from "../../normalizers/structured-output/repair-diagnostics.js";
import { generatePlantUmlArtifacts } from "../../adapters/plantuml/model-renderer.js";


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
import type { LlmTransport } from "../../adapters/llm/llm-transport.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import {
  GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT,
  GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT,
} from "../../adapters/llm/response-formats/index.js";
import { getModelCapability } from "../../adapters/llm/model-capabilities.js";
import { GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT } from "../../adapters/llm/response-formats/feasibility-response-formats.js";
import { formatParseError } from "../../normalizers/json/parse-json.js";

import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { isRunCancelled, throwIfRunCancelled } from "../records/run-cancellation.js";

import { stageProgressValue } from "./shared/pipeline-events.js";
import { createRunError, throwRunError } from "./shared/errors.js";

import { DiagramReviewRenderError, reviewRenderedArtifact } from "./render/review-rendered-artifact.js";


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

async function generateFeasibilityJson<T>(input: {
  record: RunRecord; stage: RunStage; promptStage: "context" | "business-flow" | "implementation";
  providerSettings: ProviderSettings; llmTransport: LlmTransport; diagnostics: FeasibilityGenerationDiagnostics;
  parse: (value: unknown) => { value: T; normalizationActions?: string[] };
}) {
  const snapshot = input.record.snapshot as FeasibilityRunSnapshot;
  const rules = structuredClone(snapshot.rules);
  const inputs = structuredClone(snapshot.inputs);
  const contextModel = input.promptStage === "implementation" ? structuredClone(snapshot.contextModel) : null;
  const storedFlow = input.promptStage === "implementation" ? readFeasibilityBusinessFlowArtifact(snapshot.businessFlow) : null;
  const businessFlow = storedFlow ? structuredClone({ model: storedFlow.model, traceability: storedFlow.traceability }) : null;
  const targetId = input.promptStage === "business-flow" ? "activity" : input.promptStage;
  const schema = input.promptStage === "context" ? contextDiagramSpecSchema : input.promptStage === "business-flow" ? feasibilityBusinessFlowSchema : completeFeasibilityImplementationPlanSchema;
  const contractSchema = contractResponseSchema(schema);
  const format = input.promptStage === "context" ? GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT : input.promptStage === "business-flow" ? GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT : GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT;
  if (input.promptStage === "implementation" && (!contextModel || !businessFlow)) throw new Error("实现方案缺少绑定的系统环境图或业务流程图");
  // Build prompt, upstream sources and validation from the same immutable task binding.
  const prompt = input.promptStage === "implementation"
    ? buildGenerateFeasibilityImplementationPrompt({ rules, inputs, contextModel: contextModel!, businessFlow: businessFlow! })
    : input.promptStage === "context" ? buildGenerateFeasibilityContextPrompt({ rules, inputs })
      : buildGenerateFeasibilityBusinessFlowPrompt({ rules, inputs });
  try {
    return await generateWithModelConversation<T>({
      record: input.record, providerSettings: input.providerSettings, transport: input.llmTransport, stage: input.stage,
      targetId, diagramKind: input.promptStage === "business-flow" ? "activity" : input.promptStage === "context" ? "context" : undefined,
      label: input.promptStage === "business-flow" ? "业务流程图" : input.promptStage === "context" ? "系统环境图" : "实现方案",
      prompt, schema: format,
      compile: input.promptStage === "implementation" ? undefined : candidate => {
        const model = input.promptStage === "business-flow" ? (candidate as { model: import("@uml-platform/contracts").ActivityDiagramSpec }).model : candidate as ContextDiagramSpec;
        generatePlantUmlArtifacts([model], "feasibility", "schema");
      },
      validate: raw => {
        const value = normalizeContractNulls(JSON.parse(raw), contractSchema);
        assertFeasibilityCandidate(value, { schema, kind: input.promptStage, rules, upstream: contextModel ? [contextModel] : [] });
        return input.parse(value).value;
      },
      onCandidate: (raw, attempt, error) => {
        if (error) {
          const issues = validationIssuesFromError(error, input.promptStage);
          const groups = new Map(issues.map(issue => [`${issue.candidateIndex}:${issue.section}`, issue]));
          for (const issue of groups.values()) input.diagnostics.repairs.push({ stage: input.promptStage, candidateIndex: issue.candidateIndex, section: issue.section, round: attempt, succeeded: false });
        } else {
          const result = input.parse(normalizeContractNulls(JSON.parse(raw), contractSchema));
          input.diagnostics.normalizationActions = [...new Set([...input.diagnostics.normalizationActions, ...result.normalizationActions ?? []])];
          for (const entry of input.diagnostics.repairs) if (entry.stage === input.promptStage) entry.succeeded = true;
        }
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || !/structured output failed/.test(error.message)) throw error;
    const label = input.promptStage === "business-flow" ? "业务流程图" : input.promptStage === "context" ? "上下文模型" : "实现方案";
    throwRunError(createRunError("RUN_STRUCTURED_OUTPUT_INVALID", `${label}结构化输出在共享 5 次修复后仍未通过：${error.message}`));
  }
}

export async function runFeasibilityStagePipeline(
  record: RunRecord,
  providerSettings: ProviderSettings,
  llmTransport: LlmTransport,
  renderClient: RenderClient,
) {
  const snapshot = record.snapshot as FeasibilityRunSnapshot;
  // Validate saved facts before the first provider call; replay never rewrites provenance.
  const requirementSource = buildAcceptedRequirementSnapshot(snapshot.rules, snapshot.requirementBaseline);
  snapshot.requirementSource = requirementSource.snapshot;
  llmTransport = withRunReasoning(llmTransport, snapshot.reasoning);
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
      providerSettings,
      llmTransport,
      diagnostics,
      parse: (value) => ({
        value: contextDiagramSpecSchema.parse(value),
      }),
    });
    finishStage("generate_context");
    updateStage("render_context", "正在核对并渲染系统环境图");
    const checked = await reviewCandidate({ record, providerSettings, llmTransport, renderClient,
      model: contextModel, mutable: false,
      basis: { stage: "feasibility", baseline: snapshot.requirementBaseline, rules: snapshot.rules, traceability: traceabilityFromContext(contextModel) },


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
      providerSettings,
      llmTransport,
      diagnostics,
      parse: (value) => ({ value: feasibilityBusinessFlowSchema.parse(value) }),
    });
    finishStage("generate_business_flow");
    updateStage("render_business_flow", "正在渲染业务流程图");
    const checked = await reviewCandidate({ record, providerSettings, llmTransport, renderClient,
      model: result.model, mutable: false,
      basis: { stage: "feasibility", baseline: snapshot.requirementBaseline, rules: snapshot.rules, traceability: result.traceability },
      validateTraceability: (model, traceability) => assertFeasibilityCandidate({ model, traceability }, { schema: feasibilityBusinessFlowSchema, kind: "business-flow", rules: snapshot.rules }),

    });
    throwIfRunCancelled(record);
    const artifact = checked.rendered.artifact;
    result.model = checked.model as typeof result.model;
    result.traceability = checked.traceability as typeof result.traceability;
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

  const sourceResults = await Promise.allSettled([
    generateContext(),
    generateBusinessFlow(),
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
    snapshot.implementationPlan = await generateFeasibilityJson({
      record,
      stage: "generate_implementation",
      promptStage: "implementation",
      providerSettings,
      llmTransport,
      diagnostics,
      parse: (value) => ({ value: completeFeasibilityImplementationPlanSchema.parse(value) }),
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
