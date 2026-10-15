// Checks authenticated diagram conversion requests and binary download validation.
import { afterEach, expect, it, vi } from "vitest";
import { exportDiagramRequest } from "./run-actions-api";
afterEach(() => vi.unstubAllGlobals());
const metadata = { engine: "plantuml", generatedAt: "2026-01-01T00:00:00Z", durationMs: 1, sourceLength: 20 };
it.each(["png", "pdf"] as const)("exports %s using project scope, source and cancellation", async (format) => {
  const bytes = format === "png" ? [137, 80, 78, 71, 13, 10, 26, 10] : Array.from("%PDF-1.7", (char) => char.charCodeAt(0));
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ [`${format}Base64`]: btoa(String.fromCharCode(...bytes)), renderMeta: metadata }), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const blob = await exportDiagramRequest({ diagramKind: "sequence", plantUmlSource: "saved source", format }, "project-1", controller.signal);
  expect(blob.type).toBe(format === "png" ? "image/png" : "application/pdf");
  expect(blob.size).toBe(bytes.length);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/render/${format}`), expect.objectContaining({ credentials: "include", signal: controller.signal, headers: expect.objectContaining({ "X-UML-Project-Id": "project-1" }), body: JSON.stringify({ diagramKind: "sequence", plantUmlSource: "saved source" }) }));
});
it("rejects missing project scope and invalid binary content", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pdfBase64: btoa("not a PDF"), renderMeta: metadata })));
  vi.stubGlobal("fetch", fetchMock);
  const input = { diagramKind: "class" as const, plantUmlSource: "saved", format: "pdf" as const };
  await expect(exportDiagramRequest(input, null)).rejects.toThrow("请先登录并进入项目");
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(exportDiagramRequest(input, "project")).rejects.toThrow("Invalid diagram");
});
