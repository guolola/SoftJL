// Verifies model editor drafts stay aligned with diagram contracts.
import { describe, expect, it } from "vitest";
import { createRelationshipDraft } from "./model-editing";

describe("createRelationshipDraft", () => {
  it("creates activity flows with contract-supported condition metadata", () => {
    const relationship = createRelationshipDraft({
      diagramKind: "activity",
      nodes: [
        { id: "check", type: "decision", question: "是否继续" },
        { id: "next", type: "activity", name: "继续处理" },
      ],
      relationships: [],
    });

    expect(relationship).toMatchObject({
      type: "control_flow",
      sourceId: "check",
      targetId: "next",
      condition: "新条件",
    });
    expect(relationship).not.toHaveProperty("label");
  });
});
