// Verifies that excluded services are absent while core routes remain registered.
import assert from "node:assert/strict";
import test from "node:test";
import { createApiServer } from "../../index.js";

test("community exposes engineering routes and excludes billing and administration while MCP is gated", async () => {
  const app = await createApiServer();
  try {
    for (const url of ["/api/billing/summary", "/api/admin/system-notices", "/api/admin/auth/login", "/api/admin/model-catalog", "/api/mcp"]) {
      for (const method of ["GET", "POST"] as const) {
        const response = await app.inject({ method, url });
        assert.equal(response.statusCode, 404, `${method} ${url} must be absent`);
      }
    }
    assert.deepEqual((await app.inject({ url: "/api/mcp/connections" })).json(), { enabled: false });
    // Both workflows remain available, and their new entrypoints still require authentication.
    for (const url of ["/api/projects/community-project/standard", "/api/projects/community-project/model-context"]) {
      assert.equal((await app.inject({ url })).statusCode, 401, url);
    }
    const routes = app.printRoutes({ commonPrefix: false });
    for (const route of ["/api/auth/login", "/api/projects", "/api/feasibility-runs", "/api/runs", "/api/provider-configs"]) {
      assert.ok(routes.includes(route), `retained route ${route} must be registered`);
    }
  } finally { await app.close(); }
});
