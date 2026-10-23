// Locks the card-to-upstream mapping shown by the workflow illustrations to the product dependency table.
import { describe, expect, it } from "vitest";
import { createRequirementBaselineSnapshot, REQUIREMENT_MODEL_RULE_TYPES } from "@uml-platform/contracts";
import { createRequirementBaseline, createRule } from "../../../../tests/helpers/workspace-test-utils";
import { DESIGN_DIAGRAM_ORDER, DIAGRAM_ORDER } from "../../../entities/diagram/model";
import { i18n } from "../../../shared/i18n/i18n";
import {
  DESIGN_MODEL_DEPENDENCY_MAP,
  DESIGN_REQUIREMENT_SOURCE_MAP,
} from "../../workspace-session/lib/generation-planning";
import { directUpstreamInputs, upstreamInputKey, upstreamInputLabel, upstreamBaselineState, upstreamStateFromAvailability, upstreamRuleNodes } from "./upstream-dependencies";

const keys = (inputs: ReturnType<typeof directUpstreamInputs>) => inputs.map(upstreamInputKey);

describe("upstream dependency mapping", () => {
  it("places missing mapped types below existing rules sorted by category and numeric ID", () => {
    const rules = [createRule({ id: "r10", type: "functional" as const }), createRule({ id: "r2", type: "functional" as const })];
    expect(upstreamRuleNodes(rules, REQUIREMENT_MODEL_RULE_TYPES.activity).map(({ kind, rule }) => [kind, rule?.id ?? null])).toEqual([
      ["functional", "r2"], ["functional", "r10"],
      ["business-rule", null], ["interface", null], ["exception", null],
    ]);
    expect(rules.map(rule => rule.id)).toEqual(["r10", "r2"]);
  });

  it("shows each missing mapped type when no rules exist", () => {
    expect(upstreamRuleNodes([], REQUIREMENT_MODEL_RULE_TYPES.class)).toEqual([
      { kind: "business-rule", rule: null }, { kind: "data", rule: null },
    ]);
    const rules = REQUIREMENT_MODEL_RULE_TYPES.class.map((type, index) => createRule({ id: `r${index}`, type }));
    expect(upstreamRuleNodes(rules, REQUIREMENT_MODEL_RULE_TYPES.class).every(node => node.rule)).toBe(true);
  });

  it("keeps generic feasibility rule inputs limited to their actual rules", () => {
    const rule = createRule({ id: "r1", type: "functional" as const });
    expect(upstreamRuleNodes([rule])).toEqual([{ kind: "functional", rule, ordinal: 1 }]);
    expect(upstreamRuleNodes([])).toEqual([]);
  });

  it("matches the feasibility dependency table", () => {
    expect(keys(directUpstreamInputs("feasibility", "context"))).toEqual(["rules", "baseline", "supplementary"]);
    expect(keys(directUpstreamInputs("feasibility", "business-flow"))).toEqual(["rules", "baseline"]);
    expect(keys(directUpstreamInputs("feasibility", "implementation"))).toEqual([
      "feasibility:context", "feasibility:business-flow", "rules", "baseline", "supplementary",
    ]);
    expect(directUpstreamInputs("feasibility", "context").find((input) => input.kind === "supplementary")).toMatchObject({ optional: true });
  });

  it("matches the requirement-model dependency table for every visible card", () => {
    for (const diagram of DIAGRAM_ORDER.filter((item) => item !== "analysis")) {
      expect(keys(directUpstreamInputs("requirement", diagram))).toEqual(["rules:relevant", "baseline"]);
    }
    expect(keys(directUpstreamInputs("requirement", "analysis"))).toEqual(["requirement:usecase:single-use-case"]);
  });

  it("matches the design-model dependency table", () => {
    expect(Object.fromEntries(DESIGN_DIAGRAM_ORDER.map((diagram) => [diagram, keys(directUpstreamInputs("design", diagram))]))).toEqual({
      architecture: ["requirement:function", "baseline:constraints"],
      sequence: ["requirement:usecase:all-use-cases", "requirement:analysis"],
      class: ["requirement:class", "requirement:usecase:all-use-cases"],
      navigation: ["requirement:prototype"],
      table: ["design:class"],
      component: ["design:class"],
      deployment: ["requirement:deployment", "design:component"],
    });
  });

  it("derives design inputs from the generation planner maps", () => {
    for (const diagram of DESIGN_DIAGRAM_ORDER) {
      const inputs = directUpstreamInputs("design", diagram);
      expect(inputs.flatMap((input) => input.kind === "requirement" ? [input.diagram] : [])).toEqual(DESIGN_REQUIREMENT_SOURCE_MAP[diagram]);
      expect(inputs.flatMap((input) => input.kind === "design" ? [input.diagram] : [])).toEqual(DESIGN_MODEL_DEPENDENCY_MAP[diagram]);
    }
  });

  it("labels shared inputs in both languages", () => {
    const en = i18n.getFixedT("en");
    const zh = i18n.getFixedT("zh-CN");
    expect(upstreamInputLabel({ kind: "baseline", constraints: true }, en)).toBe("Confirmed rules and constraints from the requirements baseline");
    expect(upstreamInputLabel({ kind: "supplementary", optional: true }, en)).toBe("Supplementary information");
    expect(upstreamInputLabel({ kind: "requirement", diagram: "usecase", eventFlows: "single-use-case" }, en)).toBe("Event flows of the corresponding use case");
    expect(upstreamInputLabel({ kind: "rules", relevant: true }, zh)).toBe("相关需求规则");
    expect(upstreamInputLabel({ kind: "design", diagram: "class" }, zh)).toBe("设计类图");
    expect(zh("workflowIllustration.states.planned")).toBe("本次将生成");
    expect(en("workflowIllustration.states.planned")).toBe("Will generate");
    expect(en("workflowIllustration.states.running")).toBe("Generating");
  });

  it("uses current rule-snapshot baseline availability", () => {
    const baseline = createRequirementBaselineSnapshot({ runId: "rules-run", requirementText: "需求", rules: [createRule()] });
    expect(baseline.rules).toHaveLength(1);
    expect(upstreamBaselineState(baseline, false)).toBe("ready");
    expect(upstreamBaselineState(baseline, true)).toBe("stale");
    expect(upstreamBaselineState(createRequirementBaseline(), false)).toBe("ready");
    expect(upstreamBaselineState(createRequirementBaseline({ rules: [] }), false)).toBe("missing");
    expect(upstreamBaselineState(null, false)).toBe("missing");
  });

  it("names the actual input rule IDs in both languages and exposes an empty association", () => {
    const rules = [createRule({ id: "r2" }), createRule({ id: "r5", type: "functional" as const })];
    const input = { kind: "rules", relevant: true } as const;
    expect(upstreamInputLabel(input, i18n.getFixedT("zh-CN"), rules)).toBe("业务规则 1、功能需求 1");
    expect(upstreamInputLabel(input, i18n.getFixedT("en"), rules)).toBe("Business rule 1, Functional requirement 1");
    expect(upstreamInputLabel(input, i18n.getFixedT("zh-CN"), [])).toBe("相关需求规则");
    expect(i18n.getFixedT("en")("requirementSemantics.missingType", { type: "Business rule" })).toBe("Missing Business rule");
  });

  it.each([
    ["business-rule", "业务规则", "Business rule"],
    ["functional", "功能需求", "Functional requirement"],
    ["quality", "质量需求", "Quality requirement"],
    ["operations", "部署运行", "Deployment and operations"],
  ] as const)("labels the classified kind for %s", (kind, chinese, english) => {
    const rule = createRule({ id: "r1", type: kind });
    expect(upstreamInputLabel({ kind: "rules" }, i18n.getFixedT("zh-CN"), [rule])).toBe(`${chinese} 1`);
    expect(upstreamInputLabel({ kind: "rules" }, i18n.getFixedT("en"), [rule])).toBe(`${english} 1`);
  });

  it("distinguishes selected future inputs and active generation from saved availability", () => {
    expect(upstreamStateFromAvailability(false, false)).toBe("missing");
    expect(upstreamStateFromAvailability(false, false, { planned: true })).toBe("planned");
    expect(upstreamStateFromAvailability(true, true, { planned: true })).toBe("planned");
    expect(upstreamStateFromAvailability(true, false, { planned: true })).toBe("ready");
    expect(upstreamStateFromAvailability(false, false, { planned: true, running: true })).toBe("running");
    expect(upstreamStateFromAvailability(true, false, { running: true })).toBe("running");
  });
});
