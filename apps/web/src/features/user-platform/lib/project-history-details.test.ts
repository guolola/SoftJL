// Verifies business categories follow explicit run intent regardless of execution stage.
import { describe, expect, it } from "vitest";
import { getHistoryOperation, historyDiagramLabel, historyRetryTargets } from "./project-history-details";
import { createDesignRunSnapshot, createRunSnapshot } from "../../../test/contract-fixtures";
import type { DiagramModelSpec } from "@uml-platform/contracts";
import { i18n } from "../../../shared/i18n/i18n";
import type { PlatformRunSummary } from "../services/platform-api";

describe("getHistoryOperation", () => {
  it.each([
    [{ operationType: "requirement_extraction", stage: "completed" }, "rules"],
    [{ operationType: "requirement_modeling", stage: "extract_rules" }, "requirements"],
    [{ operationType: "feasibility_analysis", stage: "generate_business_flow" }, "feasibility"],
    [{ operationType: "design_modeling", stage: "verify_diagram_visual" }, "design"],
    [{ operationType: "document_generation", stage: "render_document" }, "document"],
    [{ operationType: "unknown", runKind: "requirements" }, null],
  ] as const)("classifies %j as %s", (fields, operation) => {
    expect(getHistoryOperation({ operationType: "unknown", runId: "run", status: "failed", ...fields } as PlatformRunSummary)).toBe(operation);
  });
});

it.each([false, true])("lists only failed use-case instances for retry (design=%s)", (design) => {
  const usecase = { diagramKind: "usecase", useCases: [{ id: "alarm", name: "报警" }, { id: "dial", name: "拨号" }] } as Extract<DiagramModelSpec, { diagramKind: "usecase" }>;
  const kind = design ? "sequence" : "analysis";
  const failure = { stage: "render_svg" as const, error: { code: "RUN_RENDER_FAILED" as const, category: "render" as const, retryable: true, message: "failed" } };
  const diagramErrors = { [`${kind}:dial`]: failure, class: { ...failure, error: { ...failure.error, retryable: false } } };
  const snapshot = design
    ? createDesignRunSnapshot({ selectedDiagrams: ["sequence", "class"], requirementModels: [usecase], diagramErrors })
    : createRunSnapshot({ selectedDiagrams: ["analysis", "class"], models: [usecase], diagramErrors });
  const run: PlatformRunSummary = { runId: "partial", status: "completed", operationType: design ? "design_modeling" : "requirement_modeling" };
  expect(historyRetryTargets(run, snapshot, i18n.t)).toEqual([`${design ? "用例实现设计" : "需求分析模型"}：拨号`]);
});

it("does not turn non-retryable diagram failures into a whole-batch retry", () => {
  const snapshot = createRunSnapshot({ selectedDiagrams: ["class"], diagramErrors: { class: {
    stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "render", message: "failed", retryable: false },
  } } });
  expect(historyRetryTargets({ runId: "failed", status: "failed", operationType: "requirement_modeling" }, snapshot, i18n.t)).toEqual([]);
});

it.each([false, true])("resolves per-use-case labels without displaying technical identifiers (design=%s)", (design) => {
  const useCase = { diagramKind: "usecase", useCases: [{ id: "UC-DIAL", name: "拨号" }] } as Extract<DiagramModelSpec, { diagramKind: "usecase" }>;
  const snapshot = design ? createDesignRunSnapshot({ requirementModels: [useCase] }) : createRunSnapshot({ models: [useCase] });
  const label = historyDiagramLabel(`${design ? "sequence" : "analysis"}:UC-DIAL`, design, i18n.t, snapshot);
  expect(label).toBe(`${design ? "用例实现设计" : "需求分析模型"}：拨号`);
  expect(historyDiagramLabel(`${design ? "sequence" : "analysis"}:missing-id`, design, i18n.t, snapshot)).not.toContain("missing-id");
});
