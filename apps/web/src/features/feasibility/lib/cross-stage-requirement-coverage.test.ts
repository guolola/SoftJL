// Verifies cross-stage coverage follows rule traceability and ignores technology-choice differences.
import { describe, expect, it } from "vitest";
import {
  createRequirementBaseline,
  createBusinessFlowArtifact,
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
          diagramKind: "usecase",
          modelId: "usecase",
          elementId: "uc-1",
          elementKind: "usecase",
          label: "登录",
        },
      }],
      designModelTraceability: [{
        source: {
          diagramKind: "architecture",
          modelId: "architecture",
          elementId: "service-1",
          elementKind: "component",
          label: "可替换技术组件",
        },
        targets: [{
          diagramKind: "usecase",
          modelId: "usecase",
          elementId: "uc-1",
          elementKind: "usecase",
          label: "登录",
        }],
      }],
    });

    const view = buildCrossStageRequirementCoverage(workspace);

    expect(view.sourceConsistent).toBe(true);
    expect(view.staleArtifacts).toEqual([]);
    expect(view.rows).toEqual([expect.objectContaining({
      ruleId: "r1",
      context: true,
      requirementModel: true,
      designModel: true,
    })]);
  });

  it("does not treat a matching design source or an unrelated target model as requirement coverage", () => {
    const workspace = createWorkspaceRecord({
      rules: [createRule()],
      requirementModelTraceability: [{
        ruleId: "r1",
        target: { diagramKind: "class", modelId: "class", elementId: "user", elementKind: "class", label: "用户" },
      }],
      designModelTraceability: [{
        source: { diagramKind: "class", modelId: "class", elementId: "user", elementKind: "class", label: "用户设计类" },
        targets: [{ diagramKind: "usecase", modelId: "usecase", elementId: "user", elementKind: "actor", label: "用户角色" }],
      }],
    });

    expect(buildCrossStageRequirementCoverage(workspace).rows[0]).toMatchObject({
      ruleId: "r1", requirementModel: true, designModel: false,
    });
  });

  it("marks references to a different accepted-rule snapshot as needing update", () => {
    const workspace = createWorkspaceRecord({
      rules: [createRule({ id: "r2" })],
      requirementBaseline: null,
      requirementModelTraceability: [{
        ruleId: "r1",
        target: {
          diagramKind: "usecase",
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
    expect(view.staleArtifacts).toEqual([]);
  });

  it("reports an outdated business flow even when no environment diagram or implementation exists", () => {
    const rules = [createRule()];
    const workspace = createWorkspaceRecord({
      rules,
      feasibilityBusinessFlow: { ...createBusinessFlowArtifact(rules), fingerprint: "outdated" },
    });
    const view = buildCrossStageRequirementCoverage(workspace);
    expect(view.staleArtifacts).toEqual(["business-flow"]);
    expect(view.sourceConsistent).toBe(false);
    expect(view.needsUpdate).toBe(true);
  });
});
