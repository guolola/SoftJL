// Verifies workspace freshness and design blockers use the saved generation contract.
import { describe, expect, it } from "vitest";
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
  RequirementModelTraceabilityEntry,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import { createEmptyDiagnostics } from "./diagnostics";
import { createEmptyRunUiState } from "./run-ui-state";
import { deriveWorkspaceStatus } from "./workspace-derived-status";
import {
  describeMissingDesignSources,
  designInputFingerprintFor,
  requirementInputFingerprintFor,
  isRequirementDiagramStale,
} from "./workspace-context";
import { createEmptyWorkspace } from "../../../services/workspace-repository/workspace-state";
import { validateModelInput, validateModelStructure } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";

function statusInput(models: Parameters<typeof deriveWorkspaceStatus>[0]["models"]): Parameters<typeof deriveWorkspaceStatus>[0] {
  return {
    ...createEmptyWorkspace(), models, requirementText: "系统支持可选处理与结果检查。",
    hasUncommittedRequirementDraft: false, currentRunDiagnostics: createEmptyDiagnostics(),
    generatedDiagrams: [], generatedDesignDiagrams: [], runUiState: createEmptyRunUiState(),
    textVersion: 1, visibleGenerationTask: null,
  };
}

const rule: RequirementRule = {
  id: "r1",
  type: "business-rule" as const,
  text: "系统需要管理订单。",

};

const requirementClassModel = {
  diagramKind: "class",
  modelId: "class",
  title: "领域概念模型",
  summary: "订单领域模型。",
  notes: [],
  classes: [{ id: "order", name: "Order", attributes: [], operations: [] }],
  interfaces: [],
  enums: [],
  relationships: [],
} as unknown as DiagramModelSpec;

const requirementTrace: RequirementModelTraceabilityEntry[] = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "order",
      elementKind: "class",
      label: "Order",
      modelId: "class",
    },
  },
];

const designClassModel = {
  diagramKind: "class",
  modelId: "design-class",
  title: "设计类图",
  summary: "设计类。",
  notes: [],
  classes: [{ id: "order-service", name: "OrderService", attributes: [], operations: [] }],
  interfaces: [],
  enums: [],
  relationships: [],
} as unknown as DesignDiagramModelSpec;

const designTableModel = {
  diagramKind: "table",
  modelId: "design-table",
  title: "数据库设计",
  summary: "订单表。",
  notes: [],
  tables: [
    {
      id: "tbl-order",
      name: "orders",
      columns: [{ id: "col-order-id", name: "id", type: "uuid", nullable: false }],
    },
  ],
  relationships: [],
} as unknown as DesignDiagramModelSpec;

