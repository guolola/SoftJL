// Creates API persistence stores from injected test doubles, PostgreSQL, or in-memory fallbacks.
import type { Pool } from "pg";
import { createInMemoryAuthStore, type AuthStore, } from "../auth/in-memory-auth-store.js";
import { createPostgresAuthRepository } from "../auth/postgres-auth-repository.js";
import { createPostgresPoolFromEnv, getDatabaseUrl } from "../db/postgres.js";
import { runMigrations } from "../db/migrations.js";
import { createInMemoryAcademicAdminRepository, type AcademicAdminRepository, } from "../db/academic-admin-repository.js";
import { createPostgresAcademicAdminRepository } from "../db/postgres-academic-admin-repository.js";
import { createFileDocumentLibrary } from "../documents/library/document-library.js";
import type { DocumentLibrary } from "../documents/library/document-library.js";
import { createPostgresDocumentLibrary } from "../documents/library/postgres-document-library.js";
import { createProviderConfigStore, type ProviderConfigStore, } from "../provider-configs/provider-config-store.js";
import { createPostgresProviderConfigRepository } from "../provider-configs/postgres-provider-config-repository.js";
import { createProviderUsageTracker, type ProviderUsageTracker, } from "../provider-configs/provider-usage-tracker.js";
import { createPostgresRunRecordStore } from "../runs/records/postgres-run-record-store.js";
import { createRunRecordStore, type RunRecordStore, } from "../runs/records/run-record-store.js";
import { createInMemorySystemNoticeStore, type SystemNoticeStore, } from "../system-notices/records/system-notice-store.js";
import { createPostgresSystemNoticeStore } from "../system-notices/records/postgres-system-notice-store.js";
import { DEFAULT_DOCUMENT_STORAGE_DIR } from "./defaults.js";
import { createInMemoryRunTelemetryStore, createPostgresRunTelemetryStore, type RunTelemetryStore, } from "../runs/records/run-telemetry-store.js";
export type ApiPersistenceOverrides = {
    authStore?: AuthStore;
    providerConfigStore?: ProviderConfigStore;
    runRecordStore?: RunRecordStore;
    documentLibrary?: DocumentLibrary;
    systemNoticeStore?: SystemNoticeStore;
    analyticsStore?: RunTelemetryStore;
};
export type ApiPersistence = {
    pool: Pool | null;
    authStore: AuthStore;
    providerConfigs: ProviderConfigStore;
    runs: RunRecordStore;
    documentLibrary: DocumentLibrary;
    providerUsageTracker?: ProviderUsageTracker;
    systemNoticeStore: SystemNoticeStore;
    academicStore: AcademicAdminRepository;
    analyticsStore: RunTelemetryStore;
};
function hasInjectedPersistence(overrides: ApiPersistenceOverrides) {
    return (Boolean(overrides.authStore) &&
        Boolean(overrides.providerConfigStore) &&
        Boolean(overrides.runRecordStore) &&
        Boolean(overrides.documentLibrary));
}
export async function createApiPersistence({ nodeEnv, overrides = {}, }: {
    nodeEnv: string | null;
    overrides?: ApiPersistenceOverrides;
}): Promise<ApiPersistence> {
    const databaseUrl = getDatabaseUrl();
    if (nodeEnv === "production" && !databaseUrl && !hasInjectedPersistence(overrides)) {
        throw new Error("DATABASE_URL is required in production unless all persistence stores are explicitly injected");
    }
    const pool = (!overrides.authStore ||
        !overrides.providerConfigStore ||
        !overrides.runRecordStore ||
        !overrides.documentLibrary) &&
        databaseUrl
        ? createPostgresPoolFromEnv()
        : null;
    if (pool) {
        await runMigrations(pool);
    }
    const authStore = overrides.authStore ??
        (pool
            ? (createPostgresAuthRepository(pool) as unknown as AuthStore)
            : createInMemoryAuthStore());
    const providerConfigs = overrides.providerConfigStore ??
        (pool
            ? (createPostgresProviderConfigRepository({
                db: pool,
            }) as unknown as ProviderConfigStore)
            : createProviderConfigStore());
    const runs = overrides.runRecordStore ??
        (pool ? await createPostgresRunRecordStore(pool) : createRunRecordStore());
    const fileDocumentLibrary = createFileDocumentLibrary(DEFAULT_DOCUMENT_STORAGE_DIR);
    const documentLibrary = overrides.documentLibrary ??
        (pool
            ? createPostgresDocumentLibrary({
                db: pool,
                blobStorage: fileDocumentLibrary,
            })
            : fileDocumentLibrary);
    const providerUsageTracker = pool ? createProviderUsageTracker(pool) : undefined;
    const systemNoticeStore = overrides.systemNoticeStore ??
        (pool
            ? createPostgresSystemNoticeStore(pool)
            : createInMemorySystemNoticeStore());
    const academicStore = pool
        ? createPostgresAcademicAdminRepository(pool)
        : createInMemoryAcademicAdminRepository();
    const analyticsStore = overrides.analyticsStore ?? (pool
        ? createPostgresRunTelemetryStore(pool)
        : createInMemoryRunTelemetryStore());
    return {
        pool,
        authStore,
        providerConfigs,
        runs,
        documentLibrary,
        providerUsageTracker,
        systemNoticeStore,
        academicStore,
        analyticsStore,
    };
}
