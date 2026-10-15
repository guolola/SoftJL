import { describe, expect, it } from "vitest";
import type {
  DesignDiagramModelSpec,
  DiagramModelSpec,
} from "@uml-platform/contracts";
import {
  pruneTraceabilityForDesignModels,
  pruneTraceabilityForRequirementModels,
} from "./traceability-pruning";

describe("traceability pruning", () => {
  it("removes requirement and design mappings that point to deleted requirement elements", () => {
    const classModel = {
      diagramKind: "class",
      classes: [{ id: "order", name: "Order", attributes: [], operations: [] }],
      interfaces: [],
      enums: [],
      relationships: [],
    } as unknown as DiagramModelSpec;
    const result = pruneTraceabilityForRequirementModels({
      models: { class: classModel },
      requirementModelTraceability: [
        {
          ruleId: "REQ-1",
          target: {
            diagramKind: "class",
            elementId: "order",
            elementKind: "class",
            label: "Order",
          },
        },
        {
          ruleId: "REQ-2",
          target: {
            diagramKind: "class",
            elementId: "customer",
            elementKind: "class",
            label: "Customer",
          },
        },
      ],
      designModelTraceability: [
        {
          source: {
            diagramKind: "class",
            modelId: "design-class",
            elementId: "order-service",
            elementKind: "class",
            label: "OrderService",
          },
          targets: [
            {
              diagramKind: "class",
              elementId: "order",
              elementKind: "class",
              label: "Order",
            },
            {
              diagramKind: "class",
              elementId: "customer",
              elementKind: "class",
              label: "Customer",
            },
          ],
        },
        {
          source: {
            diagramKind: "class",
            modelId: "design-class",
            elementId: "customer-service",
            elementKind: "class",
            label: "CustomerService",
          },
          targets: [
            {
              diagramKind: "class",
              elementId: "customer",
              elementKind: "class",
              label: "Customer",
            },
          ],
        },
      ],
    });

    expect(result.requirementModelTraceability).toHaveLength(1);
    expect(result.requirementModelTraceability[0].target.elementId).toBe(
      "order",
    );
    expect(result.designModelTraceability).toHaveLength(1);
    expect(result.designModelTraceability[0].targets).toEqual([
      expect.objectContaining({ elementId: "order" }),
    ]);
  });

  it("removes design mappings that point from deleted design elements or to deleted targets", () => {
    const requirementModel = {
      diagramKind: "class",
      classes: [{ id: "order", name: "Order", attributes: [], operations: [] }],
      interfaces: [],
      enums: [],
      relationships: [],
    } as unknown as DiagramModelSpec;
    const designModel = {
      diagramKind: "class",
      modelId: "design-class",
      classes: [
        {
          id: "order-service",
          name: "OrderService",
          attributes: [],
          operations: [],
        },
      ],
      interfaces: [],
      enums: [],
      relationships: [],
    } as unknown as DesignDiagramModelSpec;

    const result = pruneTraceabilityForDesignModels({
      models: { class: requirementModel },
      designModels: { "design-class": designModel },
      designModelTraceability: [
        {
          source: {
            diagramKind: "class",
            modelId: "design-class",
            elementId: "order-service",
            elementKind: "class",
            label: "OrderService",
          },
          targets: [
            {
              diagramKind: "class",
              elementId: "order",
              elementKind: "class",
              label: "Order",
            },
            {
              diagramKind: "class",
              elementId: "customer",
              elementKind: "class",
              label: "Customer",
            },
          ],
          upstreamDesignRefs: [
            {
              diagramKind: "class",
              modelId: "design-class",
              elementId: "deleted-helper",
              elementKind: "class",
              label: "DeletedHelper",
            },
          ],
        },
        {
          source: {
            diagramKind: "class",
            modelId: "design-class",
            elementId: "deleted-service",
            elementKind: "class",
            label: "DeletedService",
          },
          targets: [
            {
              diagramKind: "class",
              elementId: "order",
              elementKind: "class",
              label: "Order",
            },
          ],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].source.elementId).toBe("order-service");
    expect(result[0].targets).toEqual([
      expect.objectContaining({ elementId: "order" }),
    ]);
    expect(result[0].upstreamDesignRefs).toBeUndefined();
  });
});
