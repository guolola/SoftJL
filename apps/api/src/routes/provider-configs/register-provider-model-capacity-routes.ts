// Lets an authenticated owner inspect and edit saved personal model metadata without probing a provider.
import type { FastifyInstance } from "fastify";
import { providerCapacityResponseSchema, providerModelCapacityUpdateSchema } from "@uml-platform/contracts";
import { isAuthError, requireAuth } from "../../auth/guards.js";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { ModelCatalog } from "../../provider-configs/model-catalog.js";
import type { ProviderConfigStore } from "../../provider-configs/provider-config-store.js";
import { createHttpErrorResponse } from "../../server/http-error-response.js";

export function registerProviderModelCapacityRoutes({ app, authStore, providerConfigs, catalog }: {
  app: FastifyInstance; authStore: AuthStore; providerConfigs: ProviderConfigStore; catalog: ModelCatalog;
}) {
  app.get("/api/provider-configs/:id/capacities", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const provider = await providerConfigs.get((request.params as { id: string }).id);
    if (!provider || provider.scopeType !== "user" || provider.scopeId !== auth.user.id || provider.status !== "active") {
      return reply.code(404).send(createHttpErrorResponse(reply));
    }
    return providerCapacityResponseSchema.parse({ ...catalog.status(), models: [...new Set([provider.defaultModel, ...provider.allowedModels])]
      .map(model => catalog.describe(provider.id, model, provider.baseUrl, "user")) });
  });
  app.put("/api/provider-configs/:id/capacities", async (request, reply) => {
    const auth = await requireAuth(request, reply, authStore);
    if (isAuthError(auth)) return auth;
    const provider = await providerConfigs.get((request.params as { id: string }).id);
    // Ownership is checked before inspecting the model or writing any shared catalog state.
    if (!provider || provider.scopeType !== "user" || provider.scopeId !== auth.user.id || provider.status !== "active") {
      return reply.code(404).send(createHttpErrorResponse(reply));
    }
    const body = providerModelCapacityUpdateSchema.safeParse(request.body);
    if (!body.success || ![provider.defaultModel, ...provider.allowedModels].includes(body.data.modelId)) {
      return reply.code(400).send(createHttpErrorResponse(reply));
    }
    try {
      await catalog.supplement(provider.id, body.data.modelId, provider.baseUrl, body.data.capacity, "user");
    } catch {
      return reply.code(409).send(createHttpErrorResponse(reply));
    }
    await providerConfigs.recordAudit?.({ actor: auth.user.id, action: "user.provider_config.capacity_update",
      target: `${provider.name}:${body.data.modelId}`, result: "success" });
    return catalog.describe(provider.id, body.data.modelId, provider.baseUrl, "user");
  });
}
