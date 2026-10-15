import assert from "node:assert/strict";
import test from "node:test";
import { assertProviderConfig, calculatePassMetrics, createEvaluationImport, loadFixtures, renderMarkdownReport, runEval, type EvalCaseResult } from "./index.js";

test("harness reports missing provider configuration outside mock mode", () => {
  assert.throws(
    () => assertProviderConfig({}),
    /UML_EVAL_PROVIDER_API_BASE_URL.*UML_EVAL_API_KEY.*UML_EVAL_MODEL/,
  );
});

test("harness loads baseline and A/B/C retest fixtures", async () => {
  const fixtures = await loadFixtures();
  assert.equal(fixtures.length, 6);
  assert.match(fixtures[0].requirementText, /订单管理系统/);
  assert.equal(
    fixtures.some(
      (fixture) =>
        fixture.id === "04-retest-a-boundary-full-chain" &&
        fixture.expectedFacts.length > 0,
    ),
    true,
  );
});

test("harness mock mode produces json and markdown reports", async () => {
  const report = await runEval({ UML_EVAL_MOCK: "1", UML_EVAL_ATTEMPTS: "5" });
  assert.equal(report.mode, "mock");
  assert.equal(report.totals.cases, 30);
  assert.equal(report.totals.completed, 30);
  assert.equal(report.totals.svgSuccessCount, 120);
  assert.equal(report.passMetrics.passAt1, 1);
  assert.equal(report.passMetrics.passAtK, 1);
  assert.equal(report.passMetrics.passPowerK, 1);
  assert.equal(report.passMetrics.bestAtK, 100);
  assert.equal(report.totals.semanticAccuracyRate, 1);
  assert.equal(report.totals.harmfulRepairCount, 0);
  assert.equal(report.totals.terminalInconsistencyCount, 0);
  assert.match(renderMarkdownReport(report), /UML 生成质量评测报告/);
  assert.match(renderMarkdownReport(report), /关键语义准确率: 100\.0%/);
  const imported = createEvaluationImport(report, "ci-123");
  assert.equal(imported.attempts.length, 30);
  assert.equal(imported.attempts[0]?.id.startsWith("ci-123:"), true);
  assert.equal(JSON.stringify(imported).includes("requirementText"), false);
});

test("Pass metrics distinguish at-1, at-k, power-k, and best-k", () => {
  const base = {
    taskType: "requirements_to_uml", status: "completed", rulesCount: 1, modelsCount: 1,
    svgSuccessCount: 1, diagramErrorCount: 0, durationMs: 1, errorMessage: null,
    semanticFactsTotal: 1, semanticFactsPreserved: 1, semanticAccuracyRate: 1,
    harmfulRepairCount: 0, unfoundedAdditionCount: 0, effectiveTraceCovered: 1,
    effectiveTraceTotal: 1, effectiveTraceCoverageRate: 1, terminalStateConsistent: true,
    prototypeBuildPassed: null, documentUsable: null,
  } satisfies Omit<EvalCaseResult, "fixtureId" | "attempt" | "qualityScore" | "automaticVerdict">;
  const results: EvalCaseResult[] = [
    { ...base, fixtureId: "a", attempt: 1, qualityScore: 40, automaticVerdict: "fail" },
    { ...base, fixtureId: "a", attempt: 2, qualityScore: 90, automaticVerdict: "pass" },
    { ...base, fixtureId: "b", attempt: 1, qualityScore: 80, automaticVerdict: "pass" },
    { ...base, fixtureId: "b", attempt: 2, qualityScore: 85, automaticVerdict: "pass" },
  ];
  assert.deepEqual(calculatePassMetrics(results, 2), {
    fixtureCount: 2, attemptCount: 4, k: 2, passAt1: 0.5, passAtK: 1,
    passPowerK: 0.5, bestAtK: 87.5,
  });
});
