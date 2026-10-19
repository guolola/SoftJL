// Ensures fixed type membership cannot be changed by LLM references, generation or staleness.
import assert from "node:assert/strict";
import test from "node:test";
import { requirementModelSources } from "./requirement-model-sources.js";
import { functionStructureDiagramSpecSchema } from "./models.js";
import type { RequirementRule } from "./requirements.js";
const rules: RequirementRule[] = [{ id: "r1", type: "functional", text: "提交订单" }, { id: "r2", type: "quality", text: "键盘操作" }];
const model = functionStructureDiagramSpecSchema.parse({ diagramKind: "function", title: "功能", summary: "功能", notes: [], nodes: [{ id: "f1", name: "提交订单", parentId: null }], relationships: [] });

test("fixed sources stay the same before and after generation, including stale models", () => {
  for (const models of [[], [model]]) for (const stale of [false, true]) {
    const result = requirementModelSources({ diagram: "function", rules, models, stale, traceability: [
      { ruleId: "r2", target: { diagramKind: "function", elementId: "f1", elementKind: "function", label: "提交订单" }, mappingSource: "llm", reviewStatus: "confirmed" },
    ] });
    assert.equal(result.mode, "mapped");
    assert.deepEqual(result.rules.map(rule => rule.id), ["r1"]);
  }
  assert.deepEqual(requirementModelSources({ diagram: "prototype", rules, models: [], traceability: [] }).rules, rules);
});

test("changing a requirement type changes membership without requiring model generation", () => {
  assert.deepEqual(requirementModelSources({ diagram: "class", rules, models: [], traceability: [] }).rules, []);
  const changed = rules.map(rule => ({ ...rule, type: "data" as const }));
  assert.deepEqual(requirementModelSources({ diagram: "class", rules: changed, models: [], traceability: [] }).rules, changed);
});
