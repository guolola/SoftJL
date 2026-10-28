// Verifies public-only catalog downloads and bounded, complete response handling.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchModelsDev } from "./models-dev.js";

test("downloads the full Models.dev catalog once without credentials", async context => {
  const catalog = { origin: { id: "origin", models: { flash: { id: "flash", limit: { context: 64000 } } } } };
  const download = context.mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(input, "https://models.dev/api.json?type=all");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.headers, undefined);
    assert.equal(init?.body, undefined);
    return Response.json(catalog);
  });
  assert.deepEqual(await fetchModelsDev(), catalog);
  assert.equal(download.mock.callCount(), 1);
});

test("rejects HTTP failures, missing bodies and malformed JSON", async context => {
  const download = context.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 503 }));
  await assert.rejects(fetchModelsDev(), /同步失败/);
  download.mock.mockImplementation(async () => new Response(null));
  await assert.rejects(fetchModelsDev(), /同步失败/);
  download.mock.mockImplementation(async () => new Response('{"origin":'));
  await assert.rejects(fetchModelsDev(), SyntaxError);
});

test("rejects an interrupted stream instead of publishing partial JSON", async context => {
  let reads = 0;
  context.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    pull(controller) {
      if (++reads === 1) controller.enqueue(new TextEncoder().encode('{"origin":'));
      else controller.error(new Error("download interrupted"));
    },
  })));
  await assert.rejects(fetchModelsDev(), /download interrupted/);
});

test("limits bytes while streaming and cancels oversized downloads", async context => {
  let cancelled = false;
  context.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1_000_001)); },
    cancel() { cancelled = true; },
  })));
  await assert.rejects(fetchModelsDev(), /大小限制/);
  assert.equal(cancelled, true);
});
