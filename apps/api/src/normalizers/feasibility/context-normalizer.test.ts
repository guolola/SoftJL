// Verifies context normalization rejects orphan endpoints, duplicate ids, and unknown requirement references.
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContextDiagram } from "./context-normalizer.js";

const validModel = {
  diagramKind: "context" as const,
  title: "系统上下文",
  summary: "研究边界",
  notes: [],
  system: { id: "system", name: "维修系统", sourceRequirementIds: [] },
  people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
  externalSystems: [],
  relationships: [{ id: "rel-1", sourceId: "customer", targetId: "system", direction: "directed" as const, label: "预约", sourceRequirementIds: ["R1"] }],
};

test("normalizes a valid traced context model", () => {
  assert.equal(normalizeContextDiagram(validModel, new Set(["R1"])).relationships.length, 1);
});

test("rejects an invalid relationship endpoint", () => {
  assert.throws(() => normalizeContextDiagram({ ...validModel, relationships: [{ ...validModel.relationships[0], targetId: "missing" }] }, new Set(["R1"])), /missing-endpoint/u);
});

test("rejects duplicate elements and unknown rule references", () => {
  assert.throws(() => normalizeContextDiagram({ ...validModel, externalSystems: [{ id: "customer", name: "重复", sourceRequirementIds: ["R1"] }] }, new Set(["R1"])), /duplicate-id/u);
  assert.throws(() => normalizeContextDiagram({ ...validModel, people: [{ ...validModel.people[0], sourceRequirementIds: ["R404"] }] }, new Set(["R1"])), /不存在的需求规则/u);
});
