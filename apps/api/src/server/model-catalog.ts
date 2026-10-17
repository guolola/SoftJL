// Starts the backend-only catalog cache lifecycle and stops scheduled work with the API server.
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { ModelCatalog, CATALOG_INTERVAL } from "../provider-configs/model-catalog.js";
import { resolveRuntimeCwd } from "./runtime.js";

export function createModelCatalog(app: FastifyInstance, nodeEnv: string | null | undefined) {
  const catalog = new ModelCatalog(join(process.env.UML_MODEL_CATALOG_DIR || join(resolveRuntimeCwd(), "data", "model-catalog"), "capacities.json"));
  let timer: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    // Node's integration tests also exercise production guards; never fetch public metadata in that runner.
    if (nodeEnv === "test" || process.env.NODE_TEST_CONTEXT) return;
    await catalog.load();
    // Startup refresh is bounded and uses a stale cache on failure; requests never download the catalog themselves.
    if (catalog.status().stale) await catalog.refresh();
    timer = setInterval(() => { void catalog.refresh(); }, CATALOG_INTERVAL); timer.unref();
  });
  app.addHook("onClose", async () => { if (timer) clearInterval(timer); });
  return catalog;
}
