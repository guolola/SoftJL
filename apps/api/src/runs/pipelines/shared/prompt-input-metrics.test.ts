// Verifies durable prompt diagnostics are complete counts, never source text or image bytes.
import assert from "node:assert/strict";
import test from "node:test";
import { promptInputMetrics } from "./prompt-input-metrics.js";

test("section counts partition text inputs and exclude image data", () => {
  const text = '核对模型\n依据：' + JSON.stringify({ rules: [{ text: "SOURCE_PRIVATE_TEXT" }], upstreamModels: [{ id: "upstream" }], traceability: [{ ruleId: "R1" }] }) + '\n本轮完整模型：{"id":"model"}';
  const metrics = promptInputMetrics([{ role: "user", content: [{ type: "text", text }, { type: "image_url", image_url: { url: "data:image/png;base64,PRIVATE_IMAGE" } }] }], { type: "json_object" });
  assert.equal(metrics.messages, text.length);
  assert.equal(Object.values(metrics.sections).reduce((a, b) => a + b, 0), text.length);
  assert.ok(metrics.sections.rules > 0 && metrics.sections.upstreamModels > 0 && metrics.sections.traceability > 0);
  assert.ok(!JSON.stringify(metrics).includes("PRIVATE"));
  assert.equal(metrics.responseFormat, JSON.stringify({ type: "json_object" }).length);
});

test("repair metrics expose bounded repair scope without retaining source facts", () => {
  const repair = { targetId: "class", mode: "field-patch", baseFingerprint: "fp:v3:abc", paths: ["models.0.relationships.1"], round: 2 };
  const metrics = promptInputMetrics([{ role: "user", content: `修复上下文：${JSON.stringify(repair)}\n必要来源事实：PRIVATE_BUSINESS_VALUE` }]);
  assert.deepEqual(metrics.repair, repair);
  assert.ok(!JSON.stringify(metrics).includes("PRIVATE_BUSINESS_VALUE"));
});
