// Verifies traceability row builders surface pending review metadata for the matrix UI.
import { describe, expect, it } from "vitest";
import { buildContextRows, buildDesignRows, buildRequirementRows } from "./traceability-rows";

describe("traceability row builders", () => {
  it("builds context coverage from people, external systems, and relationships only", () => {
    const rows = buildContextRows(
      [
        { id: "R1", category: "功能需求", text: "客户发起预约。", relatedDiagrams: ["context"] },
        { id: "R2", category: "外部接口", text: "系统检查库存。", relatedDiagrams: ["context"] },
      ],
      {
        diagramKind: "context",
        modelId: "context",
        title: "系统环境图",
        summary: "系统边界",
        notes: [],
        system: { id: "system", name: "维修系统", sourceRequirementIds: [] },
        people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
        externalSystems: [{ id: "inventory", name: "库存系统", sourceRequirementIds: ["R2"] }],
        relationships: [{ id: "rel-1", sourceId: "customer", targetId: "system", direction: "directed", label: "预约", sourceRequirementIds: ["R1"] }],
      },
      [],
    );

    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row.label === "维修系统")).toBe(false);
    expect(rows.every((row) => row.status === "mapped")).toBe(true);
    expect(rows.map((row) => row.groupLabel)).toEqual(["人员", "外部系统", "关系"]);
  });

  it("marks context rows with invalid rule references as unmapped", () => {
    const rows = buildContextRows(
      [{ id: "R1", category: "功能需求", text: "客户发起预约。", relatedDiagrams: ["context"] }],
      {
        diagramKind: "context",
        modelId: "context",
        title: "系统环境图",
        summary: "系统边界",
        notes: [],
        system: { id: "system", name: "维修系统", sourceRequirementIds: [] },
        people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R404"] }],
        externalSystems: [],
        relationships: [],
      },
      [],
    );

    expect(rows[0]).toMatchObject({ status: "unmapped", mappingNote: "无效来源规则：R404" });
  });

  it("surfaces pending auto-filled requirement mappings with confidence details", () => {
    const rows = buildRequirementRows(
      [
        {
          id: "r1",
          category: "数据需求",
          text: "系统应维护图书信息。",
          relatedDiagrams: ["class"],
        },
      ],
      {
        class: {
          diagramKind: "class",
          title: "领域概念模型",
          summary: "图书领域对象",
          notes: [],
          classes: [
            {
              id: "Book",
              name: "Book",
              attributes: [],
              operations: [],
            },
          ],
          interfaces: [],
          enums: [],
          relationships: [],
        },
      },
      [
        {
          ruleId: "r1",
          target: {
            diagramKind: "class",
            modelId: "class",
            elementId: "Book",
            elementKind: "class",
            label: "Book",
          },
          mappingSource: "auto-filled-pending-review",
          reviewStatus: "pending",
          confidence: "low",
          rationale: "系统按相关图类型兜底补齐，需人工复核。",
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "mapped",
      mappingNote: "系统按相关图类型兜底补齐，需人工复核。",
    });
    expect(rows[0]?.detailLines).toContain(
      "待确认：系统按相关图类型兜底补齐，需人工复核。",
    );
    expect(rows[0]?.detailLines).toContain("置信度：low");
  });

  it("does not count raw mappings that are absent from the trusted coverage matrix", () => {
    const rows = buildRequirementRows(
      [
        {
          id: "r1",
          category: "功能需求",
          text: "用户登录系统。",
          relatedDiagrams: ["usecase"],
        },
        {
          id: "r2",
          category: "功能需求",
          text: "用户搜索课程。",
          relatedDiagrams: ["usecase"],
        },
      ],
      {
        usecase: {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "用户流程",
          notes: [],
          actors: [],
          useCases: [
            {
              id: "login",
              name: "登录",
              goal: "进入系统",
              preconditions: [],
              postconditions: [],
              supportingActorIds: [],
            },
            {
              id: "search",
              name: "搜索课程",
              goal: "找到课程",
              preconditions: [],
              postconditions: [],
              supportingActorIds: [],
            },
          ],
          systemBoundaries: [],
          relationships: [],
        },
      },
      [
        {
          ruleId: "r2",
          target: {
            diagramKind: "usecase",
            elementId: "login",
            elementKind: "usecase",
            label: "登录",
          },
        },
        {
          ruleId: "r2",
          target: {
            diagramKind: "usecase",
            elementId: "search",
            elementKind: "usecase",
            label: "搜索课程",
          },
        },
      ],
      undefined,
      undefined,
      {
        runId: "run-trusted",
        rows: [
          {
            requirementId: "REQ-002",
            status: "covered",
            rationale: "搜索课程由搜索用例说明。",
            modelElements: ["usecase:search"],
            designElements: [],
            codeArtifacts: [],
            tests: [],
            reviewItems: [],
          },
        ],
      },
    );

    expect(rows.map((row) => [row.label, row.status])).toEqual([
      ["登录", "unmapped"],
      ["搜索课程", "mapped"],
    ]);
  });

  it("shows design upstream and requirement elements without requirement rules", () => {
    const rows = buildDesignRows(
      [
        {
          id: "r1",
          category: "功能需求",
          text: "系统应支持借书。",
          relatedDiagrams: ["usecase"],
        },
      ],
      {
        usecase: {
          diagramKind: "usecase",
          title: "用例模型",
          summary: "借书",
          notes: [],
          actors: [],
          useCases: [
            {
              id: "borrow-book",
              name: "借书",
              goal: "完成借书",
              preconditions: [],
              postconditions: [],
              supportingActorIds: [],
            },
          ],
          systemBoundaries: [],
          relationships: [],
        },
      },
      {
        class: {
          diagramKind: "class",
          title: "设计类图",
          summary: "借书服务",
          notes: [],
          classes: [
            {
              id: "BorrowingService",
              name: "BorrowingService",
              attributes: [],
              operations: [],
            },
          ],
          interfaces: [],
          enums: [],
          relationships: [],
        },
      },
      [
        {
          ruleId: "r1",
          target: {
            diagramKind: "usecase",
            modelId: "usecase",
            elementId: "borrow-book",
            elementKind: "usecase",
            label: "借书",
          },
        },
      ],
      [
        {
          source: {
            diagramKind: "class",
            modelId: "class",
            elementId: "BorrowingService",
            elementKind: "class",
            label: "BorrowingService",
          },
          upstreamDesignRefs: [
            {
              diagramKind: "sequence",
              modelId: "sequence:borrow-book",
              elementId: "BorrowingService",
              elementKind: "participant",
              label: "借书服务调用",
            },
          ],
          targets: [
            {
              diagramKind: "usecase",
              modelId: "usecase",
              elementId: "borrow-book",
              elementKind: "usecase",
              label: "借书",
            },
          ],
          mappingSource: "auto-filled-pending-review",
          reviewStatus: "pending",
          confidence: "low",
          rationale:
            "未找到明确上游来源，系统仅按最接近的需求元素临时补齐；请在跟踪矩阵中采纳、忽略或稍后处理。",
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.requirementRules).toEqual([]);
    expect(rows[0]?.upstreamDesignElements.map((ref) => ref.label)).toEqual([
      "借书服务调用",
    ]);
    expect(rows[0]?.requirementElements.map((ref) => ref.label)).toEqual([
      "借书",
    ]);
    expect(rows[0]?.mappingNote).toBe("由系统自动建立候选映射，需复核。");
    expect(rows[0]?.detailLines).toEqual([
      "待确认：由系统自动建立候选映射，需复核。",
      "来源用例实现设计：sequence:borrow-book / 借书服务调用",
      "需求元素：用例模型 / 借书",
    ]);
  });
});
