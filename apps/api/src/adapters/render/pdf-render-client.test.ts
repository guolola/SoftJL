// Checks PDF adapter payloads, cancellation, binary validation, and service errors.
import assert from "node:assert/strict";
import test from "node:test";
import { createPdfRenderClient } from "./pdf-render-client.js";
test("PDF adapter preserves source and abort signal and validates the file", async () => {
  const previous = globalThis.fetch;
  const signal = new AbortController().signal;
  let payload: any;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "http://render/render/pdf");
    assert.equal(init?.signal, signal);
    assert.deepEqual(JSON.parse(String(init?.body)), { diagramKind: "sequence", plantUmlSource: "source" });
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  try {
    payload = { pdfBase64: Buffer.from("%PDF-1.7").toString("base64"), renderMeta: { engine: "plantuml", generatedAt: "now", sourceLength: 6, durationMs: 1 } };
    assert.equal((await createPdfRenderClient("http://render", { diagramKind: "sequence", source: "source" }, signal)).pdf.toString(), "%PDF-1.7");
    payload.pdfBase64 = Buffer.from("invalid").toString("base64");
    await assert.rejects(createPdfRenderClient("http://render", { diagramKind: "sequence", source: "source" }, signal), /invalid PDF/);
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "fonts missing" }), { status: 400 });
    await assert.rejects(createPdfRenderClient("http://render", { diagramKind: "sequence", source: "source" }), /fonts missing/);
  } finally { globalThis.fetch = previous; }
});
