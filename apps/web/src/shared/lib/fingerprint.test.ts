// Verifies current fingerprints remain stable under irrelevant object and array ordering.
import { describe, expect, it } from "vitest";
import { designInputFingerprint, snapshotInputFingerprint, WORKSPACE_FINGERPRINT_VERSION } from "./fingerprint";

describe("current fingerprints", () => {
  it("ignores object key insertion order", () => {
    const type = "functional";
    const left = snapshotInputFingerprint({ requirementText: "订单需求", rules: [{ id: "r1", type, text: "用户提交订单。" }] });
    const right = snapshotInputFingerprint({ rules: [{ text: "用户提交订单。", type, id: "r1" }], requirementText: "订单需求" });
    expect(left).toBe(right);
    expect(left).toMatch(new RegExp(`^${WORKSPACE_FINGERPRINT_VERSION}:[0-9a-f]{32}$`));
    expect(left.length).toBeLessThan(48);
  });
  it("ignores requirement model and traceability insertion order", () => {
    const usecase = { diagramKind: "usecase", actors: [{ id: "actor_user", name: "用户" }], useCases: [{ id: "uc_submit", name: "提交订单" }] };
    const model = { diagramKind: "class", classes: [{ id: "class_order", name: "Order" }] };
    const traceability = [
      { source: { diagramKind: "class", elementId: "class_order" }, targets: [{ diagramKind: "usecase", elementId: "uc_submit" }] },
      { source: { diagramKind: "usecase", elementId: "uc_submit" }, targets: [{ diagramKind: "usecase", elementId: "actor_user" }] },
    ];
    const left = designInputFingerprint([usecase, model], traceability);
    expect(left).toBe(designInputFingerprint([model, usecase], [...traceability].reverse()));
    expect(left).toMatch(new RegExp(`^${WORKSPACE_FINGERPRINT_VERSION}:[0-9a-f]{32}$`));
    expect(left.length).toBeLessThan(48);
  });
});
