// Registers the dashboard read boundary; aggregation stays in the dashboard summary module.
import type { FastifyInstance } from "fastify";
import { dashboardSummarySchema } from "@uml-platform/contracts";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import { loadDashboardSummary } from "../../dashboard/summary/dashboard-summary.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { RunRecordStore } from "../../runs/records/run-record-store.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";

export function registerDashboardRoutes(dependencies: { app: FastifyInstance; authStore: AuthStore; runs: RunRecordStore; documentLibrary: DocumentLibrary }) {
  dependencies.app.get("/api/dashboard/summary", async (request, reply) => {
    const auth = await requireAuth(request, reply, dependencies.authStore);
    if (isAuthError(auth)) return auth;
    reply.header("Cache-Control", "no-store");
    return dashboardSummarySchema.parse(await loadDashboardSummary({ ...dependencies, user: auth.user }));
  });
}
