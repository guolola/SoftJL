// Runs model-backed feasibility stages with capability routing and section-scoped repair.
import { createRunLlmChunkHandlers } from "./shared/llm-chunk-events.js";
import { readDiagramReviewCounters } from "../records/diagram-review-record.js";
import { withRunReasoning } from "./shared/run-reasoning.js";
import { artifactReadyRunEventSchema, buildAcceptedRequirementSnapshot, buildFeasibilityImplementationFingerprint, readFeasibilityBusinessFlowArtifact, completedRunEventSchema, snapshotInputFingerprint, stageProgressRunEventSchema, stageFinishedRunEventSchema, stageStartedRunEventSchema, type ContextDiagramSpec, type FeasibilityGenerationDiagnostics, type FeasibilityRepairSection, type FeasibilityRunSnapshot, type FeasibilityValidationIssue, type ProviderSettings, type RunStage, } from "@uml-platform/contracts";
import { buildGenerateFeasibilityContextPrompt, buildGenerateFeasibilityBusinessFlowPrompt, buildGenerateFeasibilityImplementationPrompt, buildRepairFeasibilityJsonPrompt, buildRepairFeasibilitySectionPrompt, } from "@uml-platform/prompts";
import type { ChatCompletionResponseFormat, LlmTransport, ResponseFormatFallbackEvent, } from "../../llm.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import { GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT, GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT, FEASIBILITY_SECTION_REPAIR_RESPONSE_FORMATS, } from "../../adapters/llm/response-formats/index.js";
import { getModelCapability } from "../../model-capabilities.js";
import { normalizeContextDiagram } from "../../normalizers/feasibility/context-normalizer.js";
import { normalizeFeasibilityBusinessFlow } from "../../normalizers/feasibility/business-flow-normalizer.js";
import { GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT } from "../../adapters/llm/response-formats/feasibility-response-formats.js";
import { normalizeFeasibilityImplementationDetailed, } from "../../normalizers/feasibility/implementation-normalizer.js";
import { formatParseError, parseJson } from "../../normalizers/json/parse-json.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { isRunCancelled, throwIfRunCancelled } from "../records/run-cancellation.js";
import { collectTextResult, logFailedStructuredOutput } from "./shared/structured-output.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createRunError, throwRunError } from "./shared/errors.js";
import { DiagramReviewRenderError, reviewRenderedArtifact } from "./render/review-rendered-artifact.js";
import { withConversationBranch } from "./shared/conversation-context.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
type UnknownRecord = Record<string, unknown>;
function isRecord(value: unknown): value is UnknownRecord {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
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
    if (promptStage === "context")
        return "context" as const;
    if (promptStage === "business-flow")
        return "business-flow" as const;
    const implementationIndex = path.indexOf("implementation");
    const key = implementationIndex >= 0 ? path[implementationIndex + 1] : path[2];
    if (key === "architecture" ||
        key === "dataStrategy" ||
        key === "integrations" ||
        key === "integrationRationale" ||
        key === "deploymentAndOperations" ||
        key === "securityAndCompliance")
        return "technical" as const;
    if (key === "milestones" || key === "risks")
        return "delivery" as const;
    if (key === "analysisPeriodAssumption" ||
        key === "costEstimates" ||
        key === "benefitEstimates" ||
        key === "absenceDeclarations" ||
        key === "oneTimeCosts" ||
        key === "recurringCosts" ||
        key === "quantitativeBenefits" ||
        key === "qualitativeBenefits")
        return "economics" as const;
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
function validationIssuesFromError(error: unknown, promptStage: "context" | "business-flow" | "implementation"): FeasibilityValidationIssue[] {
    const rawIssues = (error as {
        issues?: Array<{
            path?: Array<string | number>;
            message?: string;
        }>;
    } | null)?.issues;
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
function responseFormatFor(stage: "context" | "business-flow" | "implementation", diagnostics: FeasibilityGenerationDiagnostics): ChatCompletionResponseFormat | null {
    if (diagnostics.effectiveMode === "compatible")
        return null;
    if (diagnostics.effectiveMode === "json_object")
        return { type: "json_object" };
    if (stage === "business-flow")
        return GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT;
    return stage === "context"
        ? GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT
        : GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT;
}
function sectionResponseFormatFor(section: Exclude<FeasibilityRepairSection, "context" | "business-flow" | "plan">, diagnostics: FeasibilityGenerationDiagnostics): ChatCompletionResponseFormat | null {
    if (diagnostics.effectiveMode === "compatible")
        return null;
    if (diagnostics.effectiveMode === "json_object")
        return { type: "json_object" };
    return FEASIBILITY_SECTION_REPAIR_RESPONSE_FORMATS[section];
}
const TECHNICAL_KEYS = [
    "architecture",
    "dataStrategy",
    "integrations",
    "integrationRationale",
    "deploymentAndOperations",
    "securityAndCompliance",
] as const;
const DELIVERY_KEYS = ["milestones", "risks"] as const;
const ECONOMICS_KEYS = [
    "analysisPeriodAssumption",
    "costEstimates",
    "benefitEstimates",
    "absenceDeclarations",
    "oneTimeCosts",
    "recurringCosts",
    "quantitativeBenefits",
    "qualitativeBenefits",
] as const;
const VERDICT_KEYS = ["verdicts", "decision", "preconditions"] as const;
function copyKeys(target: UnknownRecord, source: UnknownRecord, keys: readonly string[]) {
    const next = { ...target };
    for (const key of keys) {
        if (key in source)
            next[key] = source[key];
    }
    return next;
}
function sectionKeys(section: Exclude<FeasibilityRepairSection, "context" | "business-flow" | "plan">) {
    if (section === "technical")
        return TECHNICAL_KEYS;
    if (section === "delivery")
        return DELIVERY_KEYS;
    if (section === "economics")
        return ECONOMICS_KEYS;
    return VERDICT_KEYS;
}
function sectionPatchFromOutput(value: unknown, candidateIndex: number, section: Exclude<FeasibilityRepairSection, "context" | "business-flow" | "plan">) {
    if (isRecord(value) && isRecord(value.patch))
        return value.patch;
    if (!isRecord(value) || !Array.isArray(value.candidates))
        return null;
    const candidate = value.candidates[candidateIndex];
    if (!isRecord(candidate) || !isRecord(candidate.implementation))
        return null;
    return copyKeys({}, candidate.implementation, sectionKeys(section));
}
function applySectionPatch(value: unknown, candidateIndex: number, section: Exclude<FeasibilityRepairSection, "context" | "business-flow" | "plan">, patch: UnknownRecord) {
    if (!isRecord(value) || !Array.isArray(value.candidates))
        return value;
    const candidates = [...value.candidates];
    const candidate = candidates[candidateIndex];
    if (!isRecord(candidate) || !isRecord(candidate.implementation))
        return value;
    candidates[candidateIndex] = {
        ...candidate,
        implementation: copyKeys(candidate.implementation, patch, sectionKeys(section)),
    };
    return { ...value, candidates };
}
// Repair responses may contain unrelated rewrites. Only invalid groups are
// merged back, keeping every already-validated candidate section unchanged.
function mergeImplementationRepair(baseValue: unknown, repairedValue: unknown, issues: readonly FeasibilityValidationIssue[]) {
    if (!isRecord(baseValue) || !isRecord(repairedValue))
        return repairedValue;
    const next: UnknownRecord = { ...baseValue };
    const planIssue = issues.some((issue) => issue.section === "plan");
    if (planIssue) {
        for (const key of [
            "overview",
            "reducedCandidateReason",
            "recommendedCandidateId",
            "recommendationRationale",
        ]) {
            if (key in repairedValue)
                next[key] = repairedValue[key];
        }
    }
    if (!Array.isArray(baseValue.candidates) || !Array.isArray(repairedValue.candidates)) {
        return planIssue ? repairedValue : next;
    }
    const repairedCandidates = repairedValue.candidates;
    next.candidates = baseValue.candidates.map((baseCandidate, candidateIndex) => {
        const repairedCandidate = repairedCandidates[candidateIndex];
        if (!isRecord(baseCandidate) || !isRecord(repairedCandidate))
            return baseCandidate;
        const candidateIssues = issues.filter((issue) => issue.candidateIndex === candidateIndex || issue.candidateIndex === null);
        let candidate = { ...baseCandidate };
        if (candidateIssues.some((issue) => issue.section === "plan")) {
            candidate = copyKeys(candidate, repairedCandidate, [
                "id",
                "name",
                "summary",
                "advantages",
                "disadvantages",
                "estimatedCost",
                "estimatedSchedule",
                "sourceRequirementIds",
                "assumption",
                "provenance",
            ]);
        }
        if (!isRecord(baseCandidate.implementation) || !isRecord(repairedCandidate.implementation)) {
            return candidateIssues.length > 0 ? repairedCandidate : candidate;
        }
        let implementation = { ...baseCandidate.implementation };
        const sections = new Set(candidateIssues.map((issue) => issue.section));
        if (sections.has("technical")) {
            implementation = copyKeys(implementation, repairedCandidate.implementation, TECHNICAL_KEYS);
        }
        if (sections.has("delivery")) {
            implementation = copyKeys(implementation, repairedCandidate.implementation, DELIVERY_KEYS);
        }
        if (sections.has("economics")) {
            implementation = copyKeys(implementation, repairedCandidate.implementation, ECONOMICS_KEYS);
        }
        if (sections.has("verdict")) {
            implementation = copyKeys(implementation, repairedCandidate.implementation, VERDICT_KEYS);
        }
        return { ...candidate, implementation };
    });
    return next;
}
async function generateFeasibilityJson<T>(input: {
    record: RunRecord;
    stage: RunStage;
    promptStage: "context" | "business-flow" | "implementation";
    prompt: string;
    providerSettings: ProviderSettings;
    llmTransport: LlmTransport;
    diagnostics: FeasibilityGenerationDiagnostics;
    parse: (value: unknown) => {
        value: T;
        normalizationActions?: string[];
    };
}) {
    let prompt = input.prompt;
    let fullRetryUsed = false;
    let repairRound = 0;
    let baseParsedValue: unknown = null;
    let pendingIssues: FeasibilityValidationIssue[] = [];
    let lastIssues: FeasibilityValidationIssue[] = [];
    let preparedRepairValue: unknown = null;
    let attempt = 0;
    const diagramKind = input.promptStage === "context" ? "context" : input.promptStage === "business-flow" ? "activity" : undefined;
    while (true) {
        attempt += 1;
        throwIfRunCancelled(input.record);
        const fallback = (event: ResponseFormatFallbackEvent) => {
            input.diagnostics.effectiveMode = "json_object";
            input.diagnostics.downgradeReasons.push(`HTTP ${event.status}: ${event.reason}`);
            emitEvent(input.record, stageProgressRunEventSchema.parse({
                type: "stage_progress",
                stage: input.stage,
                progress: stageProgressValue(input.stage),
                message: "Provider 不支持严格 JSON Schema，本次任务已降级为 JSON 模式",
                subtaskStatus: "repairing",
            }));
        };
        let raw = "";
        let parsedValue: unknown;
        if (preparedRepairValue !== null) {
            parsedValue = preparedRepairValue;
            preparedRepairValue = null;
        }
        else {
            const repairAttempts = diagramKind ? readDiagramReviewCounters(input.record, diagramKind, diagramKind).repairAttempts : 0;
            const isModelRepair = Boolean(diagramKind && attempt > 1);
            if (isModelRepair && repairAttempts >= 2)
                break;
            raw = await collectTextResult(input.llmTransport, input.providerSettings, [
                {
                    role: "system",
                    content: "你是严谨的软件可行性分析师，只能基于给定事实输出契约要求的 JSON。",
                },
                { role: "user", content: prompt },
            ], createRunLlmChunkHandlers({ record: input.record, stage: input.stage,
                ...(diagramKind ? { subtaskId: diagramKind } : {}),
                ...(isModelRepair ? { operation: "model_repair", round: repairAttempts + 1 } : {}) }), responseFormatFor(input.promptStage, input.diagnostics), undefined, fallback);
            try {
                parsedValue = parseJson(raw);
            }
            catch (error) {
                logFailedStructuredOutput(input.stage, input.providerSettings.model, error, raw, attempt);
                if (fullRetryUsed) {
                    lastIssues = validationIssuesFromError(error, input.promptStage);
                    break;
                }
                fullRetryUsed = true;
                emitEvent(input.record, stageProgressRunEventSchema.parse({
                    type: "stage_progress",
                    stage: input.stage,
                    progress: stageProgressValue(input.stage),
                    message: "模型输出无法解析为 JSON，正在进行一次完整重试",
                    subtaskStatus: "repairing",
                }));
                prompt = buildRepairFeasibilityJsonPrompt({
                    stage: input.promptStage,
                    previousOutput: raw,
                    error: formatParseError(error),
                    originalPrompt: input.prompt,
                });
                continue;
            }
        }
        if (baseParsedValue !== null && pendingIssues.length > 0) {
            parsedValue = input.promptStage === "implementation"
                ? mergeImplementationRepair(baseParsedValue, parsedValue, pendingIssues)
                : parsedValue;
        }
        try {
            const result = input.parse(parsedValue);
            input.diagnostics.normalizationActions.push(...(result.normalizationActions ?? []));
            for (const repair of input.diagnostics.repairs) {
                if (repair.stage === input.promptStage &&
                    repair.round === repairRound)
                    repair.succeeded = true;
            }
            input.diagnostics.normalizationActions = [
                ...new Set(input.diagnostics.normalizationActions),
            ];
            return result.value;
        }
        catch (error) {
            logFailedStructuredOutput(input.stage, input.providerSettings.model, error, raw, attempt);
            lastIssues = validationIssuesFromError(error, input.promptStage);
            if (repairRound >= 2 || (diagramKind && readDiagramReviewCounters(input.record, diagramKind, diagramKind).repairAttempts >= 2))
                break;
            repairRound += 1;
            baseParsedValue = parsedValue;
            pendingIssues = lastIssues;
            const groups = new Map<string, FeasibilityValidationIssue>();
            for (const issue of lastIssues) {
                groups.set(`${issue.candidateIndex ?? "all"}:${issue.section}`, issue);
            }
            for (const issue of groups.values()) {
                input.diagnostics.repairs.push({
                    stage: input.promptStage,
                    candidateIndex: issue.candidateIndex,
                    section: issue.section,
                    round: repairRound,
                    succeeded: false,
                });
            }
            emitEvent(input.record, stageProgressRunEventSchema.parse({
                type: "stage_progress",
                stage: input.stage,
                progress: stageProgressValue(input.stage),
                message: `正在定点修复：${[...groups.values()]
                    .map((issue) => `候选${issue.candidateIndex === null ? "全部" : issue.candidateIndex + 1}/${issue.section}`)
                    .join("、")}`,
                subtaskStatus: "repairing",
            }));
            const targetedGroups = [...groups.values()].filter((issue): issue is FeasibilityValidationIssue & {
                candidateIndex: number;
                section: Exclude<FeasibilityRepairSection, "context" | "business-flow" | "plan">;
            } => input.promptStage === "implementation" &&
                issue.candidateIndex !== null &&
                issue.section !== "context" &&
                issue.section !== "business-flow" &&
                issue.section !== "plan");
            if (targetedGroups.length === groups.size) {
                input.record.conversationContext?.forkBranches(targetedGroups.map((issue) => `feasibility:${input.stage}:${issue.candidateIndex}:${issue.section}`));
                const patches = await Promise.all(targetedGroups.map(async (issue) => {
                    const sectionPrompt = buildRepairFeasibilitySectionPrompt({
                        candidateIndex: issue.candidateIndex,
                        section: issue.section,
                        currentPlan: parsedValue,
                        issues: lastIssues
                            .filter((item) => item.candidateIndex === issue.candidateIndex &&
                            item.section === issue.section)
                            .map((item) => `${item.path}: ${item.reason}`),
                        originalPrompt: input.prompt,
                    });
                    const branchId = `feasibility:${input.stage}:${issue.candidateIndex}:${issue.section}`;
                    const sectionRaw = await withConversationBranch(branchId, () => collectTextResult(input.llmTransport, input.providerSettings, [
                        {
                            role: "system",
                            content: "你是严谨的软件可行性分析师，只能输出指定候选章节的 JSON patch。",
                        },
                        { role: "user", content: sectionPrompt },
                    ], createRunLlmChunkHandlers({ record: input.record, stage: input.stage }), sectionResponseFormatFor(issue.section, input.diagnostics), undefined, fallback));
                    try {
                        const patch = sectionPatchFromOutput(parseJson(sectionRaw), issue.candidateIndex, issue.section);
                        input.record.conversationContext?.commitValidatedBranch(branchId, JSON.stringify(patch));
                        return {
                            issue,
                            patch,
                        };
                    }
                    catch (error) {
                        logFailedStructuredOutput(input.stage, input.providerSettings.model, error, sectionRaw, repairRound);
                        return { issue, patch: null };
                    }
                }));
                preparedRepairValue = patches.reduce((current, { issue, patch }) => patch
                    ? applySectionPatch(current, issue.candidateIndex, issue.section, patch)
                    : current, parsedValue);
                pendingIssues = [];
                baseParsedValue = preparedRepairValue;
                continue;
            }
            prompt = buildRepairFeasibilityJsonPrompt({
                stage: input.promptStage,
                previousOutput: JSON.stringify(parsedValue),
                error: lastIssues
                    .map((issue) => `${issue.path || "<root>"} [${issue.section}]: ${issue.reason}`)
                    .join("\n"),
                originalPrompt: input.prompt,
            });
        }
    }
    throwRunError(createRunError("RUN_STRUCTURED_OUTPUT_INVALID", `所选模型返回的${input.promptStage === "context" ? "系统环境图" : input.promptStage === "business-flow" ? "业务与系统流程图" : "实现方案"}结构不符合要求，定点修复后仍未通过校验。`, {
        details: {
            validationIssues: lastIssues,
            requestedMode: input.diagnostics.requestedMode,
            effectiveMode: input.diagnostics.effectiveMode,
            downgradeReasons: input.diagnostics.downgradeReasons,
            normalizationActions: input.diagnostics.normalizationActions,
            repairs: input.diagnostics.repairs,
        },
    }));
}
// route -> pipeline -> record store: only validated artifacts are committed to the snapshot.
export async function runFeasibilityStagePipeline(record: RunRecord, providerSettings: ProviderSettings, llmTransport: LlmTransport, renderClient: RenderClient, pngRenderClient?: PngRenderClient) {
    const snapshot = record.snapshot as FeasibilityRunSnapshot;
    // Replayed snapshots also reconcile rule facts before any generation prompt.
    const requirementSource = buildAcceptedRequirementSnapshot(snapshot.rules, snapshot.requirementBaseline);
    snapshot.requirementBaseline = requirementSource.baseline;
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
        if (!activeStages.delete(stage))
            return;
        emitEvent(record, stageFinishedRunEventSchema.parse({ type: "stage_finished", stage, status }));
    };
    const updateStage = (stage: RunStage, message: string) => {
        throwIfRunCancelled(record);
        snapshot.currentStage = stage as FeasibilityRunSnapshot["currentStage"];
        snapshot.status = "running";
        if (!activeStages.has(stage)) {
            activeStages.add(stage);
            emitEvent(record, stageStartedRunEventSchema.parse({ type: "stage_started", stage, tracksCompletion: true }));
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
        updateStage("verify_diagram_visual", "正在核对模型结构与图面");
        try {
            return await reviewRenderedArtifact(input);
        }
        catch (error) {
            reviewFailed = true;
            throwIfRunCancelled(record);
            if (error instanceof DiagramReviewRenderError) {
                snapshot.visualReviews[input.model.modelId ?? input.model.diagramKind] = error.review;
                throwRunError(createRunError(error.review.structureStatus === "failed" ? "RUN_STRUCTURED_OUTPUT_INVALID" : "RUN_RENDER_FAILED", error.message));
            }
            throw error;
        }
        finally {
            if (--activeReviews === 0)
                finishStage("verify_diagram_visual", isRunCancelled(record) ? "cancelled" : reviewFailed ? "failed" : "completed");
        }
    };
    const generateContext = async () => {
        if (!snapshot.selectedArtifacts.includes("context"))
            return;
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
        const checked = await reviewCandidate({ record, providerSettings, llmTransport, renderClient, pngRenderClient,
            model: contextModel, mutable: true,
            basis: { stage: "feasibility", baseline: snapshot.requirementBaseline, rules: snapshot.rules, traceability: traceabilityFromContext(contextModel) },
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
        snapshot.contextFingerprint = snapshotInputFingerprint({
            rules: snapshot.rules,
            requirementBaseline: snapshot.requirementBaseline,
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
        if (!snapshot.selectedArtifacts.includes("business-flow"))
            return;
        updateStage("generate_business_flow", "正在根据需求规则生成业务与系统流程图");
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
        updateStage("render_business_flow", "正在渲染业务与系统流程图");
        const checked = await reviewCandidate({ record, providerSettings, llmTransport, renderClient, pngRenderClient,
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
            modelId: result.model.modelId, subtaskId: "business-flow", subtaskLabel: "业务与系统流程图", subtaskStatus: "completed",
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
        for (const stage of [...activeStages])
            finishStage(stage, isRunCancelled(record) ? "cancelled" : "failed");
        throw sourceFailure.reason;
    }
    if (snapshot.selectedArtifacts.includes("implementation")) {
        const requirementFingerprint = buildAcceptedRequirementSnapshot(snapshot.rules, snapshot.requirementBaseline).snapshot.fingerprint;
        if (!snapshot.contextModel || !snapshot.contextPlantUml?.source || !snapshot.contextSvg?.svg ||
            snapshot.contextFingerprint !== requirementFingerprint) {
            throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "请先生成最新有效的系统环境图。"));
        }
        const businessFlow = readFeasibilityBusinessFlowArtifact(snapshot.businessFlow);
        if (!businessFlow || businessFlow.fingerprint !== requirementFingerprint) {
            throwRunError(createRunError("RUN_DEPENDENCY_MISSING", "请先生成最新有效的业务与系统流程图。"));
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
                const normalized = normalizeFeasibilityImplementationDetailed(value, validRequirementIds, contextExternalSystems);
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
    for (const stage of [...activeStages])
        finishStage(stage);
    snapshot.currentStage = null;
    snapshot.status = "completed";
    snapshot.error = null;
    emitEvent(record, completedRunEventSchema.parse({ type: "completed", snapshot }));
}
