import { describe, expect, it } from "vitest";
import { createRunSnapshot, createWorkspaceRecord } from "../../test/workspace-test-utils";
import { createMemoryWorkspacePersistence } from "./store";

describe("workspace persistence ports", () => {
  it("stores workspaces, runs, artifacts, projects, and provenance in memory", async () => {
    const persistence = createMemoryWorkspacePersistence();
    const workspace = createWorkspaceRecord({ id: "workspace-1" });

    await persistence.workspaces.saveWorkspace(workspace);
    await persistence.projects.saveProject({
      id: "project-1",
      workspaceId: workspace.id,
      name: "Demo",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z",
    });
    await persistence.runs.saveRun(createRunSnapshot({ runId: "run-1" }));
    await persistence.artifacts.saveArtifact({
      id: "artifact-1",
      workspaceId: workspace.id,
      kind: "requirementModel",
      title: "用例图",
      createdAt: "2026-05-18T00:00:00.000Z",
      payload: { diagramKind: "usecase" },
    });
    await persistence.provenance.saveArtifactProvenance({
      artifactId: "artifact-1",
      artifactType: "requirementModel",
      runId: "run-1",
      stage: "generate_models",
      model: "gpt-5.5",
      promptPackageVersion: "0.0.1",
      inputArtifactIds: ["requirement-text-1"],
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(await persistence.workspaces.getWorkspace(workspace.id)).toMatchObject({
      id: workspace.id,
    });
    expect(await persistence.projects.listProjects(workspace.id)).toHaveLength(1);
    expect(await persistence.runs.getRun("run-1")).toMatchObject({ runId: "run-1" });
    expect(await persistence.artifacts.listArtifacts(workspace.id)).toHaveLength(1);
    expect(await persistence.provenance.getArtifactProvenance("artifact-1")).toMatchObject({
      runId: "run-1",
      inputArtifactIds: ["requirement-text-1"],
    });
  });
});
