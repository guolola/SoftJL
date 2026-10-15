// Exercises real Chinese diagram exports, vector content, page sizing, and failure boundaries.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderPdfWithPlantUml, renderPngWithPlantUml, createRenderServiceServer } from "../index.js";
import { svgToVectorPdf, pdfFontsReady } from "./vector-pdf.js";

const cases = [
  { diagramKind: "class", source: 'class "用户" as User {\n+姓名: String\n}\nclass "订单" as Order\nUser --> Order : 提交订单', text: "用户" },
  { diagramKind: "activity", source: 'start\n:输入账号;\nif (校验成功?) then (是)\n:登录成功;\nelse (否)\n:显示错误;\nendif\nstop', text: "输入账号" },
  { diagramKind: "sequence", source: 'actor "用户" as User\nparticipant "系统" as System\nUser -> System : 提交账号\nSystem --> User : 登录成功', text: "提交账号" },
  { diagramKind: "context", source: 'actor "客户" as Customer\nrectangle "订单系统" as System\ncloud "支付平台" as Payment\nCustomer --> System : 提交订单\nSystem --> Payment : 发起支付', text: "订单系统" },
] as const;
for (const entry of cases) {
  test(`exports Chinese ${entry.diagramKind} as PNG and vector PDF`, async () => {
    const input = { diagramKind: entry.diagramKind, plantUmlSource: `@startuml\n${entry.source}\n@enduml` };
    const png = Buffer.from((await renderPngWithPlantUml(input)).pngBase64, "base64");
    const response = await renderPdfWithPlantUml(input);
    const pdf = Buffer.from(response.pdfBase64, "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const syntax = pdf.toString("latin1");
    assert.match(syntax, /\/FontFile3/);
    assert.match(syntax, /\/ToUnicode/);
    assert.doesNotMatch(syntax, /\/Subtype\s*\/Image/);
    assert.match(syntax, /\/Count 1\b/);
    const page = syntax.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(page && Number(page[1]) > 48 && Number(page[2]) > 48);
    if (process.env.UML_EXPORT_QA_DIR) {
      await mkdir(process.env.UML_EXPORT_QA_DIR, { recursive: true });
      await writeFile(join(process.env.UML_EXPORT_QA_DIR, `${entry.diagramKind}.pdf`), pdf);
      await writeFile(join(process.env.UML_EXPORT_QA_DIR, `${entry.diagramKind}.png`), png);
    }
  });
}
test("rejects invalid SVG dimensions and reports unavailable fonts", async () => {
  await assert.rejects(svgToVectorPdf("<svg></svg>"), /dimensions/);
  const previous = process.env.UML_PDF_FONT_REGULAR;
  process.env.UML_PDF_FONT_REGULAR = "missing-font.otf";
  try {
    assert.equal(await pdfFontsReady(), false);
    await assert.rejects(svgToVectorPdf('<svg viewBox="0 0 10 10"/>'), /PDF fonts are unavailable/);
    const app = await createRenderServiceServer();
    try { assert.equal((await app.inject({ method: "GET", url: "/health" })).json().pdfFontsReady, false); }
    finally { await app.close(); }
  } finally {
    if (previous === undefined) delete process.env.UML_PDF_FONT_REGULAR;
    else process.env.UML_PDF_FONT_REGULAR = previous;
  }
});
test("PDF endpoint validates input and reports conversion failure", async () => {
  let calls = 0;
  const app = await createRenderServiceServer({ renderPdf: async () => { calls++; throw new Error("PDF fonts unavailable"); } });
  try {
    const invalid = await app.inject({ method: "POST", url: "/render/pdf", payload: { diagramKind: "class", plantUmlSource: "" } });
    assert.equal(invalid.statusCode, 400);
    assert.equal(calls, 0);
    const failed = await app.inject({ method: "POST", url: "/render/pdf", payload: { diagramKind: "sequence", plantUmlSource: "source" } });
    assert.equal(failed.statusCode, 400);
    assert.match(failed.json().message, /PDF fonts unavailable/);
  } finally { await app.close(); }
});

test("PDF responses share the rendering queue with SVG and PNG", async () => {
  const previous = process.env.UML_RENDER_CONCURRENCY;
  process.env.UML_RENDER_CONCURRENCY = "1";
  let running = 0;
  let maximum = 0;
  const convert = async () => {
    running++;
    maximum = Math.max(maximum, running);
    await new Promise((resolve) => setTimeout(resolve, 10));
    running--;
    return { engine: "test", generatedAt: "now", sourceLength: 6, durationMs: 10 };
  };
  const app = await createRenderServiceServer({
    renderSvg: async () => ({ svg: "<svg/>", renderMeta: await convert() }),
    renderPng: async () => ({ pngBase64: Buffer.from("PNG").toString("base64"), renderMeta: await convert() }),
    renderPdf: async () => ({ pdfBase64: Buffer.from("%PDF-1.7").toString("base64"), renderMeta: await convert() }),
  });
  try {
    const results = await Promise.all(["pdf", "svg", "png", "pdf"].map((format) => app.inject({ method: "POST", url: `/render/${format}`, payload: { diagramKind: "class", plantUmlSource: "source" } })));
    assert.equal(maximum, 1);
    assert.ok(results.every((response) => response.statusCode === 200));
    assert.equal(Buffer.from(results[0].json().pdfBase64, "base64").toString(), "%PDF-1.7");
    assert.equal(results[0].json().renderMeta.engine, "test");
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.UML_RENDER_CONCURRENCY;
    else process.env.UML_RENDER_CONCURRENCY = previous;
  }
});
