// Verifies diagram detail normalization used by model overview and focus panels.
import { describe, expect, it } from "vitest";
import { buildDiagramDetailModel } from "./model-details";

describe("buildDiagramDetailModel", () => {
  it("normalizes context boundaries, people, external systems, and interactions", () => {
    const details = buildDiagramDetailModel({
      diagramKind: "context",
      modelId: "context",
      title: "系统环境图",
      summary: "系统边界",
      notes: [],
      system: { id: "system", name: "维修系统", sourceRequirementIds: [] },
      people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
      externalSystems: [{ id: "inventory", name: "库存系统", sourceRequirementIds: ["R2"] }],
      relationships: [{ id: "rel-1", sourceId: "customer", targetId: "system", direction: "bidirectional", label: "预约", sourceRequirementIds: ["R1"] }],
    });

    expect(details.groups.map((group) => [group.label, group.items.length])).toEqual([
      ["中心系统", 1],
      ["人员", 1],
      ["外部系统", 1],
    ]);
    expect(details.items.find((item) => item.id === "system")?.fields).toContainEqual({ label: "来源规则", value: "不重复映射" });
    expect(details.relationships[0]).toMatchObject({
      sourceId: "customer",
      targetId: "system",
      typeLabel: "双向交互",
    });
  });

  it("exposes class attributes as detailed focus sections", () => {
    const details = buildDiagramDetailModel({
      diagramKind: "class",
      title: "领域概念模型",
      summary: "订单领域对象",
      notes: [],
      classes: [
        {
          id: "order",
          name: "Order",
          chineseName: "订单",
          englishName: "Order",
          classKind: "entity",
          attributes: [
            {
              name: "amount",
              chineseName: "订单金额",
              englishName: "amount",
              type: "decimal",
              visibility: "private",
              constraints: [],
            },
            {
              name: "createdAt",
              type: "DateTime",
              visibility: "private",
              constraints: [],
            },
          ],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    });

    const order = details.items.find((item) => item.id === "order");
    expect(order?.fields).toEqual(
      expect.arrayContaining([
        { label: "中文名称", value: "订单" },
        { label: "英文名称", value: "Order" },
        { label: "类型", value: "entity" },
        { label: "约束", value: "类别:entity" },
      ]),
    );
    expect(order?.fields.find((field) => field.label === "约束")?.value).not.toContain(
      "属性:2个",
    );
    expect(order?.sections?.[0]).toMatchObject({
      id: "order:attributes",
      title: "属性明细",
      summary: "2个",
    });
    expect(order?.sections?.[0]?.items[0]?.fields).toEqual([
      { label: "名称", value: "amount" },
      { label: "中文名称", value: "订单金额" },
      { label: "类型", value: "decimal" },
    ]);
    expect(order?.sections?.[0]?.items[1]?.fields).toEqual([
      { label: "名称", value: "createdAt" },
      { label: "中文名称", value: "未标明" },
      { label: "类型", value: "DateTime" },
    ]);
  });

  it("exposes function, architecture, and component elements", () => {
    const functionDetails = buildDiagramDetailModel({
      diagramKind: "function",
      title: "功能结构图",
      summary: "功能分解",
      notes: [],
      nodes: [
        { id: "fn_root", name: "订单管理", sourceRequirementIds: ["REQ-001"] },
        { id: "fn_create", name: "创建订单", sourceRequirementIds: ["REQ-001"] },
      ],
      relationships: [
        {
          id: "rel_fn_create",
          type: "decomposition",
          sourceId: "fn_root",
          targetId: "fn_create",
        },
      ],
    });
    expect(functionDetails.groups[0]?.kind).toBe("function");
    expect(functionDetails.relationships[0]?.typeLabel).toBe("功能分解");

    const architectureDetails = buildDiagramDetailModel({
      diagramKind: "architecture",
      title: "总体架构图",
      summary: "包图",
      notes: [],
      packages: [
        { id: "pkg_order", name: "订单包" },
      ],
      components: [
        {
          id: "cmp_order",
          name: "订单服务",
          packageId: "pkg_order",
          sourceRequirementIds: ["REQ-001"],
        },
      ],
      relationships: [
        {
          id: "rel_order",
          type: "contains",
          sourceId: "pkg_order",
          targetId: "cmp_order",
        },
      ],
    });
    expect(architectureDetails.groups.map((group) => group.kind)).toEqual([
      "package",
      "component",
    ]);
    expect(architectureDetails.relationships[0]?.typeLabel).toBe("包含");

    const componentDetails = buildDiagramDetailModel({
      diagramKind: "component",
      title: "组件关系图",
      summary: "组件接口",
      notes: [],
      components: [
        { id: "cmp_order", name: "订单组件", sourceClassIds: ["OrderService"] },
      ],
      interfaces: [
        { id: "if_order", name: "OrderApi", operationNames: ["createOrder"] },
      ],
      relationships: [
        {
          id: "rel_provide",
          type: "provided-interface",
          sourceId: "cmp_order",
          targetId: "if_order",
        },
      ],
    });
    expect(componentDetails.groups.map((group) => group.kind)).toEqual([
      "component",
      "interface",
    ]);
    expect(componentDetails.relationships[0]?.typeLabel).toBe("提供接口");
  });
});
