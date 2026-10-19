// Verifies run-level coverage and traceability gates before downstream completion.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DesignDiagramModelSpec,
  DesignModelTraceabilityEntry,
  DiagramModelSpec,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import {
  buildDesignStageTrustedChain,
  buildRequirementStageTrustedChain,

} from "./trusted-chain-traceability.js";

const loginRule = {
  id: "r1",
  type: "business-rule" as const,
  text: "用户必须登录后才能访问主要功能。",

};

const refundRule = {
  id: "r2",
  type: "business-rule" as const,
  text: "管理员必须审批退款。",

};

const useCaseModel: DiagramModelSpec = {
  diagramKind: "usecase",
  title: "权限用例",
  summary: "登录后访问主要功能。",
  notes: [],
  actors: [
    {
      id: "actor-user",
      name: "用户",
      actorType: "human",
      responsibilities: ["登录后访问主要功能"],
    },
  ],
  useCases: [
    {
      id: "uc-login",
      name: "登录后访问主要功能",
      goal: "用户登录后访问主要功能",
      preconditions: ["用户已注册"],
      postconditions: ["系统允许访问主要功能"],
      supportingActorIds: [],
    },
  ],
  systemBoundaries: [],
  relationships: [],
};

const loginTrace: RequirementModelTraceabilityEntry[] = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "usecase",
      elementId: "uc-login",
      elementKind: "usecase",
      label: "登录后访问主要功能",
    },
  },
];

test("declared mappings are projected without validation diagnostics", () => {
  const baseline = buildRequirementBaseline({ runId: "source", requirementText: loginRule.text, rules: [loginRule, refundRule] });
  const source = { ...loginTrace[0]!, target: { ...loginTrace[0]!.target, elementId: "declared-flow" }, confidence: "low" as const };
  const result = buildRequirementStageTrustedChain({ runId: "source", baseline, models: [], requirementModelTraceability: [source] });
  assert.equal(result.coverageMatrix.rows[0]!.status, "covered");
  assert.equal(result.coverageMatrix.rows[1]!.status, "pending-review");
  assert.deepEqual(result.traceabilityMatrix.diagnostics, []);
  assert.ok(result.traceabilityMatrix.links.some(link => link.toArtifactId.includes("declared-flow")));
});

test("design-to-design sources retain explicit lineage and inherit rules without guessing links", () => {
  const baseline = buildRequirementBaseline({ runId: "source", requirementText: loginRule.text, rules: [loginRule] });
  const source = (diagramKind: "class" | "component", modelId: string, elementId: string) => ({ diagramKind, modelId, elementId, elementKind: "element", label: elementId });
  const domain = source("class", "domain", "customer"), designClass = source("class", "design-class", "service"), component = source("component", "component", "module");
  const result = buildDesignStageTrustedChain({ runId: "source", baseline, models: [], requirementModelTraceability: [{ ruleId: "r1", target: domain }],
    designModels: [{ diagramKind: "class", modelId: "design-class" }] as DesignDiagramModelSpec[],
    designModelTraceability: [{ source: component, targets: [designClass] }, { source: designClass, targets: [domain] }] });
  assert.deepEqual(result.traceabilityMatrix.diagnostics, []);
  assert.equal(result.coverageMatrix.rows[0]!.designElements.length, 2);
  assert.ok(result.traceabilityMatrix.links.some(link => link.fromArtifactType === "design-model" && link.fromArtifactId === "design-class:class:service" && link.toArtifactId === "component:component:module"));
});
