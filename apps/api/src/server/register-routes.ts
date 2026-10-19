// Wires assembled server dependencies into HTTP route modules without owning route behavior.
import { join } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { readSessionCookie } from "../auth/session-cookie.js";
import { hasProjectPermission, type AuthStore } from "../auth/in-memory-auth-store.js";
import { registerAccountRoutes } from "../routes/account/register-account-routes.js";
import { registerHealthRoutes } from "../routes/health/register-health-routes.js";
import { registerAuthRoutes } from "../routes/auth/register-auth-routes.js";
import { registerCaseRoutes } from "../routes/cases/register-case-routes.js";
import { registerDocumentRoutes } from "../routes/documents/register-document-routes.js";
import { registerStandardProjectRoutes } from "../routes/standard/register-standard-project-routes.js";
import { createModelCatalog } from "./model-catalog.js";
import { registerProjectRoutes } from "../routes/projects/register-project-routes.js";
import { registerDashboardRoutes } from "../routes/dashboard/register-dashboard-routes.js";
import { registerProviderConfigRoutes } from "../routes/provider-configs/register-provider-config-routes.js";
import { registerRenderRoutes } from "../routes/render/register-render-routes.js";
import { registerSystemNoticeRoutes } from "../routes/system-notices/register-system-notice-routes.js";
import { registerRunRoutes } from "../routes/runs/register-run-routes.js";
import { registerFeasibilityRoutes } from "../routes/feasibility/register-feasibility-routes.js";
import type { RunAccessContext } from "../routes/runs/run-access.js";
import type { DocumentLibrary } from "../documents/library/document-library.js";
import type { MailAdapter } from "../mail/mail-adapter.js";
import type { ProviderConfigStore } from "../provider-configs/provider-config-store.js";
import type { ProviderUsageTracker } from "../provider-configs/provider-usage-tracker.js";
import type { RunRecordStore } from "../runs/records/run-record-store.js";
import type { RenderClient } from "../adapters/render/render-client.js";
import type { PngRenderClient } from "../adapters/render/png-render-client.js";
import type { PdfRenderClient } from "../adapters/render/pdf-render-client.js";
import type { LlmTransport } from "../llm.js";
import type { LlmScheduler } from "../adapters/llm/llm-scheduler.js";
import type { RunQueue } from "../runs/queue/run-queue.js";
import { runDesignStagePipeline } from "../runs/pipelines/design-pipeline.js";
import { runDocumentStagePipeline } from "../runs/pipelines/document-pipeline.js";
import { runStagePipeline } from "../runs/pipelines/requirements-pipeline.js";
import { createProjectWorkspaceSync } from "../routes/runs/project-workspace-sync.js";
import type { GenerationUsageService } from "../generation/generation-usage.js";
import type { SystemNoticeStore } from "../system-notices/records/system-notice-store.js";
import { DEFAULT_SSE_ALLOW_ORIGIN } from "./defaults.js";
import { resolveRuntimeCwd } from "./runtime.js";
import type { RunTelemetryStore } from "../runs/records/run-telemetry-store.js";
export type { RunAccessContext } from "../routes/runs/run-access.js";
type HealthPayload = Parameters<typeof registerHealthRoutes>[0]["healthPayload"];
type VersionPayload = Parameters<typeof registerHealthRoutes>[0]["versionPayload"];
export type RegisterApiRoutesOptions = {
    app: FastifyInstance;
    healthPayload: HealthPayload;
    versionPayload: VersionPayload;
    authStore: AuthStore;
    mailAdapter: MailAdapter;
    generationUsage: GenerationUsageService;
    nodeEnv: string | null;
    runs: RunRecordStore;
    documentLibrary: DocumentLibrary;
    providerConfigs: ProviderConfigStore;
    providerUsageTracker?: ProviderUsageTracker;
    llmScheduler: LlmScheduler;
    runQueue?: RunQueue;
    llmTransport: LlmTransport;
    renderClient: RenderClient;
    pngRenderClient: PngRenderClient;
    pdfRenderClient?: PdfRenderClient;
    systemNoticeStore: SystemNoticeStore;
    analyticsStore: RunTelemetryStore;
    databaseProbe?: () => Promise<void>;
    testRunAccessContext?: RunAccessContext;
};
export function registerApiRoutes({ app, healthPayload, versionPayload, authStore, mailAdapter, generationUsage, nodeEnv, runs, documentLibrary, providerConfigs, providerUsageTracker, llmScheduler, runQueue, llmTransport, renderClient, pngRenderClient, pdfRenderClient, systemNoticeStore, analyticsStore, databaseProbe, testRunAccessContext, }: RegisterApiRoutesOptions) {
    const activeUserIdFromRequest = async (request: FastifyRequest) => {
        const sessionId = readSessionCookie(request);
        const session = sessionId ? await authStore.getActiveSession(sessionId) : null;
        const user = session ? await authStore.getUser(session.userId) : null;
        return user?.status === "active" ? user.id : null;
    };
    const projectMembershipGuard = async ({ projectId, userId, permission, }: {
        projectId: string;
        userId: string;
        permission: Parameters<typeof hasProjectPermission>[1];
    }) => {
        const member = await authStore.findProjectMember(projectId, userId);
        return Boolean(member && hasProjectPermission(member.role, permission));
    };
    const modelCatalog = createModelCatalog(app, nodeEnv);
    registerStandardProjectRoutes({ app, authStore, llmTransport, llmScheduler, renderClient, pngRenderClient, modelCatalog, providerConfigs, providerUsageTracker, generationUsage, analyticsStore, documentLibrary });
    registerHealthRoutes({ app, healthPayload, versionPayload });
    registerAuthRoutes({
        app,
        authStore,
        mailAdapter,
    });
    registerAccountRoutes({
        app,
        authStore,
        generationUsage,
        avatarStorageDir: process.env.UML_AVATAR_STORAGE_DIR ??
            join(resolveRuntimeCwd(), "data", "avatars"),
    });
    registerProjectRoutes({
        app,
        authStore,
        mailAdapter,
        nodeEnv,
    });
    registerDashboardRoutes({ app, authStore, runs, documentLibrary });
    registerCaseRoutes({ app, authStore, renderClient });
    registerProviderConfigRoutes({
        app,
        authStore,
        providerConfigs,
    });
    registerSystemNoticeRoutes({
        app,
        authStore,
        systemNotices: systemNoticeStore,
    });
    registerDocumentRoutes({
        app,
        documentLibrary,
        resolveUserId: activeUserIdFromRequest,
        projectMembershipGuard,
        recordAuditLog: (event) => authStore.recordAuditLog({
            actorUserId: event.actorUserId,
            action: event.action,
            targetType: event.targetType,
            targetId: event.targetId,
            outcome: event.outcome,
            message: event.message,
        }),
    });
    registerRunRoutes({
        app,
        modelCatalog,
        runs,
        documentLibrary,
        llmTransport,
        llmScheduler,
        runQueue,
        analyticsStore,
        renderClient,
        pngRenderClient,
        defaultSseAllowOrigin: DEFAULT_SSE_ALLOW_ORIGIN,
        runStagePipeline,
        runDesignStagePipeline,
        runDocumentStagePipeline,
        providerConfigs,
        resolveProjectName: async (projectId: string) => {
            const project = await authStore.getProject(projectId);
            return project?.name ?? null;
        },
        providerUsageTracker,
        generationUsage,
        loadProjectWorkspace: async (projectId) => authStore.getProjectWorkspace(projectId),
        syncProjectWorkspace: createProjectWorkspaceSync(authStore, { runs }),
        runAccessGuard: {
            async resolveRunAccess(request) {
                const projectIdHeader = request.headers["x-uml-project-id"];
                const sessionId = readSessionCookie(request);
                const session = sessionId ? await authStore.getActiveSession(sessionId) : null;
                const user = session ? await authStore.getUser(session.userId) : null;
                const userId = user?.status === "active" ? user.id : null;
                return {
                    userId: userId ?? testRunAccessContext?.userId,
                    email: user?.status === "active" ? user.email : testRunAccessContext?.email,
                    projectId: typeof projectIdHeader === "string" && projectIdHeader.trim()
                        ? projectIdHeader.trim()
                        : testRunAccessContext?.projectId,
                };
            },
            async canAccessProject({ userId, projectId, permission }) {
                if (testRunAccessContext?.userId === userId &&
                    testRunAccessContext.projectId === projectId) {
                    return true;
                }
                return projectMembershipGuard({ userId, projectId, permission });
            },
        },
    });
    registerFeasibilityRoutes({
        app,
        modelCatalog,
        runs,
        renderClient,
        pngRenderClient,
        llmTransport,
        llmScheduler,
        runQueue,
        analyticsStore,
        providerConfigs,
        providerUsageTracker,
        generationUsage,
        defaultSseAllowOrigin: DEFAULT_SSE_ALLOW_ORIGIN,
        syncProjectWorkspace: createProjectWorkspaceSync(authStore, { runs }),
        resolveUserId: activeUserIdFromRequest,
        resolveProjectName: async (projectId) => (await authStore.getProject(projectId))?.name ?? null,
        canUpdateProject: (projectId, userId) => projectMembershipGuard({ projectId, userId, permission: "update_project" }),
        loadWorkspace: async (projectId) => {
            const workspace = await authStore.getProjectWorkspace(projectId);
            return {
                version: workspace.version,
                state: workspace.state,
            };
        },
    });
    registerRenderRoutes({
        app,
        renderClient,
        pngRenderClient,
        pdfRenderClient,
        resolveUserId: activeUserIdFromRequest,
        projectMembershipGuard,
    });
}
