// Verifies cumulative requirement and design previews preserve protection against real edits.
import { describe, expect, it } from "vitest";
import { captureWorkspaceGuard, designGenerationBaseFingerprints, protectedDesignGenerationKinds, workspaceGuardConflicts, type AnalysisSequenceDiagramSpec, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../../packages/contracts/dist/testing/model-fixtures";
import { createDesignRunSnapshot, createRunSnapshot, createRenderMeta } from "../../../test/contract-fixtures";
import { createWorkspaceRecord } from "../../../test/workspace-test-utils";
import { modelPreviewGuardConflicts, rememberModelPreviewTargets } from "./model-preview-guard";

describe("design preview publication guards", () => {
  it.each(["class", "component"] as const)("accepts its own changed-ID %s preview and protects later edits", (kind) => {
    const oldId = `${kind}:old`, newId = `generated-${kind}`;
    const oldModel = { ...(modelFixture("design", kind) as DesignDiagramModelSpec), modelId: oldId };
    const newModel = { ...oldModel, modelId: newId, summary: "本轮新模型" };
    const initial = createWorkspaceRecord({ designModels: { [oldId]: oldModel }, designPlantUml: { [oldId]: "old" } });
    const snapshot = createDesignRunSnapshot({ selectedDiagrams: [kind], models: [newModel], status: "running" });
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...initial });
    const preview = { ...initial, designModels: { [oldId]: oldModel, [newId]: newModel }, designPlantUml: { [oldId]: "old", [newId]: "new" } };
    expect(workspaceGuardConflicts({ snapshot }, preview)).toContain(`designModels:${kind}`);
    const applied: Record<string, string> = {};
    rememberModelPreviewTargets(snapshot, preview, [kind], applied);
    expect(modelPreviewGuardConflicts(snapshot, preview, applied)).toEqual([]);
    expect(modelPreviewGuardConflicts(snapshot, { ...preview, designModels: { ...preview.designModels, [newId]: { ...newModel, summary: "人工修改" } } }, applied)).toContain(`designModels:${kind}`);
    Object.assign(applied, designGenerationBaseFingerprints(preview.designModels, preview.designPlantUml));
    expect(protectedDesignGenerationKinds(preview.designModels, { [newId]: newModel }, designGenerationBaseFingerprints(initial.designModels, initial.designPlantUml), applied, {
      currentSources: { ...preview.designPlantUml, [newId]: "manual" }, currentSvgs: {}, generatedSources: { [newId]: "new" }, generatedSvgs: {},
    })).toContain(kind);
    expect(modelPreviewGuardConflicts(snapshot, { ...preview, requirementText: "新需求" }, applied)).toContain("requirementText");
    // The completed branch removes the old ID; remembering it makes repeated completion events idempotent.
    const completed = { ...preview, designModels: { [newId]: newModel }, designPlantUml: { [newId]: "new" } };
    rememberModelPreviewTargets(snapshot, completed, [kind], applied);
    expect(modelPreviewGuardConflicts(snapshot, completed, applied)).toEqual([]);
  });
});

describe("requirement preview publication guards", () => {
  it("accepts a previous cumulative analysis preview while protecting models, renders and inputs", () => {
    const first = { ...(modelFixture("requirements", "analysis") as AnalysisSequenceDiagramSpec), modelId: "analysis:first" };
    const second = { ...first, modelId: "analysis:second" };
    const initial = createWorkspaceRecord();
    const snapshot = createRunSnapshot({ selectedDiagrams: ["analysis"], models: [first, second] });
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...initial });
    const svg = { diagramKind: "analysis" as const, modelId: first.modelId, svg: "<svg />", renderMeta: createRenderMeta() };
    const preview = { ...initial, models: { [first.modelId]: first }, plantUml: { [first.modelId]: "generated source" }, svgArtifacts: { [first.modelId]: svg } };
    expect(workspaceGuardConflicts({ snapshot }, preview)).toContain("models:analysis");
    const applied: Record<string, string> = {};
    rememberModelPreviewTargets(snapshot, preview, ["analysis"], applied);
    expect(modelPreviewGuardConflicts(snapshot, preview, applied)).toEqual([]);
    expect(modelPreviewGuardConflicts(snapshot, { ...preview, models: { [first.modelId]: { ...first, summary: "人工修改" } } }, applied)).toContain("models:analysis");
    expect(modelPreviewGuardConflicts(snapshot, { ...preview, plantUml: { [first.modelId]: "manual source" } }, applied)).toContain("plantUml:analysis");
    expect(modelPreviewGuardConflicts(snapshot, { ...preview, svgArtifacts: { [first.modelId]: { ...svg, svg: "<svg>edited</svg>" } } }, applied)).toContain("svgArtifacts:analysis");
    expect(modelPreviewGuardConflicts(snapshot, { ...preview, requirementText: "新需求" }, applied)).toContain("requirementText");
  });
});
