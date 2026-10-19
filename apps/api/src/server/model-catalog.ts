// Starts the backend-only catalog cache lifecycle and stops scheduled work with the API server.
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { ModelCatalog, CATALOG_INTERVAL } from "../provider-configs/model-catalog.js";
import { resolveRuntimeCwd } from "./runtime.js";

export function createModelCatalog(app: FastifyInstance, nodeEnv: string | null | undefined) {
  const catalog = new ModelCatalog(join(process.env.UML_MODEL_CATALOG_DIR || join(resolveRuntimeCwd(), "data", "model-catalog"), "capacities.json"));
  let timer: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    if (nodeEnv === "test") return;
    await catalog.load();
    // Public catalog downloads may outlast Fastify's startup deadline. Serve the
    // loaded cache immediately and refresh in the background, retaining it on failure.
    if (catalog.status().stale) void catalog.refresh();
    timer = setInterval(() => { void catalog.refresh(); }, CATALOG_INTERVAL); timer.unref();
  });
  app.addHook("onClose", async () => { if (timer) clearInterval(timer); });
  return catalog;
}
