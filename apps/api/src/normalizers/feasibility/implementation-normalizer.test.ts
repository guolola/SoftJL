// Regresses known provider aliases without allowing repairs to rewrite valid economics.
import assert from "node:assert/strict";
import test from "node:test";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import { normalizeFeasibilityImplementationDetailed } from "./implementation-normalizer.js";

test("normalizes purpose and links the integration to the context external system", () => {
  const value = structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE) as any;
  const originalCosts = structuredClone(
    value.candidates[0].implementation.costEstimates,
  );
  value.candidates[0].implementation.integrations = [{
    name: "统一身份平台",
    purpose: "完成用户身份校验",
    sourceRequirementIds: [],
    assumption: "上下文只定义了系统边界，协议仍待确认。",
    provenance: "legacy",
  }];

  const result = normalizeFeasibilityImplementationDetailed(
    value,
    new Set(),
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
  assert.ok(result.actions.includes("aliased-purpose-to-responsibility"));
  assert.ok(result.actions.includes("linked-integration-by-external-system-name"));
});

test("normalizes rationale, deduplicates scopes and removes declarations that conflict with items", () => {
  const value = structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE) as any;
  const implementation = value.candidates[0].implementation;
  implementation.benefitEstimates = implementation.benefitEstimates.filter(
    (item: any) => item.category !== "one-time",
  );
  implementation.absenceDeclarations = [
    {
      scope: "one-time-benefits",
      rationale: "没有可识别的一次性收益。",
      provenance: "legacy",
    },
    {
      scope: "one-time-benefits",
      rationale: "重复声明应删除。",
      provenance: "legacy",
    },
    {
      scope: "recurring-costs",
      rationale: "与实际年度运维成本冲突。",
      provenance: "legacy",
    },
  ];

  const result = normalizeFeasibilityImplementationDetailed(value, new Set(), []);
  const declarations =
    result.plan.candidates[0]!.implementation!.absenceDeclarations;

  assert.deepEqual(declarations, [{
    scope: "one-time-benefits",
    reason: "没有可识别的一次性收益。",
    provenance: "ai-estimate",
  }]);
  assert.ok(result.actions.includes("aliased-rationale-to-reason"));
  assert.ok(result.actions.includes("removed-duplicate-absence-scope"));
  assert.ok(result.actions.includes("removed-conflicting-absence-declaration"));
});

test("normalizes REQ-001 provider aliases to an existing r1 rule", () => {
  const value = structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE) as any;
  value.candidates[0].implementation.architecture.modules[0].sourceRequirementIds =
    ["REQ-001"];

  const result = normalizeFeasibilityImplementationDetailed(
    value,
    new Set(["r1"]),
    [],
  );

  assert.deepEqual(
    result.plan.candidates[0]!.implementation!.architecture.modules[0]!
      .sourceRequirementIds,
    ["r1"],
  );
  assert.ok(result.actions.includes("normalized-requirement-id-alias"));
});
