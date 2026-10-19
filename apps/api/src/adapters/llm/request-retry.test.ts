// Verifies bounded transient retries, provider cooldowns, jitter and cancellation with deterministic time.
import assert from "node:assert/strict";
import test from "node:test";
import { APIConnectionError, APIConnectionTimeoutError } from "openai";
import { createProviderRequestRetrier, type ProviderRequestRetryEvent } from "./request-retry.js";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("transient gateway failures back off exponentially and recover within three retries", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  t.mock.method(Math, "random", () => 0);
  const events: ProviderRequestRetryEvent[] = [];
  const request = createProviderRequestRetrier({ onRetry: (event) => events.push(event) });
  let calls = 0;
  const result = request(async () => {
    const status = [502, 503, 504][calls++];
    if (status) throw { status };
    return "recovered";
  });
  for (const delay of [1_000, 2_000, 4_000]) {
    await flush();
    const callsBeforeWait = calls;
    t.mock.timers.tick(delay - 1);
    await flush();
    assert.equal(calls, callsBeforeWait);
    t.mock.timers.tick(1);
  }
  assert.equal(await result, "recovered");
  assert.equal(calls, 4);
  assert.deepEqual(events.map(({ retry, delayMs, statusCode }) => ({ retry, delayMs, statusCode })), [
    { retry: 1, delayMs: 1_000, statusCode: 502 },
    { retry: 2, delayMs: 2_000, statusCode: 503 },
    { retry: 3, delayMs: 4_000, statusCode: 504 },
  ]);
});

test("a persistent 503 stops after four attempts and preserves the last provider error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 0);
  let calls = 0;
  const failure = Object.assign(new Error("nginx unavailable"), { status: 503 });
  const request = createProviderRequestRetrier();
  const rejected = assert.rejects(request(async () => { calls++; throw failure; }), (error) => error === failure);
  for (const delay of [1_000, 2_000, 4_000]) { await flush(); t.mock.timers.tick(delay); }
  await rejected;
  assert.equal(calls, 4);
});

test("connection failures retry with jitter while auth, quota, cancellation and timeouts fail immediately", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 0.8);
  let calls = 0;
  const events: ProviderRequestRetryEvent[] = [];
  const request = createProviderRequestRetrier({ onRetry: (event) => events.push(event) });
  const result = request(async () => {
    if (++calls === 1) throw new APIConnectionError({ message: "Connection reset" });
    return "ok";
  });
  await flush();
  t.mock.timers.tick(1_199);
  await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal(await result, "ok");
  assert.deepEqual(events, [{ retry: 1, delayMs: 1_200, statusCode: null, reason: "connection" }]);

  for (const error of [
    ...[400, 401, 402, 403, 404, 422, 429].map((status) => ({ status })),
    new APIConnectionTimeoutError(), new DOMException("cancelled", "AbortError"), new Error("invalid model"),
  ]) {
    let attempts = 0;
    await assert.rejects(createProviderRequestRetrier()(async () => { attempts++; throw error; }), (actual) => actual === error);
    assert.equal(attempts, 1);
  }
});

test("Retry-After seconds and dates delay retries, while a cooldown over 30 seconds is surfaced", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-10-18T00:00:00Z") });
  t.mock.method(Math, "random", () => 0);
  for (const kind of ["seconds", "date"]) {
    const header = kind === "seconds" ? "5" : new Date(Date.now() + 5_000).toUTCString();
    let calls = 0;
    const result = createProviderRequestRetrier()(async () => {
      if (++calls === 1) throw { status: 503, headers: new Headers({ "retry-after": header }) };
      return "ok";
    });
    await flush();
    t.mock.timers.tick(4_999);
    await flush();
    assert.equal(calls, 1);
    t.mock.timers.tick(1);
    assert.equal(await result, "ok");
  }
  let calls = 0;
  const error = { status: 503, headers: new Headers({ "retry-after": "120" }) };
  await assert.rejects(createProviderRequestRetrier()(async () => { calls++; throw error; }), (actual) => actual === error);
  assert.equal(calls, 1);
});

test("cancelling a backoff interrupts the wait and never starts another attempt", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  let calls = 0;
  const events: ProviderRequestRetryEvent[] = [];
  const request = createProviderRequestRetrier({ signal: controller.signal, onRetry: (event) => events.push(event) });
  const rejected = assert.rejects(request(async () => { calls++; throw { status: 503 }; }), /cancelled/);
  await flush();
  controller.abort(new Error("cancelled"));
  await rejected;
  t.mock.timers.tick(60_000);
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(events, []);
  await assert.rejects(request(async () => { calls++; }), /cancelled/);
  assert.equal(calls, 1);
});
