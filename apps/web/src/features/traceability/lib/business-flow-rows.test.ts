// Checks that flow matrices preserve explicit node/lane/edge mappings without inventing sources.
import { describe, expect, it } from "vitest";
import { createBusinessFlowArtifact, createRule } from "../../../test/workspace-test-utils";
import { buildBusinessFlowRows } from "./business-flow-rows";

describe("business flow trace rows", () => {
  it("includes all lanes, activities and edges while marking missing and deleted sources", () => {
    const artifact = createBusinessFlowArtifact();
    artifact.traceability.push({ requirementId: "r1", targetKind: "swimlane", targetId: "system" });
    artifact.traceability.push({ requirementId: "removed", targetKind: "relationship", targetId: "e1" });
    const rows = buildBusinessFlowRows(artifact, [createRule()]);
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.id === "business-flow:node:process")).toMatchObject({ status: "mapped", requirementRules: [expect.objectContaining({ id: "r1" })] });
    expect(rows.find((row) => row.id === "business-flow:swimlane:system")?.status).toBe("mapped");
    expect(rows.find((row) => row.id === "business-flow:relationship:e1")).toMatchObject({ status: "unmapped", requirementRules: [], mappingNote: expect.stringContaining("removed") });
    expect(rows.find((row) => row.id === "business-flow:relationship:e2")?.status).toBe("unmapped");
  });
  it("keeps target kinds distinct and reacts to updated traces", () => {
    const artifact = createBusinessFlowArtifact();
    artifact.model.swimlanes[0]!.id = "process";
    let rows = buildBusinessFlowRows(artifact, [createRule()]);
    expect(rows.find((row) => row.id === "business-flow:swimlane:process")?.status).toBe("unmapped");
    expect(rows.find((row) => row.id === "business-flow:node:process")?.status).toBe("mapped");
    artifact.traceability = [];
    rows = buildBusinessFlowRows(artifact, [createRule()]);
    expect(rows.every((row) => row.status === "unmapped")).toBe(true);
    expect(buildBusinessFlowRows(null, [createRule()])).toEqual([]);
  });
});
