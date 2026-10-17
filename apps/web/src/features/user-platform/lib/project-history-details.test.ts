// Verifies business categories stay stable across internal execution stages and legacy records.
import { describe, expect, it } from "vitest";
import { getHistoryOperation } from "./project-history-details";
import type { PlatformRunSummary } from "../services/platform-api";

describe("getHistoryOperation", () => {
  it.each([
    [{ operationType: "requirement_extraction", stage: "completed" }, "rules"],
    [{ operationType: "requirement_modeling", stage: "extract_rules" }, "requirements"],
    [{ operationType: "feasibility_analysis", stage: "generate_business_flow" }, "feasibility"],
    [{ operationType: "design_modeling", stage: "verify_diagram_visual" }, "design"],
    [{ operationType: "document_generation", stage: "render_document" }, "document"],
    [{ operationType: "unknown", runKind: "requirements" }, null],
    [{ runKind: "requirements", selectedDiagrams: [], stage: "completed" }, "rules"],
    [{ runKind: "requirements", selectedDiagrams: ["usecase"], stage: "extract_rules" }, "requirements"],
    [{ runKind: "requirements", stage: "verify_diagram_visual" }, "requirements"],
    [{ runKind: "feasibility", stage: "verify_diagram_visual" }, "feasibility"],
    [{ runKind: "design", stage: "render_svg" }, "design"],
    [{ runKind: "code", stage: "generate_models" }, null],
    [{ stage: "generate_tests" }, null],
    [{ stage: "generate_business_flow" }, "feasibility"],
  ] as const)("classifies %j as %s", (fields, operation) => {
    expect(getHistoryOperation({ runId: "run", status: "failed", ...fields } as PlatformRunSummary)).toBe(operation);
  });
});
