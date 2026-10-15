// Runs queued generation pipelines outside the API request process.
import type { ProviderSettingsInput } from "@uml-platform/contracts";
import { createApiExternalAdapters } from "../server/external-adapters.js";
import { createApiPersistence } from "../server/persistence.js";
import { createBullMqGenerationWorker, createBullMqRunQueue, createRunQueueConfigFromEnv, reviveQueuedRunRecord, } from "../runs/queue/run-queue.js";
import { runRunRecordPipeline, handleRunPipelineError, } from "../runs/pipelines/run-record-pipeline-starter.js";
import { runStagePipeline } from "../runs/pipelines/requirements-pipeline.js";
import { runDesignStagePipeline } from "../runs/pipelines/design-pipeline.js";
import { runDocumentStagePipeline } from "../runs/pipelines/document-pipeline.js";
import { snapshotProviderSettings } from "../runs/providers/run-provider-gates.js";
import { attachProjectWorkspaceSync, createProjectWorkspaceSync, } from "../routes/runs/project-workspace-sync.js";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import { resolveProviderCircuitAccess } from "../provider-configs/provider-circuit-recovery.js";
import type { RunRecord } from "../runs/records/run-record-store.js";
import { releaseRunRecordIfAvailable } from "../runs/records/run-record-store.js";
import { flushRunStoreIfAvailable } from "../runs/queue/run-queue.js";
import { createRunError, throwRunError } from "../runs/pipelines/shared/errors.js";
function positiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function isManagedProviderSettings(settings: ProviderSettingsInput | undefined): settings is Extract<ProviderSettingsInput, {
    providerConfigId: string;
}> {
    return Boolean(settings && "providerConfigId" in settings);
}
async function resolveWorkerProviderSettings({ record, providerConfigs, }: {
    record: RunRecord;
    providerConfigs: ProviderConfigStore;
}) {
    const input = snapshotProviderSettings(record);
    if (!isManagedProviderSettings(input)) {
        throw new Error("Queued run is missing managed provider settings");
    }
    const config = await providerConfigs.get(input.providerConfigId);
    if (!config) {
        throw new Error("Queued run provider config was not found");
    }
    if (!config.allowlisted) {
        throw new Error("Queued run provider config is not allowlisted");
    }
    if (config.status !== "active") {
        throw new Error("Queued run provider config is not active");
    }
    if (!config.allowedModels.includes(input.model)) {
        throw new Error("Queued run model is not allowed by provider config");
    }
    const circuit = await resolveProviderCircuitAccess({
        providerConfigs,
        providerConfig: config,
        model: input.model,
    });
    if (!circuit.ok) {
        throwRunError(createRunError(circuit.statusCode === 503
            ? "PLATFORM_PROVIDER_UNAVAILABLE"
            : "PLATFORM_PROVIDER_AUTH_FAILED", undefined, { details: { providerError: circuit.error } }));
    }
    return {
        providerConfigId: input.providerConfigId,
        providerSettings: circuit.providerSettings,
    };
}
async function start() {
    const config = createRunQueueConfigFromEnv();
    if (!config) {
        throw new Error("Generation worker requires UML_RUN_QUEUE_MODE=bullmq and REDIS_URL");
    }
    const nodeEnv = process.env.NODE_ENV ?? null;
    const persistence = await createApiPersistence({ nodeEnv });
    const { llmTransport, llmScheduler, renderClient, pngRenderClient, } = createApiExternalAdapters();
    const runQueue = createBullMqRunQueue(config);
    const syncProjectWorkspace = createProjectWorkspaceSync(persistence.authStore, {
        runs: persistence.runs,
    });
    const activeRecords = new Map<string, RunRecord>();
    const worker = createBullMqGenerationWorker({
        config,
        concurrency: positiveInteger(process.env.UML_GENERATION_WORKER_CONCURRENCY, 1),
        onCancelRun(runId) {
            const record = activeRecords.get(runId);
            if (record) {
                record.snapshot.status = "cancelled";
                record.terminal = true;
            }
            llmScheduler.cancelRun(runId);
        },
        async processRun(job) {
            const record = reviveQueuedRunRecord(job);
            persistence.runs.set(job.runId, record);
            runQueue.attachEventPublisher(record);
            attachProjectWorkspaceSync(record, syncProjectWorkspace);
            activeRecords.set(job.runId, record);
            try {
                const provider = await resolveWorkerProviderSettings({
                    record,
                    providerConfigs: persistence.providerConfigs,
                });
                await runRunRecordPipeline({
                    record,
                    providerSettings: provider.providerSettings,
                    providerConfigId: provider.providerConfigId,
                    llmTransport,
                    llmScheduler,
                    renderClient,
                    pngRenderClient,
                    documentLibrary: persistence.documentLibrary,
                    runStagePipeline,
                    runDesignStagePipeline,
                    runDocumentStagePipeline,
                    documentInput: job.documentInput,
                    analyticsStore: persistence.analyticsStore,
                });
            }
            catch (error) {
                handleRunPipelineError(record, error);
                throw error;
            }
            finally {
                activeRecords.delete(job.runId);
                // Completed jobs remain durable in PostgreSQL, without retaining their stream history in workers.
                try {
                    await flushRunStoreIfAvailable(persistence.runs);
                }
                finally {
                    releaseRunRecordIfAvailable(persistence.runs, job.runId);
                }
            }
        },
    });
    const shutdown = async () => {
        await Promise.allSettled([
            worker.close(),
            runQueue.close(),
            persistence.pool?.end(),
        ]);
    };
    process.once("SIGINT", () => {
        void shutdown().finally(() => process.exit(0));
    });
    process.once("SIGTERM", () => {
        void shutdown().finally(() => process.exit(0));
    });
    console.log(`[generation-worker] listening on ${config.queueName} with concurrency ${positiveInteger(process.env.UML_GENERATION_WORKER_CONCURRENCY, 1)}`);
}
start().catch((error) => {
    console.error(error);
    process.exit(1);
});
