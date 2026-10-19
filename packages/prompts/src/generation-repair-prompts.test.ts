// Protects missing-only mapping requests and the local context needed to bind relationships and columns.
import assert from "node:assert/strict";
import test from "node:test";
import { buildMissingMappingsPrompt } from "./generation-repair-prompts.js";

test("mapping requests contain the missing relationship, endpoint facts and no unrelated model content", () => {
  const models = [{ modelId: "domain", diagramKind: "class", notes: ["UNRELATED_MODEL_NOTES"], classes: [
    { id: "order", name: "订单", description: "保存订单" }, { id: "line", name: "订单明细", description: "记录商品数量" }, { id: "other", name: "UNRELATED_BUSINESS" }],
    relationships: [{ id: "owns", sourceId: "order", targetId: "line", type: "composition", label: "包含" }] }];
  const prompt = buildMissingMappingsPrompt("requirementModelTraceability", [{ modelId: "domain", diagramKind: "class", elementId: "owns" }], models, { rules: [{ id: "r1", text: "订单包含明细" }] }, "");
  assert.match(prompt, /只补齐缺失业务元素/);
  assert.match(prompt, /禁止返回 models/);
  assert.match(prompt, /保存订单/);
  assert.match(prompt, /记录商品数量/);
  assert.doesNotMatch(prompt, /UNRELATED_MODEL_NOTES|UNRELATED_BUSINESS/);
});

test("qualified table columns retain their owning table and full declaration", () => {
  const prompt = buildMissingMappingsPrompt("designModelTraceability", [{ modelId: "db", diagramKind: "table", elementId: "orders.id" }],
    [{ modelId: "db", diagramKind: "table", tables: [{ id: "orders", columns: [{ id: "id", name: "order_id", dataType: "bigint" }] }, { id: "other", columns: [{ id: "id", name: "OTHER_COLUMN" }] }] }], {}, "invalid source");
  assert.match(prompt, /order_id/);
  assert.doesNotMatch(prompt, /OTHER_COLUMN/);
  assert.match(prompt, /invalid source/);
});
