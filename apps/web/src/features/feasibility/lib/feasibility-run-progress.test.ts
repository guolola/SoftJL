// Verifies late feasibility results never replace newer inputs or artifacts.
import { describe, it, expect } from "vitest";
import { captureWorkspaceGuard, feasibilityRunSnapshotSchema } from "@uml-platform/contracts";
import { createEmptyWorkspace } from "../../../services/workspace-repository/workspace-state";
import { createRenderMeta } from "../../../test/contract-fixtures";
import { completedFeasibilityArtifacts, mergeFeasibilityRunSnapshot } from "./feasibility-run-progress";

describe("feasibility publication guards", () => {
  it("accepts current outputs but rejects changed source, target and server-skipped publication", () => {
    const workspace = createEmptyWorkspace();
    const snapshot = feasibilityRunSnapshotSchema.parse({
      operationType: "feasibility_analysis", outputManifest: [],
      runId: "run", projectId: "p", selectedArtifacts: ["context"],
      providerSettings: { providerConfigId: "p", model: "m" }, rules: [], requirementBaseline: null,
      inputs: {}, status: "completed", currentStage: null, error: null,
      contextModel: { diagramKind: "context", modelId: "context", title: "系统环境", summary: "边界", notes: [],
        system: { id: "system", name: "订单系统", sourceRequirementIds: [] }, people: [], externalSystems: [], relationships: [] },
      contextPlantUml: { diagramKind: "context", source: "@startuml\n@enduml" },
      contextSvg: { diagramKind: "context", svg: "<svg/>", renderMeta: createRenderMeta() },
      contextFingerprint: "fingerprint", implementationPlan: null, implementationFingerprint: null,
    });
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...workspace });
    snapshot.outputManifest = [];
    expect(completedFeasibilityArtifacts(snapshot)).toEqual([]);
    snapshot.outputManifest = [{ kind: "context", id: "context" }];
    expect(completedFeasibilityArtifacts(snapshot)).toEqual(["context"]);
    expect(mergeFeasibilityRunSnapshot(workspace, snapshot, ["context"]).feasibilityContextModel).toEqual(snapshot.contextModel);
    const changedSource = { ...workspace, requirementText: "更新的需求" };
    expect(mergeFeasibilityRunSnapshot(changedSource, snapshot, ["context"])).toBe(changedSource);
    const changedTarget = { ...workspace, feasibilityContextModel: { ...snapshot.contextModel!, title: "人工修改" } };
    expect(mergeFeasibilityRunSnapshot(changedTarget, snapshot, ["context"])).toBe(changedTarget);
    snapshot.publicationSkipped = "输入已更新";
    expect(mergeFeasibilityRunSnapshot(workspace, snapshot, ["context"])).toBe(workspace);
  });
});
