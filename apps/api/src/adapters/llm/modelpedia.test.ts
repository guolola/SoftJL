// Checks complete paginated downloads and rejects partial or malformed catalogs before publication.
import test from "node:test";
import assert from "node:assert/strict";
import { fetchModelpedia } from "./modelpedia.js";

test("downloads providers and every model page from Modelpedia only", async () => {
  const original = globalThis.fetch; const urls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); urls.push(url);
    return Response.json(url.endsWith("providers") ? { data: [{ id: "origin" }] } : url.includes("offset=0")
      ? { data: Array.from({ length: 500 }, (_, index) => ({ id: `m${index}` })), meta: { total: 501, offset: 0 } }
      : { data: [{ id: "last" }], meta: { total: 501, offset: 500 } });
  };
  try {
    const result = await fetchModelpedia() as { models: unknown[] };
    assert.equal(result.models.length, 501);
    assert.ok(urls.every(url => url.startsWith("https://api.modelpedia.dev/v1/")));
    assert.match(urls.at(-1)!, /offset=500$/);
  } finally { globalThis.fetch = original; }
});
test("rejects an empty subsequent page rather than accepting truncated data", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => Response.json(String(input).endsWith("providers") ? { data: [{ id: "origin" }] }
    : String(input).includes("offset=0") ? { data: [{ id: "one" }], meta: { total: 2, offset: 0 } } : { data: [], meta: { total: 2, offset: 1 } });
  try { await assert.rejects(fetchModelpedia(), /分页/); } finally { globalThis.fetch = original; }
});
