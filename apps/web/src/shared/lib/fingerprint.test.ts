import { describe, expect, it } from "vitest";
import {
  designInputFingerprint,
  normalizeDesignInputFingerprint,
  normalizeSnapshotFingerprint,
  snapshotInputFingerprint,
  WORKSPACE_FINGERPRINT_VERSION,
} from "./fingerprint";

describe("snapshotInputFingerprint", () => {
  it("ignores object key insertion order", () => {
    const left = snapshotInputFingerprint({
      requirementText: "订单需求",
      rules: [
        {
          id: "r1",
          category: "功能需求",
          text: "用户提交订单。",
          relatedDiagrams: ["usecase"],
        },
      ],
    });
    const right = snapshotInputFingerprint({
      rules: [
        {
          text: "用户提交订单。",
          relatedDiagrams: ["usecase"],
          category: "功能需求",
          id: "r1",
        },
      ],
      requirementText: "订单需求",
    });

    expect(left).toBe(right);
    expect(left).toMatch(
      new RegExp(`^${WORKSPACE_FINGERPRINT_VERSION}:[0-9a-f]{32}$`),
    );
    expect(left.length).toBeLessThan(48);
  });

  it("does not upgrade legacy JSON fingerprints to the current semantic version", () => {
    const legacyFingerprint = JSON.stringify({
      rules: [
        {
          text: "用户提交订单。",
          relatedDiagrams: ["usecase"],
          category: "功能需求",
          id: "r1",
        },
      ],
      requirementText: "订单需求",
    });

    expect(normalizeSnapshotFingerprint(legacyFingerprint)).not.toBe(
      snapshotInputFingerprint({
        requirementText: "订单需求",
        rules: [
          {
            id: "r1",
            category: "功能需求",
            text: "用户提交订单。",
            relatedDiagrams: ["usecase"],
          },
        ],
      }),
    );
  });
});

describe("designInputFingerprint", () => {
  it("ignores requirement model and traceability insertion order", () => {
    const usecaseModel = {
      diagramKind: "usecase",
      actors: [{ id: "actor_user", name: "用户" }],
      useCases: [{ id: "uc_submit", name: "提交订单" }],
    };
    const classModel = {
      diagramKind: "class",
      classes: [{ id: "class_order", name: "Order" }],
    };
    const traceability = [
      {
        source: { diagramKind: "class", elementId: "class_order" },
        targets: [{ diagramKind: "usecase", elementId: "uc_submit" }],
      },
      {
        source: { diagramKind: "usecase", elementId: "uc_submit" },
        targets: [{ diagramKind: "usecase", elementId: "actor_user" }],
      },
    ];

    const left = designInputFingerprint(
      [usecaseModel, classModel],
      traceability,
    );
    const right = designInputFingerprint(
      [classModel, usecaseModel],
      [...traceability].reverse(),
    );

    expect(left).toBe(right);
    expect(left).toMatch(
      new RegExp(`^${WORKSPACE_FINGERPRINT_VERSION}:[0-9a-f]{32}$`),
    );
    expect(left.length).toBeLessThan(48);
  });

  it("does not upgrade legacy design fingerprints to the current semantic version", () => {
    const legacyFingerprint = JSON.stringify({
      requirementModels: [
        { diagramKind: "class", classes: [{ id: "class_order" }] },
        { diagramKind: "usecase", useCases: [{ id: "uc_submit" }] },
      ],
      requirementModelTraceability: [
        {
          source: { diagramKind: "class", elementId: "class_order" },
          targets: [{ diagramKind: "usecase", elementId: "uc_submit" }],
        },
      ],
    });

    expect(normalizeDesignInputFingerprint(legacyFingerprint)).not.toBe(
      designInputFingerprint(
        [
          { diagramKind: "usecase", useCases: [{ id: "uc_submit" }] },
          { diagramKind: "class", classes: [{ id: "class_order" }] },
        ],
        [
          {
            source: { diagramKind: "class", elementId: "class_order" },
            targets: [{ diagramKind: "usecase", elementId: "uc_submit" }],
          },
        ],
      ),
    );
  });
});
