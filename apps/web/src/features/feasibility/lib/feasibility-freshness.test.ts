import { describe, expect, it } from "vitest";
import {
  feasibilityInputsSchema,
  buildFeasibilityImplementationFingerprint,
  snapshotInputFingerprint,
} from "@uml-platform/contracts";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import {
  createRequirementBaseline,
  createBusinessFlowArtifact,
  createRule,
  createWorkspaceRecord,
} from "../../../test/workspace-test-utils";
import { feasibilityArtifactState, includeFeasibilityDependencies } from "./feasibility-freshness";

function readyWorkspace() {
  const rules = [createRule()];
  const requirementBaseline = createRequirementBaseline();
  const feasibilityInputs = feasibilityInputsSchema.parse({});
  const feasibilityContextModel = {
    diagramKind: "context",
    modelId: "context",
  } as unknown as NonNullable<WorkspaceRecord["feasibilityContextModel"]>;
  const feasibilityImplementationPlan = {
    candidates: [
      {
        id: "candidate-1",
        implementation: {},
      },
    ],
    recommendedCandidateId: "candidate-1",
  } as unknown as NonNullable<
    WorkspaceRecord["feasibilityImplementationPlan"]
  >;

  return createWorkspaceRecord({
    rules,
    requirementBaseline,
    feasibilityInputs,
    feasibilityContextModel,
    feasibilityContextPlantUml: "@startuml\n@enduml",
    feasibilityContextSvg: "<svg />",
    feasibilityContextFingerprint: snapshotInputFingerprint({
      rules,
      requirementBaseline,
    }),
    feasibilityImplementationPlan,
    feasibilityBusinessFlow: createBusinessFlowArtifact(rules, requirementBaseline),
    feasibilityImplementationFingerprint: buildFeasibilityImplementationFingerprint({
      rules,
      requirementBaseline,
      businessFlow: createBusinessFlowArtifact(rules, requirementBaseline),
      contextModel: feasibilityContextModel,
      inputs: feasibilityInputs,
    }),
  });
}

describe("feasibilityArtifactState", () => {
  it("invalidates implementation and report readiness after flow or traceability edits", () => {
    for (const edit of [
      (workspace: WorkspaceRecord) => { workspace.feasibilityBusinessFlow!.model.nodes[1]!.name += "变更"; },
      (workspace: WorkspaceRecord) => { workspace.feasibilityBusinessFlow!.traceability[0]!.targetId = "end"; },
    ]) {
      const workspace = readyWorkspace();
      edit(workspace);
      const state = feasibilityArtifactState(workspace);
      expect(state.businessFlowStatus).toBe("ready");
      expect(state.implementationStatus).toBe("stale");
      expect(state.reportReady).toBe(false);
    }
  });

  it("ignores flow rendering metadata but requires a complete saved artifact", () => {
    const workspace = readyWorkspace();
    workspace.feasibilityBusinessFlow!.svg.renderMeta.generatedAt = "2030-01-01T00:00:00.000Z";
    workspace.feasibilityBusinessFlow!.svg.svg = "<svg><text>rerendered</text></svg>";
    expect(feasibilityArtifactState(workspace).reportReady).toBe(true);
    workspace.feasibilityBusinessFlow!.svg.svg = "";
    expect(feasibilityArtifactState(workspace).businessFlowStatus).toBe("missing");
    expect(feasibilityArtifactState(workspace).reportReady).toBe(false);
  });

  it("retains legacy plans as stale and selects only missing or stale dependencies", () => {
    const workspace = readyWorkspace();
    workspace.feasibilityBusinessFlow = null;
    let state = feasibilityArtifactState(workspace);
    expect(state.implementationStatus).toBe("stale");
    expect(includeFeasibilityDependencies(["implementation"], state)).toEqual(["business-flow", "implementation"]);
    workspace.feasibilityBusinessFlow = createBusinessFlowArtifact(workspace.rules, workspace.requirementBaseline);
    workspace.feasibilityBusinessFlow.fingerprint = "stale";
    state = feasibilityArtifactState(workspace);
    expect(includeFeasibilityDependencies(["implementation"], state)).toEqual(["business-flow", "implementation"]);
    expect(includeFeasibilityDependencies(["context"], state)).toEqual(["context"]);
  });

  it("invalidates business flow when accepted rules change, independently of implementation facts", () => {
    const workspace = readyWorkspace();
    expect(feasibilityArtifactState(workspace).businessFlowStale).toBe(false);
    workspace.feasibilityInputs.teamSize = 10;
    expect(feasibilityArtifactState(workspace).businessFlowStale).toBe(false);
    workspace.rules[0]!.text += "更新业务规则";
    expect(feasibilityArtifactState(workspace).businessFlowStale).toBe(true);
  });

  it("marks a complete current analysis ready for reporting", () => {
    const state = feasibilityArtifactState(readyWorkspace());

    expect(state.contextStatus).toBe("ready");
    expect(state.implementationStatus).toBe("ready");
    expect(state.reportReady).toBe(true);
    expect(state.requiredArtifacts).toEqual([]);
  });

  it("requires both artifacts when context is missing", () => {
    const state = feasibilityArtifactState(
      createWorkspaceRecord({ rules: [createRule()] }),
    );

    expect(state.contextStatus).toBe("missing");
    expect(state.implementationStatus).toBe("missing");
    expect(state.reportReady).toBe(false);
    expect(state.requiredArtifacts).toEqual(["context", "business-flow", "implementation"]);
  });

  it("requires both artifacts when context is stale", () => {
    const workspace = readyWorkspace();
    workspace.feasibilityContextFingerprint = "fp:v2:stale";

    const state = feasibilityArtifactState(workspace);

    expect(state.contextStatus).toBe("stale");
    expect(state.requiredArtifacts).toEqual(["context", "implementation"]);
  });

  it("requires only implementation when current context has a stale plan", () => {
    const workspace = readyWorkspace();
    workspace.feasibilityImplementationFingerprint = "fp:v2:stale";

    const state = feasibilityArtifactState(workspace);

    expect(state.contextStatus).toBe("ready");
    expect(state.implementationStatus).toBe("stale");
    expect(state.requiredArtifacts).toEqual(["implementation"]);
  });
});
