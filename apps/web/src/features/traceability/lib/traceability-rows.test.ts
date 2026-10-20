// Verifies traceability row builders surface pending review metadata for the matrix UI.
import { describe, expect, it } from "vitest";
import { buildContextRows, buildDesignRows, buildRequirementRows } from "./traceability-rows";
import type { RequirementModelTraceabilityEntry } from "@uml-platform/contracts";

describe("traceability row builders", () => {
  it("uses analysis element sources in the overview exactly as in the single-model matrix", () => {
    const usecase = { diagramKind: "usecase" as const, modelId: "usecase", title: "用例", summary: "下单", notes: [], actors: [], systemBoundaries: [], relationships: [],
      useCases: [{ id: "case", name: "下单", goal: "完成订单", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [] }] };
    const analysis = { diagramKind: "analysis" as const, modelId: "analysis:case", sourceUseCaseId: "case", title: "下单分析", summary: "下单", notes: [], fragments: [],
      participants: [{ id: "a", name: "用户", participantType: "actor" as const, sourceElementIds: ["case"] }, { id: "b", name: "系统", participantType: "control" as const, sourceElementIds: ["case"] }],
      messages: [{ id: "m", type: "sync" as const, sourceId: "a", targetId: "b", name: "下单", parameters: [], sourceElementIds: ["case"] }] };
    const models = { usecase, [analysis.modelId]: analysis };
    const scoped = buildRequirementRows([], models, [], { diagramKind: "analysis", modelId: analysis.modelId });
    const overview = buildRequirementRows([], models, []).filter(row => row.scopeKey === analysis.modelId);
    expect(overview).toEqual(scoped);
    expect(overview).toHaveLength(3);
    expect(overview.every(row => row.status === "mapped")).toBe(true);
  });
  it("counts only existing targets of allowed types and counts duplicate valid mappings once", () => {
    const model = {
      diagramKind: "function" as const, modelId: "config", title: "系统配置", summary: "配置", notes: [],
      nodes: [{ id: "configure", name: "系统配置", description: "安装时进行配置", sourceRequirementIds: ["r1"] }], relationships: [],
    };
    const rules = [
      { id: "r1", type: "functional" as const, text: "家庭保安系统的软件允许用户在安装时进行系统配置。" },
      { id: "r2", type: "data" as const, text: "记录配置信息" },
    ];
    const entry: RequirementModelTraceabilityEntry = { ruleId: "r1", target: { diagramKind: "function", elementId: "configure", elementKind: "function", label: "系统配置" } };
    for (const trace of [
      { ...entry, ruleId: "missing" }, { ...entry, ruleId: "r2" },
      { ...entry, target: { ...entry.target, elementId: "missing" } },
      { ...entry, target: { ...entry.target, modelId: "other-model" } },
    ]) expect(buildRequirementRows(rules, { config: model }, [trace])[0]?.status).toBe("unmapped");
    expect(buildRequirementRows(rules, { config: model }, [entry, entry])[0]?.status).toBe("mapped");
    expect(buildRequirementRows(rules, { a: { ...model, modelId: "a" }, b: { ...model, modelId: "b" } }, [entry]).every(row => row.status === "unmapped")).toBe(true);
  });
  it("builds context coverage from people, external systems, and relationships only", () => {
    const rows = buildContextRows(
      [
        { id: "R1", type: "functional" as const, text: "客户发起预约。",  },
        { id: "R2", type: "interface" as const, text: "系统检查库存。",  },
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
      [{ id: "R1", type: "functional" as const, text: "客户发起预约。",  }],
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

  it("counts valid ID mappings without review metadata", () => {
    const rows = buildRequirementRows(
      [
        {
          id: "r1",
          type: "data" as const,
          text: "系统应维护图书信息。",

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
              constraints: [],
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
          mappingSource: "llm",
          rationale: "系统按相关图类型兜底补齐，需人工复核。",
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "mapped",
      mappingNote: null,
    });
    expect(rows[0]?.detailLines.join(" ")).not.toMatch(/待确认|置信度/);
  });

  it("counts explicit mappings without historical semantic coverage filters", () => {
    const rows = buildRequirementRows(
      [
        {
          id: "r1",
          type: "functional" as const,
          text: "用户登录系统。",

        },
        {
          id: "r2",
          type: "functional" as const,
          text: "用户搜索课程。",

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
              eventFlows: [],
              id: "login",
              name: "登录",
              goal: "进入系统",
              preconditions: [],
              postconditions: [],
              supportingActorIds: [],
            },
            {
              eventFlows: [],
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
    );

    expect(rows.map((row) => [row.label, row.status])).toEqual([
      ["登录", "mapped"],
      ["搜索课程", "mapped"],
    ]);
  });

  it("shows design upstream and requirement elements without requirement rules", () => {
    const rows = buildDesignRows(
      [
        {
          id: "r1",
          type: "functional" as const,
          text: "系统应支持借书。",

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
              eventFlows: [],
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
              constraints: [],
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
          mappingSource: "llm",
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
    expect(rows[0]?.mappingNote).toBeNull();
    expect(rows[0]?.detailLines).toEqual([
      "来源用例实现设计：sequence:borrow-book / 借书服务调用",
      "需求元素：用例模型 / 借书",
    ]);
  });
});
