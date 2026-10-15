// Verifies context trace rows are deterministic and exclude the center-system boundary.
import { describe, expect, it } from "vitest";
import { buildContextTraceability } from "./context-traceability";

describe("buildContextTraceability", () => {
  it("maps people, external systems, and relationships without mapping the center system", () => {
    const rows = buildContextTraceability({
      diagramKind: "context",
      modelId: "context",
      title: "系统环境图",
      summary: "边界",
      notes: [],
      system: { id: "system", name: "目标系统", sourceRequirementIds: [] },
      people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
      externalSystems: [{ id: "inventory", name: "库存", sourceRequirementIds: ["R2"] }],
      relationships: [{ id: "rel-1", sourceId: "customer", targetId: "system", direction: "directed", label: "预约", sourceRequirementIds: ["R1"] }],
    });

    expect(rows).toEqual([
      { requirementId: "R1", targetId: "customer", targetKind: "person", targetLabel: "客户" },
      { requirementId: "R2", targetId: "inventory", targetKind: "external-system", targetLabel: "库存" },
      { requirementId: "R1", targetId: "rel-1", targetKind: "relationship", targetLabel: "预约" },
    ]);
  });
});
