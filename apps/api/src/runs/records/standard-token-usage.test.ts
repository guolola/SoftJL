// Verifies context and cumulative usage have separate accounting and never fabricate absent provider usage.
import assert from "node:assert/strict";
import test from "node:test";
import { standardTokenUsage } from "./standard-token-usage.js";
const message = (usage: unknown) => ({ type: "message", message: { role: "assistant", usage } });
test("cached tokens are included once in input while total includes full history", () => {
  const entries = [message({ input: 100, output: 20, cacheRead: 80, cacheWrite: 10, totalTokens: 210 }), { type: "compaction", tokensBefore: 40000 }, message({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 })];
  const first = standardTokenUsage(entries.slice(0, 1), { tokens: 210, contextWindow: 48000 }, "model", 48000);
  assert.equal(first.lastCall?.input, 190); assert.equal(first.lastCall?.cacheRead, 80);
  const after = standardTokenUsage(entries, { tokens: 50, contextWindow: 48000 }, "model", 48000);
  assert.equal(after.cumulative.total, 225); assert.equal(after.contextTokens, 50); assert.equal(after.cumulative.calls, 2);
});
test("compaction and unreported calls remain unknown and are not replaced with stale context or zero", () => {
  const value = standardTokenUsage([message({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }), message({ input: NaN })], { tokens: null, contextWindow: 64000 }, "model", 48000);
  assert.equal(value.contextTokens, null); assert.equal(value.contextBudget, 64000); assert.equal(value.lastCall, null);
  assert.deepEqual(value.cumulative, { total: 0, calls: 0, unreportedCalls: 2 });
});
