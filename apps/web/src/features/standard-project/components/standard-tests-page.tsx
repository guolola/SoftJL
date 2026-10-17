// Adapts ordinary saved tests to the same statistics, filters and table used by professional projects.
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import type { StandardProjectState } from "@uml-platform/contracts";
import { TestModelPage, type TestModelPageData } from "../../testing/components/test-model-page";

export function StandardTestsPage({ state, disabled, onGenerate }: { state: StandardProjectState; disabled: boolean; onGenerate: () => void }) {
  const { t } = useTranslation();
  const result = useMemo<TestModelPageData>(() => ({
    testCases: (state.tests ?? []).map(test => ({
      id: test.id, title: test.title, scenarioType: test.scenarioType, priority: test.priority,
      preconditions: test.preconditions, testData: [], expectedResults: [test.expected],
      steps: test.steps.map((action, index) => ({ order: index + 1, action, expectedResult: index === test.steps.length - 1 ? test.expected : "" })),
    })),
    coverageRelations: (state.tests ?? []).map(test => ({ testCaseId: test.id, requirementIds: [state.outline?.businesses.find(business => business.id === test.businessId)?.name ?? test.businessId],
      useCaseIds: Object.values(state.diagrams).filter(diagram => diagram.businessId === test.businessId && diagram.status === "completed").map(diagram => diagram.title),
      designModelRefs: [], coverageStatus: "pending-review", rationale: t("standardProject.testSource") })),
  }), [state.tests, state.diagrams, state.outline, t]);
  const ready = Object.values(state.diagrams).some(diagram => diagram.status === "completed");
  return <TestModelPage ordinary={{ result, onGenerate, generating: disabled, blockedReason: disabled ? t("standardProject.generationBlocked") : !ready ? t("standardProject.diagramsRequired") : null }} />;
}
