// Verifies cross-stage coverage follows rule traceability and ignores technology-choice differences.
import { describe, expect, it } from "vitest";
import {
  createRequirementBaseline,
  createRule,
  createWorkspaceRecord,
} from "../../../test/workspace-test-utils";
import { buildCrossStageRequirementCoverage } from "./cross-stage-requirement-coverage";

describe("buildCrossStageRequirementCoverage", () => {
  it("connects context, requirement-model and design-model traceability by rule", () => {
    const workspace = createWorkspaceRecord({
      rules: [createRule()],
      requirementBaseline: createRequirementBaseline(),
      feasibilityContextTraceability: [{
        requirementId: "r1",
        targetId: "person-1",
        targetKind: "person",
        targetLabel: "用户",
      }],
      requirementModelTraceability: [{
        ruleId: "r1",
        target: {
          modelId: "usecase",
          elementId: "uc-1",
          elementKind: "usecase",
          label: "登录",
        },
      }],
      designModelTraceability: [{
        source: {
          modelId: "usecase",
          elementId: "uc-1",
          elementKind: "usecase",
          label: "登录",
        },
        targets: [{
          modelId: "architecture",
          elementId: "service-1",
          elementKind: "component",
          label: "可替换技术组件",
        }],
      }],
    });

    const view = buildCrossStageRequirementCoverage(workspace);

    expect(view.sourceConsistent).toBe(true);
    expect(view.rows).toEqual([expect.objectContaining({
      ruleId: "r1",
      context: true,
      requirementModel: true,
      designModel: true,
    })]);
  });

  it("marks references to a different accepted-rule snapshot as needing update", () => {
    const workspace = createWorkspaceRecord({
      rules: [createRule({ id: "r2" })],
      requirementBaseline: null,
      requirementModelTraceability: [{
        ruleId: "r1",
        target: {
          modelId: "usecase",
          elementId: "uc-1",
          elementKind: "usecase",
          label: "旧需求",
        },
      }],
    });

    const view = buildCrossStageRequirementCoverage(workspace);

    expect(view.sourceConsistent).toBe(false);
    expect(view.needsUpdate).toBe(true);
    expect(view.unknownReferences).toEqual(["r1"]);
  });
});
