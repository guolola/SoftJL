// Exposes authorized model capabilities to both engineering and quick modeling composers.
import { createHttpErrorResponse } from "../../server/http-error-response.js";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import { requireProjectPermission, isProjectPermissionError } from "../../auth/guards.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import type { ModelCatalog } from "../../provider-configs/model-catalog.js";
import { standardContextBudget } from "../../adapters/llm/pi-provider.js";

export function registerProjectModelContextRoutes(deps: {
  app: FastifyInstance; authStore: AuthStore; providerConfigs: ProviderConfigStore; modelCatalog?: ModelCatalog;
}) {
  deps.app.get("/api/projects/:projectId/model-context", async (request, reply) => {
      const { projectId } = request.params as { projectId: string };
      const context = await requireProjectPermission(request, reply, deps.authStore, projectId, "view_project");
      if (isProjectPermissionError(context)) return context;
      const query = z.object({ providerConfigId: z.string().min(1), model: z.string().min(1).max(400) }).safeParse(request.query);
      if (!query.success) return reply.code(400).send(createHttpErrorResponse(reply));
      const provider = await deps.providerConfigs.get(query.data.providerConfigId);
      const visible = provider && (provider.scopeType === "system" || (provider.scopeType === "user" && provider.scopeId === context.user.id) || (provider.scopeType === "project" && provider.scopeId === projectId));
      if (!visible || provider.status !== "active") return reply.code(404).send(createHttpErrorResponse(reply));
      if (![provider.defaultModel, ...provider.allowedModels].includes(query.data.model)) return reply.code(400).send(createHttpErrorResponse(reply));
      const capacity = deps.modelCatalog?.resolve(provider.id, query.data.model, provider.baseUrl) ?? { context: null, output: null, source: "unknown" as const, matchedId: null, updatedAt: null };
      return { model: query.data.model, capacity, contextBudget: standardContextBudget(capacity) };
  });
}
