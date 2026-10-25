// Ensures oversized collections fail before element validation can allocate unbounded issues.
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

test("collection upper bounds reject oversized input before parsing its entries", () => {
  let parsed = 0;
  const entry = z.string().refine(() => { parsed++; return false; });
  for (const [schema, value] of [
    [z.array(entry).max(2), Array(10000).fill("entry")],
    [z.set(entry).max(2), new Set(["one", "two", "three"])],
    [z.map(entry, entry).max(2), new Map([["one", "one"], ["two", "two"], ["three", "three"]])],
  ] as const) {
    const result = schema.safeParse(value);
    assert.equal(result.success, false);
    assert.equal(result.error!.issues.length, 1);
    assert.equal(result.error!.issues[0]!.code, "too_big");
  }
  assert.equal(parsed, 0);
});
