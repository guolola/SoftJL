// Recreates queued project runs for retry/rerun after route-level access is resolved.
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { apiErrorResponseSchema, type ProviderSettings, type RunAction, } from "@uml-platform/contracts";
import type { GenerationUsageService } from "../../generation/generation-usage.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type { ProviderRateLimitPolicy, ProviderUsageTracker, } from "../../provider-configs/provider-usage-tracker.js";
import { offlineDemoProviderSettings } from "../demo/offline-demo-runs.js";
import { checkGenerationUsageLimit, checkProviderUsageLimit, isActiveRun, recordGenerationUsage, recordProviderUsage, rememberProviderSettings, providerResolutionFailureResponse, resolveProviderConfigIdForRun, resolveProviderSettingsForRun, snapshotProviderSettings, taskTypeForRun, } from "../providers/run-provider-gates.js";
import { createQueuedRunFromSource, isRetryableRun, } from "../records/run-actions.js";
import { refreshRunRecordIfAvailable, type RunRecord, type RunRecordMetadata, type RunRecordStore, } from "../records/run-record-store.js";
type ProjectRunAction = Extract<RunAction, "retry" | "rerun">;
type StartProjectRunActionPipeline = (input: {
    record: RunRecord;
    providerSettings: ProviderSettings;
    providerConfigId: string | null;
}) => void | Promise<void>;
type RunAccessResolver = {
    resolveRunAccess(request: FastifyRequest): Promise<{
        userId?: string;
        email?: string | null;
    }>;
};
export async function createProjectRunAction({ request, reply, action, projectId, runId, actorUserId, runs, runAccessGuard, providerConfigs, providerUsageTracker, generationUsage, providerRateLimitPolicy, startRecordPipeline, }: {
    request: FastifyRequest;
    reply: FastifyReply;
    action: ProjectRunAction;
    projectId: string;
    runId: string;
    actorUserId?: string;
    runs: RunRecordStore;
    runAccessGuard: RunAccessResolver;
    providerConfigs?: ProviderConfigStore;
    providerUsageTracker?: ProviderUsageTracker;
    generationUsage?: GenerationUsageService;
    providerRateLimitPolicy: ProviderRateLimitPolicy;
    startRecordPipeline: StartProjectRunActionPipeline;
}) {
    const source = await refreshRunRecordIfAvailable(runs, runId);
    if (!source || source.metadata?.projectId !== projectId) {
        reply.code(404);
        return apiErrorResponseSchema.parse({
            error: { code: "RUN_NOT_FOUND", category: "not_found", retryable: false },
        });
    }
    if (action === "retry" && !isRetryableRun(source)) {
        reply.code(409);
        return apiErrorResponseSchema.parse({
            error: { code: "RUN_NOT_RETRYABLE", category: "conflict", retryable: false },
        });
    }
    if (isActiveRun(source)) {
        reply.code(409);
        return apiErrorResponseSchema.parse({
            error: { code: "RUN_ACTIVE_CONFLICT", category: "conflict", retryable: false },
        });
    }
    const metadata: RunRecordMetadata = {
        userId: actorUserId,
        projectId,
        createdAt: new Date().toISOString(),
    };
    if (source.metadata?.offlineDemoFixture === "library-seat" && "selectedArtifacts" in source.snapshot) {
        const result = createQueuedRunFromSource({ runs, source, metadata, action, sourceRunId: runId, actorUserId });
        const record = runs.get(result.runId)!;
        await startRecordPipeline({ record, providerSettings: offlineDemoProviderSettings, providerConfigId: null });
        reply.code(202);
        return result;
    }
    const providerSettingsInput = snapshotProviderSettings(source);
    const providerResolution = await resolveProviderSettingsForRun({
        providerSettings: providerSettingsInput,
        metadata,
        providerConfigs,
        request,
        reply,
    });
    if (!providerResolution.ok) {
        return providerResolutionFailureResponse(reply, providerResolution);
    }
    const providerSettings = providerResolution.providerSettings;
    const providerConfigId = await resolveProviderConfigIdForRun({
        providerSettings: providerSettingsInput,
    });
    const taskType = taskTypeForRun(source);
    const generationLimitCheck = await checkGenerationUsageLimit({
        generationUsage,
        runAccessGuard,
        request,
        reply,
    });
    if (generationLimitCheck !== true)
        return generationLimitCheck;
    const limitCheck = await checkProviderUsageLimit({
        usageTracker: providerUsageTracker,
        providerConfigId,
        metadata,
        request,
        taskType,
        policy: providerRateLimitPolicy,
        reply,
    });
    if (limitCheck !== true)
        return limitCheck;
    const newRunId = randomUUID();
    const providerConfig = providerConfigId && providerConfigs
        ? await providerConfigs.get(providerConfigId)
        : null;
    await recordProviderUsage({
        usageTracker: providerUsageTracker,
        providerConfigId,
        metadata,
        request,
        taskType,
    });
    await recordGenerationUsage({
        generationUsage,
        runAccessGuard,
        request,
        taskType,
        providerConfigId,
    });
    // Retry/rerun reuse the source snapshot, then start a fresh pipeline for the queued copy.
    const result = createQueuedRunFromSource({
        runs,
        source,
        metadata,
        action,
        sourceRunId: runId,
        actorUserId,
        runId: newRunId,
    });
    const newRecord = runs.get(result.runId);
  if (newRecord) {
    rememberProviderSettings(newRecord, providerSettingsInput, {
      providerConfigId,
      model: providerSettings.model,
    });
    await startRecordPipeline({
      record: newRecord,
      providerSettings,
      providerConfigId,    });
  }



    reply.code(202);
    return result;
}
