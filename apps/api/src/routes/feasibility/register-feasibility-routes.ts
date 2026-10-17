// Registers feasibility run endpoints; lifecycle work is delegated to the formal run pipeline.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { buildAcceptedRequirementSnapshot, readFeasibilityBusinessFlowArtifact, contextDiagramSpecSchema, contextTraceRowSchema, feasibilityInputsSchema, feasibilityRunSnapshotSchema, queuedRunEventSchema, startFeasibilityRunRequestSchema, type ProviderSettings, } from "@uml-platform/contracts";
import type { RenderClient } from "../../adapters/render/render-client.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import type { LlmScheduler } from "../../adapters/llm/llm-scheduler.js";
import type { LlmTransport } from "../../llm.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type { ModelCatalog } from "../../provider-configs/model-catalog.js";
import { resolveProviderRateLimitPolicy, type ProviderUsageTracker, } from "../../provider-configs/provider-usage-tracker.js";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import { generatePlantUmlArtifacts } from "../../plantuml.js";
import { createEmptyFeasibilitySnapshot } from "../../runs/records/snapshots.js";
import { emitEvent, refreshRunRecordIfAvailable, releaseRunRecordIfAvailable, type RunRecord, type RunRecordMetadata, type RunRecordStore, } from "../../runs/records/run-record-store.js";
import { registerRunEventsRoute } from "../../runs/records/run-events.js";
import { flushRunStoreIfAvailable, type RunQueue } from "../../runs/queue/run-queue.js";
import { checkGenerationUsageLimit, checkProviderUsageLimit, recordGenerationUsage, recordProviderUsage, providerResolutionFailureResponse, resolveProviderConfigIdForRun, resolveProviderSettingsForRun, } from "../../runs/providers/run-provider-gates.js";
import { startFeasibilityRecordPipeline } from "../../runs/pipelines/run-record-pipeline-starter.js";
import { captureWorkspaceGuard } from "../../runs/records/workspace-run-guard.js";
import { isOfflineDemoProject, offlineDemoProviderSettings } from "../../runs/demo/offline-demo-runs.js";
import type { RunTelemetryStore } from "../../runs/records/run-telemetry-store.js";
import { attachProjectWorkspaceSync, type ProjectWorkspaceSync, } from "../runs/project-workspace-sync.js";
type ProjectWorkspace = {
    version: number;
    state: Record<string, unknown>;
};
function acceptedRules(state: Record<string, unknown>) {
    return buildAcceptedRequirementSnapshot(state.rules ?? [], state.requirementBaseline ?? null);
}
function existingContextFromWorkspace(state: Record<string, unknown>, expectedFingerprint: string) {
    const context = contextDiagramSpecSchema.safeParse(state.feasibilityContextModel ?? null);
    const source = typeof state.feasibilityContextPlantUml === "string" ? state.feasibilityContextPlantUml : "";
    const svg = typeof state.feasibilityContextSvg === "string" ? state.feasibilityContextSvg : "";
    const fingerprint = typeof state.feasibilityContextFingerprint === "string"
        ? state.feasibilityContextFingerprint
        : null;
    if (!context.success || !source || !svg || fingerprint !== expectedFingerprint)
        return null;
    const generatedArtifact = generatePlantUmlArtifacts([context.data])[0];
    if (!generatedArtifact)
        return null;
    const traceability = contextTraceRowSchema.array().safeParse(state.feasibilityContextTraceability ?? []);
    return {
        contextModel: context.data,
        contextTraceability: traceability.success ? traceability.data : [],
        contextPlantUml: { ...generatedArtifact, source },
        contextSvg: {
            ...generatedArtifact,
            svg,
            renderMeta: {
                engine: "workspace",
                generatedAt: new Date().toISOString(),
                sourceLength: source.length,
                durationMs: 0,
            },
        },
        contextFingerprint: fingerprint,
    };
}
export function registerFeasibilityRoutes({ app, runs, renderClient, pngRenderClient, llmTransport, llmScheduler, providerConfigs, providerUsageTracker, generationUsage, runQueue, defaultSseAllowOrigin, resolveUserId, canUpdateProject, loadWorkspace, resolveProjectName, syncProjectWorkspace, analyticsStore, modelCatalog, }: {
    app: FastifyInstance;
    runs: RunRecordStore;
    renderClient: RenderClient;
    pngRenderClient?: PngRenderClient;
    llmTransport: LlmTransport;
    llmScheduler?: LlmScheduler;
    providerConfigs?: ProviderConfigStore;
    providerUsageTracker?: ProviderUsageTracker;
    generationUsage?: GenerationUsageService;
    runQueue?: RunQueue;
    defaultSseAllowOrigin: string;
    resolveUserId: (request: FastifyRequest) => Promise<string | null>;
    canUpdateProject: (projectId: string, userId: string) => Promise<boolean>;
    loadWorkspace: (projectId: string) => Promise<ProjectWorkspace>;
    resolveProjectName?: (projectId: string) => Promise<string | null>;
    syncProjectWorkspace?: ProjectWorkspaceSync;
    analyticsStore?: Pick<RunTelemetryStore, "recordTelemetry">;
    modelCatalog?: ModelCatalog;
}) {
    const usageAccess = {
        async resolveRunAccess(request: FastifyRequest) {
            return { userId: (await resolveUserId(request)) ?? undefined };
        },
    };
    app.post("/api/feasibility-runs", async (request, reply) => {
        const parsedInput = startFeasibilityRunRequestSchema.safeParse(request.body);
        if (!parsedInput.success) {
            return reply.code(400).send({ message: "请提交项目、目标产物以及有效的 Provider 和模型。" });
        }
        const input = parsedInput.data;
        const userId = await resolveUserId(request);
        if (!userId)
            return reply.code(401).send({ message: "Authentication required" });
        if (!(await canUpdateProject(input.projectId, userId))) {
            return reply.code(403).send({ message: "Project update access denied" });
        }
        const offlineDemo = isOfflineDemoProject(input.projectId) ||
            isOfflineDemoProject(input.projectId, await resolveProjectName?.(input.projectId));
        const metadata: RunRecordMetadata = {
            userId,
            projectId: input.projectId,
            model: offlineDemo ? offlineDemoProviderSettings.model : input.providerSettings.model,
            ...(offlineDemo ? { offlineDemoFixture: "library-seat" as const } : {}),
            createdAt: new Date().toISOString(),
        };
        const providerResolution = offlineDemo ? { ok: true as const, providerSettings: offlineDemoProviderSettings } : await resolveProviderSettingsForRun({
            providerSettings: input.providerSettings,
            metadata,
            providerConfigs,
            request,
            reply,
        });
        if (!providerResolution.ok) {
            return providerResolutionFailureResponse(reply, providerResolution);
        }
        const providerSettings = providerResolution.providerSettings;
        const providerConfigId = offlineDemo ? null : await resolveProviderConfigIdForRun({ providerSettings: input.providerSettings });
        const capacity = providerConfigId ? modelCatalog?.resolve(providerConfigId, providerSettings.model, providerSettings.apiBaseUrl) : undefined;
        if (capacity?.capabilities?.reasoning !== true)
            input.reasoning = undefined;
        const generationCheck = offlineDemo ? true : await checkGenerationUsageLimit({
            generationUsage,
            runAccessGuard: usageAccess,
            request,
            reply,
        });
        if (generationCheck !== true)
            return generationCheck;
        const providerCheck = offlineDemo ? true : await checkProviderUsageLimit({
            usageTracker: providerUsageTracker,
            providerConfigId,
            metadata,
            request,
            taskType: "feasibility_analysis",
            policy: resolveProviderRateLimitPolicy(),
            reply,
        });
        if (providerCheck !== true)
            return providerCheck;
        const workspace = await loadWorkspace(input.projectId);
        const { rules, baseline, snapshot: requirementSource } = acceptedRules(workspace.state);
        if (rules.length === 0) {
            return reply.code(409).send({ message: "请先在系统需求页确认至少一条有效需求规则。" });
        }
        const inputs = feasibilityInputsSchema.parse(workspace.state.feasibilityInputs ?? {});
        const expectedContextFingerprint = requirementSource.fingerprint;
        const existingContext = existingContextFromWorkspace(workspace.state, expectedContextFingerprint);
        const savedBusinessFlow = readFeasibilityBusinessFlowArtifact(workspace.state.feasibilityBusinessFlow);
        const existingBusinessFlow = savedBusinessFlow?.fingerprint === requirementSource.fingerprint
            ? savedBusinessFlow : null;
        if (input.selectedArtifacts.includes("implementation") &&
            !input.selectedArtifacts.includes("context") &&
            !existingContext) {
            return reply.code(409).send({ message: "实现方案依赖最新有效的系统环境图，请同时选择该图。" });
        }
        if (input.selectedArtifacts.includes("implementation") &&
            !input.selectedArtifacts.includes("business-flow") && !existingBusinessFlow) {
            return reply.code(409).send({ message: "实现方案依赖最新有效的业务与系统流程图，请同时选择该图。" });
        }
        const runId = randomUUID();
        if (!offlineDemo)
            await recordProviderUsage({
                usageTracker: providerUsageTracker,
                providerConfigId,
                metadata,
                request,
                taskType: "feasibility_analysis",
            });
        if (!offlineDemo)
            await recordGenerationUsage({
                generationUsage,
                runAccessGuard: usageAccess,
                request,
                taskType: "feasibility_analysis",
                providerConfigId,
            });
        const record: RunRecord = {
            snapshot: createEmptyFeasibilitySnapshot(runId, {
                projectId: input.projectId,
                selectedArtifacts: input.selectedArtifacts,
                reasoning: input.reasoning,
                providerSettings: offlineDemo ? { providerConfigId: "offline-demo", model: offlineDemoProviderSettings.model } : input.providerSettings,
                rules,
                requirementBaseline: baseline,
                requirementSource,
                inputs,
                ...(existingContext ?? {}),
                businessFlow: input.selectedArtifacts.includes("business-flow") ? null : existingBusinessFlow,
            }),
            events: [],
            listeners: new Set(),
            terminal: false,
            metadata,
        };
        runs.set(runId, record);
        record.snapshot.modelCapacity = capacity;
        record.snapshot.workspaceGuard = captureWorkspaceGuard(record, workspace.state);
        await syncProjectWorkspace?.prepare?.(record);
        attachProjectWorkspaceSync(record, syncProjectWorkspace);
        runQueue?.attachEventPublisher(record);
        // PostgreSQL persistence must complete before any workspace sync can use this run as a foreign key.
        await flushRunStoreIfAvailable(runs);
        emitEvent(record, queuedRunEventSchema.parse({ type: "queued" }));
        if (runQueue?.enabled && !offlineDemo) {
            await flushRunStoreIfAvailable(runs);
            await runQueue.enqueueRun({ record });
            releaseRunRecordIfAvailable(runs, runId);
        }
        else {
            startFeasibilityRecordPipeline({
                record,
                providerSettings: providerSettings as ProviderSettings,
                providerConfigId,
                llmTransport,
                llmScheduler,
                renderClient,
                pngRenderClient,
                analyticsStore,
            });
        }
        return reply.code(202).send({ runId });
    });
    app.get("/api/feasibility-runs/:runId", async (request, reply) => {
        const { runId } = request.params as {
            runId: string;
        };
        const record = await refreshRunRecordIfAvailable(runs, runId);
        if (!record || !("selectedArtifacts" in record.snapshot)) {
            return reply.code(404).send({ message: "Feasibility run not found" });
        }
        const userId = await resolveUserId(request);
        if (!userId)
            return reply.code(401).send({ message: "Authentication required" });
        if (!record.metadata?.projectId || !(await canUpdateProject(record.metadata.projectId, userId))) {
            return reply.code(403).send({ message: "Project access denied" });
        }
        return feasibilityRunSnapshotSchema.parse(record.snapshot);
    });
    registerRunEventsRoute({
        app,
        runs,
        path: "/api/feasibility-runs/:runId/events",
        notFoundMessage: "Feasibility run not found",
        defaultAllowOrigin: defaultSseAllowOrigin,
        subscribeRunEvents: runQueue?.subscribeRunEvents,
        canReadRunRecord: async (request, reply, record) => {
            if (!("selectedArtifacts" in record.snapshot))
                return false;
            const userId = await resolveUserId(request);
            if (!userId) {
                reply.code(401);
                return false;
            }
            return Boolean(record.metadata?.projectId && await canUpdateProject(record.metadata.projectId, userId));
        },
    });
}
