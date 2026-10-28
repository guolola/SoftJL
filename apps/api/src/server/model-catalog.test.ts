// Verifies external catalog synchronization cannot block API startup or discard cached capacities.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { createModelCatalog } from "./model-catalog.js";

for (const cached of [false, true]) {
  test(`API becomes ready while catalog download is pending, cached=${cached}`, async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "uml-startup-catalog-"));
    const previousDirectory = process.env.UML_MODEL_CATALOG_DIR;
    process.env.UML_MODEL_CATALOG_DIR = directory;
    if (cached) await writeFile(join(directory, "capacities.json"), JSON.stringify({
      version: 4, source: "models.dev", syncedAt: "2020-01-01T00:00:00.000Z",
      rows: [{ provider: "provider", api: "https://provider.test/v1", id: "catalog-model", context: 64000, output: 8000 }],
    }));
    let completeDownload: ((response: Response) => void) | undefined;
    const download = context.mock.method(globalThis, "fetch", () => new Promise<Response>((resolve) => { completeDownload = resolve; }));
    const app = Fastify({ pluginTimeout: 500 });
    const catalog = createModelCatalog(app, "development");
    try {
      await app.ready();
      assert.equal(download.mock.callCount(), 1);
      assert.equal(catalog.status().stale, true);
      assert.equal(catalog.resolve("provider", "catalog-model", "https://provider.test/v1").context, cached ? 64000 : null);
      completeDownload!(new Response("unavailable", { status: 503 }));
      await catalog.refresh();
      assert.equal(catalog.status().error, "同步失败，继续使用上次成功缓存");
      assert.equal(catalog.resolve("provider", "catalog-model", "https://provider.test/v1").context, cached ? 64000 : null);
    } finally {
      completeDownload?.(new Response("unavailable", { status: 503 }));
      await app.close();
      if (previousDirectory === undefined) delete process.env.UML_MODEL_CATALOG_DIR;
      else process.env.UML_MODEL_CATALOG_DIR = previousDirectory;
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("refreshes every six hours, recovers from failure, and stops scheduling on close", async context => {
  const directory = await mkdtemp(join(tmpdir(), "uml-scheduled-catalog-"));
  const previousDirectory = process.env.UML_MODEL_CATALOG_DIR;
  process.env.UML_MODEL_CATALOG_DIR = directory;
  context.mock.timers.enable({ apis: ["setInterval"] });
  let offline = false;
  const download = context.mock.method(globalThis, "fetch", async () => offline
    ? new Response("unavailable", { status: 503 })
    : Response.json({ origin: { id: "origin", models: { flash: { id: "flash", limit: { context: 64000, output: 8000 } } } } }));
  const app = Fastify();
  const catalog = createModelCatalog(app, "development");
  const interval = 6 * 60 * 60 * 1000;
  try {
    await app.ready(); await catalog.refresh();
    const initialCalls = download.mock.callCount();
    context.mock.timers.tick(interval - 1);
    assert.equal(download.mock.callCount(), initialCalls);
    offline = true;
    context.mock.timers.tick(1); await catalog.refresh();
    assert.equal(download.mock.callCount(), initialCalls + 1);
    assert.ok(catalog.status().error);
    assert.equal(catalog.resolve("p", "flash", "https://unlisted.example").context, 64000);
    offline = false;
    context.mock.timers.tick(interval); await catalog.refresh();
    assert.equal(download.mock.callCount(), initialCalls + 2);
    assert.equal(catalog.status().error, null);
    await app.close();
    context.mock.timers.tick(interval);
    assert.equal(download.mock.callCount(), initialCalls + 2);
  } finally {
    await app.close();
    if (previousDirectory === undefined) delete process.env.UML_MODEL_CATALOG_DIR;
    else process.env.UML_MODEL_CATALOG_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
