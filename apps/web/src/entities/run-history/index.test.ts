// Verifies run history labels and summaries shown across generation history surfaces.
import { describe, expect, it } from "vitest";
import type {  RunSnapshot } from "@uml-platform/contracts";
import { getRunHistorySnapshotSummary } from "./index";



describe("getRunHistorySnapshotSummary", () => {
  

  

  it("summarizes failed rules-only snapshots as rule extraction failures", () => {
    const snapshot: RunSnapshot = {
      runId: "run-rules-failed",
      requirementText: "订单系统需求",
      selectedDiagrams: [],
      analysisTargetUseCaseIds: [],
      rules: [],
      requirementBaseline: null,
      coverageMatrix: null,
      traceabilityMatrix: null,
      models: [],
      requirementModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      requirementTrace: [],
      currentStage: "extract_rules",
      status: "failed",
      error: {
        code: "RUN_STRUCTURED_OUTPUT_INVALID",
        message: "rules 必须是数组",
        category: "generation",
        retryable: true,
      },
    };

    expect(getRunHistorySnapshotSummary(snapshot)).toBe(
      "需求规则抽取失败：模型返回的结构化结果不合法，请重试。",
    );
  });

  it("explains analysis-only runs with automatically generated usecase dependencies", () => {
    const snapshot: RunSnapshot = {
      runId: "run-analysis-dependency",
      requirementText: "订单系统需求",
      selectedDiagrams: ["usecase", "analysis"],
      requestedDiagrams: ["analysis"],
      dependencyDiagrams: ["usecase"],
      analysisTargetUseCaseIds: [],
      rules: [],
      requirementBaseline: null,
      coverageMatrix: null,
      traceabilityMatrix: null,
      models: [],
      requirementModelTraceability: [],
      plantUml: [],
      svgArtifacts: [],
      diagramErrors: {},
      requirementTrace: [],
      currentStage: null,
      status: "completed",
      error: null,
    };

    expect(getRunHistorySnapshotSummary(snapshot)).toBe(
      "请求需求分析模型，自动补齐用例模型",
    );
  });
});