describe("deriveWorkspaceStatus", () => {
  it.each([false, true])("does not block schema-valid multi-entry decisions, including retry loops=%s", retry => {
    const model = modelFixture("requirements", "activity");
    if (model.diagramKind !== "activity") throw new Error("Expected an activity fixture");
    model.nodes = [
      { id: "start", type: "start", name: "开始", actorOrLane: "system" },
      { id: "optional", type: "decision", name: "可选处理是否启用", actorOrLane: "system" },
      { id: "work", type: "activity", name: "执行可选处理", actorOrLane: "system", input: [], output: [] },
      { id: "check", type: "decision", name: "结果是否通过", actorOrLane: "system" },
      { id: "correct", type: "activity", name: "补充处理", actorOrLane: "system", input: [], output: [] },
      { id: "end", type: "end", name: "结束", actorOrLane: "system" },
    ];
    model.relationships = [
      { id: "start-optional", sourceId: "start", targetId: "optional" },
      { id: "enabled", sourceId: "optional", targetId: "work", condition: "启用" },
      { id: "disabled", sourceId: "optional", targetId: "check", condition: "停用" },
      { id: "work-check", sourceId: "work", targetId: "check" },
      { id: "failed", sourceId: "check", targetId: "correct", condition: "未通过" },
      { id: "passed", sourceId: "check", targetId: "end", condition: "通过" },
      { id: "corrected", sourceId: "correct", targetId: retry ? "check" : "end" },
    ].map(edge => ({ ...edge, type: "control_flow" as const }));
    expect(validateModelStructure(model, "requirements")).toEqual([]);
    expect(validateModelInput(model, "requirements")).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "split-degree", elementId: "check", severity: "error" }),
    ]));
    const before = JSON.stringify(model);
    expect(deriveWorkspaceStatus(statusInput({ [model.modelId!]: model })).designGenerationBlockedReason).toBeNull();
    expect(JSON.stringify(model)).toBe(before);
  });

  it.each(["missing-title", "unsupported-field"])("continues blocking saved models with %s", invalid => {
    const model = modelFixture("requirements", "activity");
    if (model.diagramKind !== "activity") throw new Error("Expected an activity fixture");
    if (invalid === "missing-title") model.title = "";
    else Object.assign(model, { obsoleteField: true });
    expect(validateModelStructure(model, "requirements").length).toBeGreaterThan(0);
    expect(deriveWorkspaceStatus(statusInput({ [model.modelId!]: model })).designGenerationBlockedReason)
      .toBe("上游需求模型未通过结构校验，请修复或重新生成后继续设计");
  });

  it("requires a model receipt even when no generated flag or version is stored", () => {
    const workspace = createEmptyWorkspace();
    expect(isRequirementDiagramStale({
      ...workspace,
      diagram: "class",
      activeRequirementFingerprint: requirementInputFingerprintFor("订单需求", [rule]),
      generatedDiagrams: [],
      models: { class: requirementClassModel },
    })).toBe(true);
  });
  it("keeps fresh design models current while tracking incomplete design traces separately", () => {
    const requirementFingerprint = requirementInputFingerprintFor("订单需求", [rule]);
    const designFingerprint = designInputFingerprintFor(
      [requirementClassModel],
      requirementTrace,
    );

    const status = deriveWorkspaceStatus({
      hasUncommittedRequirementDraft: false,
      currentRunDiagnostics: createEmptyDiagnostics(),
      designInputFingerprints: {
        "design-class": designFingerprint,
        "design-table": designFingerprint,
      },
      designModelTraceability: [
        {
          source: {
            diagramKind: "class",
            elementId: "order-service",
            elementKind: "class",
            label: "OrderService",
            modelId: "design-class",
          },
          targets: [requirementTrace[0]!.target],

          },
      ],
      designModels: {
        "design-class": designClassModel,
        "design-table": designTableModel,
      },
      diagramInputFingerprints: { class: requirementFingerprint },
      diagramVersions: { class: 1 },
      generatedDesignDiagrams: ["class", "table"],
      generatedDiagrams: ["class"],
      manualModelEditStatus: {},
      models: { class: requirementClassModel },
      requirementBaseline: null,
      requirementInputFingerprint: requirementFingerprint,
      requirementModelTraceability: requirementTrace,

      requirementText: "订单需求",
      rules: [rule],
      rulesBasedOnTextVersion: 1,
      rulesVersion: 1,
      runUiState: createEmptyRunUiState(),
      textVersion: 1,
      visibleGenerationTask: null,
    });


    expect(status.staleDesignModelIds).toEqual([]);
    expect(status.staleDesignDiagrams).toEqual([]);
    expect(status.designStaleReasons["design-table"]).toBeUndefined();
    expect(status.designStaleReasons["design-class"]).toBeUndefined();
  });

  it("marks old requirement and design artifacts stale when the requirement text is cleared", () => {
    const requirementFingerprint = requirementInputFingerprintFor("订单需求", [rule]);
    const designFingerprint = designInputFingerprintFor(
      [requirementClassModel],
      requirementTrace,
    );

    const status = deriveWorkspaceStatus({
      hasUncommittedRequirementDraft: false,
      currentRunDiagnostics: createEmptyDiagnostics(),
      designInputFingerprints: {
        "design-class": designFingerprint,
      },
      designModelTraceability: [
        {
          source: {
            diagramKind: "class",
            elementId: "order-service",
            elementKind: "class",
            label: "OrderService",
            modelId: "design-class",
          },
          targets: [requirementTrace[0]!.target],

          },
      ],
      designModels: {
        "design-class": designClassModel,
      },
      diagramInputFingerprints: {},
      diagramVersions: {},
      generatedDesignDiagrams: ["class"],
      generatedDiagrams: [],
      manualModelEditStatus: {},
      models: { class: requirementClassModel },
      requirementBaseline: null,
      requirementInputFingerprint: requirementFingerprint,
      requirementModelTraceability: requirementTrace,

      requirementText: "",
      rules: [rule],
      rulesBasedOnTextVersion: 1,
      rulesVersion: 1,
      runUiState: createEmptyRunUiState(),
      textVersion: 2,
      visibleGenerationTask: null,
    });

    expect(status.isRulesStale).toBe(true);
    expect(status.staleDiagrams).toEqual(["class"]);
    expect(status.staleDesignDiagrams).toEqual(["class"]);
    expect(status.designStaleReasons["design-class"]).toContain("需求源头已删除");
    expect(status.designGenerationBlockedReason).toBe("请先输入需求文本");
  });
});

describe("describeMissingDesignSources", () => {
  it("explains that first-generation source declarations are missing", () => {
    const details = describeMissingDesignSources([]);

    expect(details).toContain("缺少首次生成的来源声明");
  });
});
