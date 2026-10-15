// Registers health/version endpoints without owning server startup.
import type { FastifyInstance } from "fastify";

export function registerHealthRoutes({
  app,
  healthPayload,
  versionPayload,
}: {
  app: FastifyInstance;
  healthPayload: () => unknown;
  versionPayload: () => unknown;
}) {
  app.get("/health", async () => healthPayload());
  app.get("/api/health", async () => healthPayload());
  app.get("/version", async () => versionPayload());
  app.get("/api/version", async () => versionPayload());
}
