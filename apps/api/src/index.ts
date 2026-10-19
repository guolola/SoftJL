// Assembles the Fastify API server, infrastructure adapters, and local startup compatibility.
import { designDiagramKindSchema } from "@uml-platform/contracts";
import { registerMcpModule } from "./mcp/server/register-mcp-module.js";
import type { LlmTransport } from "./llm.js";
import type { LlmScheduler } from "./adapters/llm/llm-scheduler.js";
import { DEFAULT_HOST, DEFAULT_PORT, RELEASE_STARTED_AT, } from "./server/defaults.js";
import { createConfiguredFastifyApp } from "./server/fastify-app.js";
import { isMainModule, resolveRuntimeCwd } from "./server/runtime.js";
import { seedGuestUser } from "./server/bootstrap-users.js";
import { registerApiRoutes, type RunAccessContext, } from "./server/register-routes.js";
import { createApiPersistence } from "./server/persistence.js";
import { createApiExternalAdapters } from "./server/external-adapters.js";
import type { AuthStore } from "./auth/in-memory-auth-store.js";
import type { DocumentLibrary } from "./documents/library/document-library.js";
import type { MailAdapter } from "./mail/mail-adapter.js";
import type { ProviderConfigStore } from "./provider-configs/provider-config-store.js";
import { createGenerationUsageService } from "./generation/generation-usage.js";
import type { SystemNoticeStore } from "./system-notices/records/system-notice-store.js";
import type { RunRecordStore } from "./runs/records/run-record-store.js";
import type { RenderClient } from "./adapters/render/render-client.js";
import type { PngRenderClient } from "./adapters/render/png-render-client.js";
import type { PdfRenderClient } from "./adapters/render/pdf-render-client.js";
import { createBullMqRunQueue, createRunQueueConfigFromEnv, type RunQueue, } from "./runs/queue/run-queue.js";
export async function createApiServer(options?: {
    llmTransport?: LlmTransport;
    renderClient?: RenderClient;
    pngRenderClient?: PngRenderClient;
    pdfRenderClient?: PdfRenderClient;
    renderServiceBaseUrl?: string;
    providerConfigStore?: ProviderConfigStore;
    authStore?: AuthStore;
    runRecordStore?: RunRecordStore;
    documentLibrary?: DocumentLibrary;
    mailAdapter?: MailAdapter;
    llmScheduler?: LlmScheduler;
    testRunAccessContext?: RunAccessContext;
    nodeEnv?: string | null;
    systemNoticeStore?: SystemNoticeStore;
    runQueue?: RunQueue;
}) {
    const runtimeNodeEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? null;
    // Test-only fallback used by API integration tests that construct run records
    // without a browser session. Production never accepts this synthetic context.
    const testRunAccessContext = runtimeNodeEnv === "production" ? undefined : options?.testRunAccessContext;
    const app = await createConfiguredFastifyApp();
    const { llmTransport, llmScheduler, renderServiceBaseUrl, renderClient, pngRenderClient, pdfRenderClient, mailAdapter, } = createApiExternalAdapters({
        llmTransport: options?.llmTransport,
        llmScheduler: options?.llmScheduler,
        renderServiceBaseUrl: options?.renderServiceBaseUrl,
        renderClient: options?.renderClient,
        pngRenderClient: options?.pngRenderClient,
        pdfRenderClient: options?.pdfRenderClient,
        mailAdapter: options?.mailAdapter,
    });
    const { pool, authStore, providerConfigs, runs, documentLibrary, providerUsageTracker, systemNoticeStore, analyticsStore, } = await createApiPersistence({
        nodeEnv: runtimeNodeEnv,
        overrides: {
            authStore: options?.authStore,
            providerConfigStore: options?.providerConfigStore,
            runRecordStore: options?.runRecordStore,
            documentLibrary: options?.documentLibrary,
            systemNoticeStore: options?.systemNoticeStore,
        },
    });
    if (pool) {
        app.addHook("onClose", async () => {
            await pool.end();
        });
    }
    const runQueue = options?.runQueue ??
        (() => {
            const config = createRunQueueConfigFromEnv();
            return config ? createBullMqRunQueue(config) : undefined;
        })();
    if (runQueue) {
        app.addHook("onClose", async () => {
            await runQueue.close();
        });
    }
    const generationUsage = createGenerationUsageService({ providerUsageTracker });
    const guestUserId = await seedGuestUser(authStore);
    const healthPayload = () => ({
        status: "ok",
        renderServiceBaseUrl,
    });
    const versionPayload = () => ({
        status: "ok",
        releaseSha: process.env.UML_RELEASE_SHA ?? null,
        releaseDir: process.env.UML_RELEASE_DIR ?? null,
        runtimeCwd: resolveRuntimeCwd(),
        startedAt: RELEASE_STARTED_AT,
        nodeEnv: process.env.NODE_ENV ?? null,
        renderServiceBaseUrl,
        features: {
            supportsDesignTableDiagram: designDiagramKindSchema.safeParse("table").success,
            supportsDocumentPreview: true,
        },
    });
    registerApiRoutes({
        app,
        healthPayload,
        versionPayload,
        authStore,
        mailAdapter,
        generationUsage,
        nodeEnv: runtimeNodeEnv,
        analyticsStore,
        databaseProbe: pool
            ? async () => {
                await pool.query("select 1 as ok");
            }
            : undefined,
        runs,
        documentLibrary,
        providerConfigs,
        providerUsageTracker,
        llmScheduler,
        runQueue,
        llmTransport,
        renderClient,
        pngRenderClient,
        pdfRenderClient,
        systemNoticeStore,
        testRunAccessContext,
    });
    await registerMcpModule({ app, authStore, pool, guestUserId, production: runtimeNodeEnv === "production" });
    return app;
}
async function start() {
    const app = await createApiServer();
    await app.listen({ host: DEFAULT_HOST, port: DEFAULT_PORT });
}
if (isMainModule(import.meta.url) || process.env.UML_API_AUTOSTART === "true") {
    start().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
