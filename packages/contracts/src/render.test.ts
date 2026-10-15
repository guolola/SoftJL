// Checks the additive PDF contract and its shared diagram type boundary.
import assert from "node:assert/strict";
import test from "node:test";
import { renderPdfRequestSchema, renderPdfResponseSchema } from "./render.js";
test("PDF supports requirement and design kinds with validated render metadata", () => {
  for (const diagramKind of ["class", "activity", "sequence", "context", "table"]) {
    assert.equal(renderPdfRequestSchema.parse({ diagramKind, plantUmlSource: "saved" }).diagramKind, diagramKind);
  }
  assert.equal(renderPdfRequestSchema.safeParse({ diagramKind: "sequence", plantUmlSource: "" }).success, false);
  assert.equal(renderPdfResponseSchema.safeParse({ pdfBase64: "" }).success, false);
  const result = renderPdfResponseSchema.parse({ pdfBase64: "JVBERi0=", renderMeta: { engine: "plantuml", generatedAt: "now", sourceLength: 1, durationMs: 1 } });
  assert.equal(result.pdfBase64, "JVBERi0=");
});
