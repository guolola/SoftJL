// Starts the correct pipeline for an existing queued run record and owns shared failure handling.
import { failedRunEventSchema, stageProgressRunEventSchema, type DiagramKind, type ProviderSettings, type RunStage, type StartDocumentRunRequest, } from "@uml-platform/contracts";
import type { LlmTransport, StreamChatCompletionInput } from "../../llm.js";
import { createScheduledLlmTransport, type LlmScheduler, type LlmScheduleStatus, } from "../../adapters/llm/llm-scheduler.js";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import { projectDocumentWorkspaceId } from "../../documents/library/project-document-workspace.js";
import type { ProviderTaskType } from "../../provider-configs/provider-usage-tracker.js";
import { emitEvent, type RunRecord } from "../records/run-record-store.js";
import { isRunCancelled, isRunCancelledError } from "../records/run-cancellation.js";
import { stageProgressValue } from "./shared/pipeline-events.js";
import { createContextualLlmTransport } from "./shared/conversation-context.js";
import { getPromptRuntimeStore, pinPromptRuntimeSnapshot, withPinnedPrompts } from "../../prompt-runtime/store.js";
import { normalizeRunError, } from "./shared/errors.js";
import { runFeasibilityStagePipeline } from "./feasibility-pipeline.js";
import type { RunTelemetryStore } from "../../runs/records/run-telemetry-store.js";
type RequirementPipeline = (record: RunRecord, providerSettings: ProviderSettings, llmTransport: LlmTransport, renderClient: RenderClient, pngRenderClient?: PngRenderClient) => Promise<void>;
type DesignPipeline = (record: RunRecord, providerSettings: ProviderSettings, llmTransport: LlmTransport, renderClient: RenderClient, pngRenderClient?: PngRenderClient) => Promise<void>;
type DocumentPipeline = (record: RunRecord, input: StartDocumentRunRequest, documentLibrary: DocumentLibrary, workspaceId: string, providerSettings: ProviderSettings, llmTransport: LlmTransport, pngRenderClient: PngRenderClient) => Promise<void>;
const REQUIREMENT_LLM_SUBTASK_LABELS: Record<string, string> = {
    function: "功能结构图",
    usecase: "用例模型",
    class: "类模型",
    activity: "总体业务流程",
    deployment: "部署需求模型",
    prototype: "原型界面关系",
    analysis: "需求分析模型",
};
const DESIGN_LLM_SUBTASK_LABELS: Record<string, string> = {
    architecture: "总体架构图",
    sequence: "用例实现设计",
    class: "设计类图",
    activity: "界面关系图",
    component: "组件（构件）关系",
    deployment: "部署设计",
    table: "数据库设计",
};
const KNOWN_LLM_DIAGRAM_KINDS = new Set([
    "function",
    "usecase",
    "class",
    "activity",
    "deployment",
    "prototype",
    "analysis",
    "architecture",
    "sequence",
    "component",
    "table",
]);
function deriveLlmSubtaskContext(input: StreamChatCompletionInput) {
    const prompt = String(input.messages.at(-1)?.content ?? "");
    const designMatch = prompt.match(/只生成以下设计图类型：\s*\n?([^\n]+)/);
    const requirementMatch = prompt.match(/只生成以下图类型：\s*\n?([^\n]+)/);
    const match = designMatch ?? requirementMatch;
    const selected = match?.[1]
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const isDesignSequencePrompt = prompt.includes("生成设计阶段用例实现设计") ||
        prompt.includes("生成设计阶段顺序图结构化模型");
    const diagramKind = selected?.length === 1 && KNOWN_LLM_DIAGRAM_KINDS.has(selected[0]!)
        ? selected[0]!
        : isDesignSequencePrompt
            ? "sequence"
            : null;
    if (!diagramKind)
        return {};
    const labels = designMatch || isDesignSequencePrompt
        ? DESIGN_LLM_SUBTASK_LABELS
        : REQUIREMENT_LLM_SUBTASK_LABELS;
    return {
        diagramKind: diagramKind as DiagramKind,
        subtaskId: diagramKind,
        subtaskLabel: labels[diagramKind] ?? diagramKind,
    };
}
function taskTypeForRecord(record: RunRecord): ProviderTaskType {
    const snapshot = record.snapshot;
    if ("selectedArtifacts" in snapshot)
        return "feasibility_analysis";
    if ("documentKind" in snapshot)
        return "document_generation";
    if ("designModelTraceability" in snapshot)
        return "design_modeling";
    return "requirements_to_uml";
}
function requestedModelCountForRecord(record: RunRecord, taskType: ProviderTaskType) {
    if (taskType !== "requirements_to_uml" && taskType !== "design_modeling")
        return null;
    const snapshot = record.snapshot as {
        requestedDiagrams?: unknown;
        selectedDiagrams?: unknown;
    };
    const requested = Array.isArray(snapshot.requestedDiagrams)
        ? snapshot.requestedDiagrams
        : Array.isArray(snapshot.selectedDiagrams)
            ? snapshot.selectedDiagrams
            : null;
    return requested?.length ?? null;
}
function documentInputFromSnapshot(record: RunRecord): StartDocumentRunRequest {
    const snapshot = record.snapshot;
    if (!("documentKind" in snapshot)) {
        throw new Error("Run record is not a document run");
    }
    return {
        projectId: record.metadata?.projectId,
        documentKind: snapshot.documentKind,
        requirementText: snapshot.requirementText,
        requirementBaseline: snapshot.requirementBaseline,
        coverageMatrix: snapshot.coverageMatrix,
        traceabilityMatrix: snapshot.traceabilityMatrix,
        rules: [],
        requirementModels: [],
        requirementModelTraceability: [],
        requirementPlantUml: [],
        requirementSvgArtifacts: [],
        designModels: [],
        designModelTraceability: [],
        designPlantUml: [],
        designSvgArtifacts: [],
        feasibilityImplementationPlan: snapshot.feasibilityImplementationPlan,
        feasibilityInputs: snapshot.feasibilityInputs,
        useAiText: true,
    };
}
function createRunLlmTransport({ record, providerSettings, providerConfigId, taskType, llmTransport, llmScheduler, analyticsStore, }: {
    record: RunRecord;
    providerSettings: ProviderSettings;
    providerConfigId: string | null;
    taskType: ProviderTaskType;
    llmTransport: LlmTransport;
    llmScheduler?: LlmScheduler;
    analyticsStore?: Pick<RunTelemetryStore, "recordTelemetry">;
}) {
    if (!llmScheduler)
        return llmTransport;
    const emitQueueStatus = (status: LlmScheduleStatus, context: {
        diagramKind?: string | null;
        subtaskId?: string | null;
        subtaskLabel?: string | null;
        stage?: RunStage | null;
    }) => {
        const stage = context.stage ?? record.snapshot.currentStage ?? "generate_models";
        if (isRunCancelled(record))
            return;
        const queueText = status.status === "queued"
            ? `模型调用排队中：前方 ${status.queueAhead ?? 0} 个模型调用`
            : status.status === "running"
                ? "模型调用开始执行"
                : status.status === "cancelled"
                    ? "模型调用已取消"
                    : "模型调用完成，正在解析结果";
        emitEvent(record, stageProgressRunEventSchema.parse({
            type: "stage_progress",
            stage,
            progress: stageProgressValue(stage),
            message: queueText,
            subtaskStatus: status.status === "queued"
                ? "queued"
                : status.status === "running"
                    ? "running"
                    : status.status === "completed"
                        ? "running"
                        : "failed",
            diagramKind: context.diagramKind,
            subtaskId: context.subtaskId,
            subtaskLabel: context.subtaskLabel,
            queuePosition: status.queuePosition,
            queueAhead: status.queueAhead,
            waitMs: status.waitMs,
            estimatedWaitMs: status.estimatedWaitMs,
            queueReason: status.queueReason,
        }));
    };
    return createScheduledLlmTransport({
        transport: llmTransport,
        scheduler: llmScheduler,
        context: {
            runId: record.snapshot.runId,
            projectId: record.metadata?.projectId,
            userId: record.metadata?.userId,
            providerConfigId,
            model: providerSettings.model,
            taskType,
            requestedModelCount: requestedModelCountForRecord(record, taskType),
        },
        deriveContext: (input) => ({
            stage: record.snapshot.currentStage ?? null,
            ...deriveLlmSubtaskContext(input),
            ...input.runContext,
        }),
        onStatus: emitQueueStatus,
        analyticsStore,
    });
}
// Always retain this call at failure boundaries: it updates state and publishes the terminal event.
export function handleRunPipelineError(record: RunRecord, error: unknown) {
    if (isRunCancelledError(error) || isRunCancelled(record))
        return null;
    const runError = normalizeRunError(error);
    record.snapshot.status = "failed";
    record.snapshot.error = runError;
    emitEvent(record, failedRunEventSchema.parse({
        type: "failed",
        stage: record.snapshot.currentStage ?? undefined,
        error: runError,
    }));
    return runError;
}
export function startRunRecordPipeline({ record, providerSettings, providerConfigId, llmTransport, llmScheduler, renderClient, pngRenderClient, documentLibrary, runStagePipeline, runDesignStagePipeline, runDocumentStagePipeline, documentInput, analyticsStore, }: {
    record: RunRecord;
    providerSettings: ProviderSettings;
    providerConfigId: string | null;
    llmTransport: LlmTransport;
    llmScheduler?: LlmScheduler;
    analyticsStore?: Pick<RunTelemetryStore, "recordTelemetry">;
    renderClient: RenderClient;
    pngRenderClient: PngRenderClient;
    documentLibrary: DocumentLibrary;
    runStagePipeline: RequirementPipeline;
    runDesignStagePipeline: DesignPipeline;
    runDocumentStagePipeline: DocumentPipeline;
    documentInput?: StartDocumentRunRequest;
}) {
    void runRunRecordPipeline({
        record,
        providerSettings,
        providerConfigId,
        llmTransport,
        llmScheduler,
        renderClient,
        pngRenderClient,
        documentLibrary,
        runStagePipeline,
        runDesignStagePipeline,
        runDocumentStagePipeline,
        documentInput,
        analyticsStore,
    });
}
export function startFeasibilityRecordPipeline({ record, providerSettings, providerConfigId, llmTransport, llmScheduler, renderClient, pngRenderClient, analyticsStore, }: {
    record: RunRecord;
    providerSettings: ProviderSettings;
    providerConfigId: string | null;
    llmTransport: LlmTransport;
    llmScheduler?: LlmScheduler;
    analyticsStore?: Pick<RunTelemetryStore, "recordTelemetry">;
    renderClient: RenderClient;
    pngRenderClient?: PngRenderClient;
}) {
    const scheduledTransport = createRunLlmTransport({
        record,
        providerSettings,
        providerConfigId,
        taskType: "feasibility_analysis",
        llmTransport,
        llmScheduler,
        analyticsStore,
    });
    const entitlementTransport = scheduledTransport;
    void (async () => {
        try {
            const demo = record.metadata?.offlineDemoFixture === "library-seat"
                ? (await import("../demo/offline-feasibility.js")).offlineFeasibilityAdapters(record)
                : null;
            const promptVersions = await getPromptRuntimeStore().publishedSnapshot();
            const conversation = createContextualLlmTransport(demo?.llmTransport ?? withPinnedPrompts(entitlementTransport, promptVersions));
            record.conversationContext = conversation;
            await runFeasibilityStagePipeline(record, providerSettings, conversation.transport, demo?.renderClient ?? renderClient, demo?.pngRenderClient ?? pngRenderClient);
        }
        catch (error) {
            handleRunPipelineError(record, error);
        }
    })();
}
export async function runRunRecordPipeline({ record, providerSettings, providerConfigId, llmTransport, llmScheduler, renderClient, pngRenderClient, documentLibrary, runStagePipeline, runDesignStagePipeline, runDocumentStagePipeline, documentInput, analyticsStore, }: {
    record: RunRecord;
    providerSettings: ProviderSettings;
    providerConfigId: string | null;
    llmTransport: LlmTransport;
    llmScheduler?: LlmScheduler;
    analyticsStore?: Pick<RunTelemetryStore, "recordTelemetry">;
    renderClient: RenderClient;
    pngRenderClient: PngRenderClient;
    documentLibrary: DocumentLibrary;
    runStagePipeline: RequirementPipeline;
    runDesignStagePipeline: DesignPipeline;
    runDocumentStagePipeline: DocumentPipeline;
    documentInput?: StartDocumentRunRequest;
}) {
    const taskType = taskTypeForRecord(record);
    const scheduledTransport = createRunLlmTransport({
        record,
        providerSettings,
        providerConfigId,
        taskType,
        llmTransport,
        llmScheduler,
        analyticsStore,
    });
    const entitlementTransport = scheduledTransport;
    try {
        // Persisted demo runs can resume without eagerly loading fixtures for provider runs.
        const demo = taskType === "feasibility_analysis" && record.metadata?.offlineDemoFixture === "library-seat"
            ? (await import("../demo/offline-feasibility.js")).offlineFeasibilityAdapters(record)
            : null;
        const promptVersions = await getPromptRuntimeStore().publishedSnapshot();
        pinPromptRuntimeSnapshot(record, promptVersions);
        const promptTransport = withPinnedPrompts(entitlementTransport, promptVersions);
        const conversation = createContextualLlmTransport(demo?.llmTransport ?? promptTransport);
        record.conversationContext = conversation;
        const runPromise = taskType === "feasibility_analysis"
            ? runFeasibilityStagePipeline(record, providerSettings, conversation.transport, demo?.renderClient ?? renderClient, demo?.pngRenderClient ?? pngRenderClient)
            : taskType === "document_generation"
                ? runDocumentStagePipeline(record, documentInput ?? documentInputFromSnapshot(record), documentLibrary, projectDocumentWorkspaceId(record.metadata?.projectId ?? "default"), providerSettings, conversation.transport, pngRenderClient)
                : taskType === "design_modeling"
                    ? runDesignStagePipeline(record, providerSettings, conversation.transport, renderClient, pngRenderClient)
                    : runStagePipeline(record, providerSettings, conversation.transport, renderClient, pngRenderClient);
        await runPromise;
    }
    catch (error) {
        handleRunPipelineError(record, error);
    }
}
