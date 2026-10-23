// Verifies current generated fields, source links and preservation of valid economics.
import assert from "node:assert/strict";
import test from "node:test";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import { normalizeFeasibilityImplementationDetailed } from "./implementation-normalizer.js";

function sourcedExample() {
  const value = structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE) as any;
  for (const candidate of value.candidates) {
    candidate.sourceRequirementIds = ["r1"];
    for (const module of candidate.implementation.architecture.modules) module.sourceRequirementIds = ["r1"];
  }
  return value;
}

test("links the integration to the context external system without rewriting economics", () => {
  const value = sourcedExample();
  const originalCosts = structuredClone(
    value.candidates[0].implementation.costEstimates,
  );
  value.candidates[0].implementation.integrations = [{
    name: "统一身份平台",
    responsibility: "完成用户身份校验",
    sourceRequirementIds: ["r1"],
    assumption: "上下文只定义了系统边界，协议仍待确认。",
    provenance: "user-confirmed",
  }];

  const result = normalizeFeasibilityImplementationDetailed(
    value,
    [{ id: "external-auth", name: "统一身份平台" }],
  );
  const integration = result.plan.candidates[0]!.implementation!.integrations[0]!;

  assert.equal(integration.responsibility, "完成用户身份校验");
  assert.equal(integration.contextExternalSystemId, "external-auth");
  assert.equal(integration.provenance, "ai-estimate");
  assert.deepEqual(
    result.plan.candidates[0]!.implementation!.costEstimates,
    originalCosts.map((item: any, index: number) => ({
      ...item,
      id: `candidate-1-cost-${index + 1}`,
    })),
  );
  assert.ok(result.actions.includes("linked-integration-by-external-system-name"));
});

test("deduplicates absence scopes and removes declarations that conflict with items", () => {
  const value = sourcedExample();
  const implementation = value.candidates[0].implementation;
  implementation.benefitEstimates = implementation.benefitEstimates.filter(
    (item: any) => item.category !== "one-time",
  );
  implementation.absenceDeclarations = [
    {
      scope: "one-time-benefits",
      reason: "没有可识别的一次性收益。",
      provenance: "user-confirmed",
    },
    {
      scope: "one-time-benefits",
      reason: "重复声明应删除。",
      provenance: "user-confirmed",
    },
    {
      scope: "recurring-costs",
      reason: "与实际年度运维成本冲突。",
      provenance: "user-confirmed",
    },
  ];

  const result = normalizeFeasibilityImplementationDetailed(value, []);
  const declarations =
    result.plan.candidates[0]!.implementation!.absenceDeclarations;

  assert.deepEqual(declarations, [{
    scope: "one-time-benefits",
    reason: "没有可识别的一次性收益。",
    provenance: "ai-estimate",
  }]);
  assert.ok(result.actions.includes("removed-duplicate-absence-scope"));
  assert.ok(result.actions.includes("removed-conflicting-absence-declaration"));
});

test("rejects non-current integration fields instead of translating or dropping them", () => {
  for (const includeCurrentField of [false, true]) {
    const value = sourcedExample();
    value.candidates[0].implementation.integrations = [{
      name: "统一身份平台", purpose: "身份校验", sourceRequirementIds: ["r1"],
      assumption: "", provenance: "ai-estimate", contextExternalSystemId: "auth",
      ...(includeCurrentField ? { responsibility: "身份校验" } : {}),
    }];
    const before = structuredClone(value);
    assert.throws(() => normalizeFeasibilityImplementationDetailed(value, [{ id: "auth", name: "统一身份平台" }]), /purpose|responsibility/);
    assert.deepEqual(value, before);
  }
});

test("rejects non-current absence fields even in conflicting or duplicate declarations", () => {
  for (const scope of ["one-time-benefits", "recurring-costs"]) {
    for (const includeCurrentField of [false, true]) {
      const value = sourcedExample();
      const implementation = value.candidates[0].implementation;
      implementation.benefitEstimates = implementation.benefitEstimates.filter((item: any) => item.category !== "one-time");
      implementation.absenceDeclarations = [
        { scope, reason: "当前声明", provenance: "ai-estimate" },
        { scope, rationale: "非现行字段", provenance: "ai-estimate", ...(includeCurrentField ? { reason: "声明" } : {}) },
      ];
      const before = structuredClone(value);
      assert.throws(() => normalizeFeasibilityImplementationDetailed(value, []), /rationale|reason/);
      assert.deepEqual(value, before);
    }
  }
});

test("preserves first-generation source IDs without guessing an existing rule", () => {
  const value = sourcedExample();
  value.candidates[0].implementation.architecture.modules[0].sourceRequirementIds =
    ["REQ-001"];

  const result = normalizeFeasibilityImplementationDetailed(
    value,
    [],
  );

  assert.deepEqual(
    result.plan.candidates[0]!.implementation!.architecture.modules[0]!
      .sourceRequirementIds,
    ["REQ-001"],
  );
  assert.ok(!result.actions.includes("normalized-requirement-id-alias"));
});


test("candidate, business module and integration cannot replace sources with assumptions", () => {
  for (const select of [
    (value: any) => value.candidates[0],
    (value: any) => value.candidates[0].implementation.architecture.modules[0],
  ]) {
    const value = sourcedExample();
    select(value).sourceRequirementIds = [];
    assert.throws(() => normalizeFeasibilityImplementationDetailed(value, []), /必须在首次生成时携带真实需求来源/);
  }
});
