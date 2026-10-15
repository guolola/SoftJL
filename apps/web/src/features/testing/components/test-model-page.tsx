// Builds black-box test cases and coverage links from requirement and design models.
import { Card } from "../../../shared/ui/card";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { PageContainer, PageHeader } from "../../../shared/template/layout/page";
import type { TFunction } from "i18next";
import { Filter, Play, ShieldCheck } from "lucide-react";
import type {
  BlackBoxTestCase,
  DesignDiagramModelSpec,
  ModelElementRef,
  RequirementModelTraceabilityEntry,
  RequirementRule,
  TestCoverageRelation,
  TestGenerationResult,
  TestScenarioType,
  UseCaseDiagramSpec,
  UseCaseEventFlow,
} from "@uml-platform/contracts";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { SelectControl } from "../../../shared/ui/select";
import { StudioDataTable } from "../../../shared/ui/studio-data-table";
import {
  FeedbackReopenButton,
  useFeedbackDialog,
  type FeedbackDialogState,
} from "../../../shared/ui/feedback-dialog";
import { cn } from "../../../shared/ui/utils";
import { categoryChipTone } from "../../../shared/ui/category-tones";
import { useWorkspaceShell } from "../../workspace-shell/state";
import { useWorkspaceSession } from "../../workspace-session/state";
import { findRequirementModelByKind } from "../../../entities/diagram/model";

const SCENARIO_TYPES: Array<TestScenarioType | "all"> = [
  "all", "normal", "alternative", "exception", "boundary", "decision-table",
];

type SequenceDesignModel = DesignDiagramModelSpec & {
  diagramKind: "sequence";
  modelId?: string;
  sourceUseCaseId?: string;
  participants: Array<{ id: string; name: string }>;
  messages: Array<{ id: string; name: string }>;
};

function isSequenceDesignModel(
  model: DesignDiagramModelSpec,
): model is SequenceDesignModel {
  return model.diagramKind === "sequence";
}

function formatRuleId(id: string) {
  const match = /^r(\d+)$/i.exec(id.trim());
  return match ? `R${match[1]}` : id.toUpperCase();
}

function priorityForRule(rule?: RequirementRule) {
  if (!rule) return "P2" as const;
  if (rule.category === "异常处理" || rule.category === "业务规则") return "P1" as const;
  if (rule.category === "功能需求" || rule.category === "数据需求") return "P2" as const;
  return "P3" as const;
}

function scenarioFromFlow(flow: UseCaseEventFlow): TestScenarioType {
  if (flow.flowType === "main") return "normal";
  if (flow.flowType === "alternative") return "alternative";
  return "exception";
}

function isTrustedRequirementTrace(entry: RequirementModelTraceabilityEntry) {
  return (
    entry.mappingSource !== "auto-filled-pending-review" &&
    entry.reviewStatus !== "pending" &&
    entry.confidence !== "low"
  );
}

function rulesForUseCase(
  rules: RequirementRule[],
  useCase: UseCaseDiagramSpec["useCases"][number],
  traceability: RequirementModelTraceabilityEntry[],
) {
  const haystack = `${useCase.name} ${useCase.goal} ${useCase.description ?? ""}`;
  const directlyReferencedRuleIds = new Set(
    (useCase.eventFlows ?? []).flatMap((flow) =>
      flow.steps.flatMap((step) => step.sourceRequirementId ?? []),
    ),
  );
  const trustedRuleIds = new Set(
    traceability
      .filter(
        (entry) =>
          isTrustedRequirementTrace(entry) &&
          entry.target.diagramKind === "usecase" &&
          entry.target.elementId === useCase.id,
      )
      .map((entry) => entry.ruleId),
  );
  return rules.filter((rule) => {
    if (directlyReferencedRuleIds.has(rule.id) || trustedRuleIds.has(rule.id)) return true;
    return rule.text.includes(useCase.name) || haystack.includes(rule.text);
  });
}

function refsForUseCaseDesign(
  designModels: DesignDiagramModelSpec[],
  useCaseId: string,
): ModelElementRef[] {
  return designModels
    .filter(
      (model): model is SequenceDesignModel =>
        isSequenceDesignModel(model) && model.sourceUseCaseId === useCaseId,
    )
    .flatMap((model) => {
      const modelId = model.modelId ?? `sequence:${useCaseId}`;
      return [
        ...model.participants.map((participant) => ({
          modelId,
          diagramKind: model.diagramKind,
          elementId: participant.id,
          elementKind: "participant",
          label: participant.name,
        })),
        ...model.messages.map((message) => ({
          modelId,
          diagramKind: model.diagramKind,
          elementId: message.id,
          elementKind: "message",
          label: message.name,
        })),
      ] satisfies ModelElementRef[];
    });
}

function fallbackFlow(useCase: UseCaseDiagramSpec["useCases"][number]): UseCaseEventFlow {
  return {
    id: `${useCase.id}:main`,
    name: "主事件流",
    flowType: "main",
    steps: [
      {
        order: 1,
        actor: "actor",
        actorAction: useCase.goal,
        systemAction: useCase.postconditions[0] ?? "系统完成用例目标",
        expectedResult: useCase.postconditions[0] ?? useCase.goal,
      },
    ],
  };
}

function buildTestSteps(flow: UseCaseEventFlow, useCase: UseCaseDiagramSpec["useCases"][number]) {
  const steps = flow.steps.length > 0 ? flow.steps : fallbackFlow(useCase).steps;
  return steps.map((step, index) => ({
    order: index + 1,
    action: step.actorAction ?? step.systemAction ?? `${useCase.name} 第 ${index + 1} 步`,
    expectedResult:
      step.expectedResult ??
      step.systemAction ??
      useCase.postconditions[index] ??
      "系统状态和反馈符合预期",
  }));
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function generateBlackBoxTests(
  rules: RequirementRule[],
  useCaseModel: UseCaseDiagramSpec,
  designModels: DesignDiagramModelSpec[],
  traceability: RequirementModelTraceabilityEntry[],
  t: TFunction,
): TestGenerationResult {
  const testCases: BlackBoxTestCase[] = [];
  const coverageRelations: TestCoverageRelation[] = [];

  for (const useCase of useCaseModel.useCases) {
    const matchedRules = rulesForUseCase(rules, useCase, traceability);
    const flows =
      (useCase.eventFlows?.length ?? 0) > 0 ? useCase.eventFlows : [fallbackFlow(useCase)];
    const designRefs = refsForUseCaseDesign(designModels, useCase.id);

    flows.forEach((flow, flowIndex) => {
      const sourceRule =
        matchedRules.find((rule) =>
          flow.steps.some((step) => step.sourceRequirementId === rule.id),
        ) ?? matchedRules[flowIndex % Math.max(1, matchedRules.length)];
      const testCase: BlackBoxTestCase = {
        id: `tc-${useCase.id}-${flow.id}`.replace(/[^A-Za-z0-9_-]/g, "-"),
        title: `${useCase.name} - ${t(`testingPage.scenarios.${scenarioFromFlow(flow).replace("-", "_")}`)} - ${flow.name}`,
        sourceRequirementId: sourceRule?.id,
        sourceRequirementText: sourceRule?.text,
        sourceUseCaseId: useCase.id,
        sourceUseCaseName: useCase.name,
        scenarioType: scenarioFromFlow(flow),
        priority: priorityForRule(sourceRule),
        preconditions: useCase.preconditions,
        testData: uniqueStrings([
          flow.condition,
          flow.trigger,
          sourceRule?.category === "数据需求" ? sourceRule.text : undefined,
        ]),
        steps: buildTestSteps(flow, useCase),
        expectedResults: uniqueStrings([
          ...flow.steps.map((step) => step.expectedResult),
          ...useCase.postconditions,
        ]),
      };
      testCases.push(testCase);
      coverageRelations.push({
        testCaseId: testCase.id,
        requirementIds: uniqueStrings([
          sourceRule?.id,
          ...flow.steps.map((step) => step.sourceRequirementId),
        ]),
        useCaseIds: [useCase.id],
        designModelRefs: designRefs,
        coverageStatus: sourceRule || designRefs.length > 0 ? "covered" : "partially-covered",
        rationale: "由用例事件流、确认需求和用例实现设计自动生成覆盖关系",
      });
    });

    const boundaryRule = matchedRules.find((rule) =>
      ["数据需求", "业务规则", "异常处理"].includes(rule.category),
    );
    if (boundaryRule) {
      const testCase: BlackBoxTestCase = {
        id: `tc-${useCase.id}-boundary`,
        title: `${useCase.name} - 边界值 - ${formatRuleId(boundaryRule.id)}`,
        sourceRequirementId: boundaryRule.id,
        sourceRequirementText: boundaryRule.text,
        sourceUseCaseId: useCase.id,
        sourceUseCaseName: useCase.name,
        scenarioType: "boundary",
        priority: priorityForRule(boundaryRule),
        preconditions: useCase.preconditions,
        testData: [`最小值/最大值/空值/重复值覆盖：${boundaryRule.text}`],
        steps: [
          {
            order: 1,
            action: `按边界条件执行：${useCase.name}`,
            expectedResult: "系统接受合法边界并拒绝非法边界，提示语准确",
          },
        ],
        expectedResults: ["业务规则、数据约束和异常反馈均符合需求"],
      };
      testCases.push(testCase);
      coverageRelations.push({
        testCaseId: testCase.id,
        requirementIds: [boundaryRule.id],
        useCaseIds: [useCase.id],
        designModelRefs: refsForUseCaseDesign(designModels, useCase.id),
        coverageStatus: "covered",
        rationale: "由规则类别和用例前后置条件生成边界值覆盖",
      });
    }
  }

  const coveredRuleIds = new Set(
    coverageRelations.flatMap((relation) => relation.requirementIds),
  );
  for (const rule of rules.filter((candidate) => !coveredRuleIds.has(candidate.id))) {
    const isBoundaryRule = ["数据需求", "业务规则", "异常处理"].includes(rule.category);
    const testCase: BlackBoxTestCase = {
      id: `tc-requirement-${rule.id}`.replace(/[^A-Za-z0-9_-]/g, "-"),
      title: `${formatRuleId(rule.id)} - 需求级验证`,
      sourceRequirementId: rule.id,
      sourceRequirementText: rule.text,
      scenarioType: isBoundaryRule ? "boundary" : "normal",
      priority: priorityForRule(rule),
      preconditions: [],
      testData: uniqueStrings([rule.sourceFragment, rule.text]),
      steps: [
        {
          order: 1,
          action: `按需求原文执行并核对：${rule.text}`,
          expectedResult: `可观察结果完整满足 ${formatRuleId(rule.id)}，且不引入原文之外的条件`,
        },
      ],
      expectedResults: [`需求原文“${rule.text}”中的条件、角色、状态和约束均得到验证`],
    };
    testCases.push(testCase);
    coverageRelations.push({
      testCaseId: testCase.id,
      requirementIds: [rule.id],
      useCaseIds: [],
      designModelRefs: [],
      coverageStatus: "covered",
      rationale: "未伪造用例或设计映射；由确认需求原文生成独立、可核验的需求级测试",
    });
  }

  return { testCases, coverageRelations };
}

export function TestModelPage() {
  const { t } = useTranslation();
  const {
    rules,
    models,
    designModels,
    requirementModelTraceability,
    testGenerationResult: result,
    updateTestGenerationResult,
    rulesVersion,
    workspaceInitialized,
  } = useWorkspaceSession();
  const { openRequirementsText, openSystemRequirements } = useWorkspaceShell();
  const { openFeedback, openFeedbackOnce } = useFeedbackDialog();
  const [scenarioFilter, setScenarioFilter] = useState<TestScenarioType | "all">("all");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  // Generated models are stored by modelId, which may differ from their diagram kind.
  const useCaseModel = findRequirementModelByKind(models, "usecase");
  const blockedReason =
    !useCaseModel || !("useCases" in useCaseModel) || useCaseModel.useCases.length === 0
      ? t("testingPage.blocked.usecase")
      : rules.length === 0
        ? t("testingPage.blocked.rules")
        : null;
  const blockedByUseCase = Boolean(blockedReason) && blockedReason === t("testingPage.blocked.usecase");
  const blockFeedback = useMemo<FeedbackDialogState | null>(() => {
    if (!workspaceInitialized || !blockedReason) return null;
    return {
      dedupeKey: blockedByUseCase
        ? "test-generation:usecase"
        : "test-generation:requirements",
      revision: `${rulesVersion}:${blockedReason}`,
      tone: "warning",
      title: t("testingPage.guidance.title"),
      message: blockedReason,
      primaryAction: blockedByUseCase
        ? {
            label: t("feedback.actions.requirementModels"),
            onSelect: openRequirementsText,
          }
        : {
            label: t("feedback.actions.systemRequirements"),
            onSelect: openSystemRequirements,
          },
      keepReopenEntry: true,
    };
  }, [
    blockedByUseCase,
    blockedReason,
    openRequirementsText,
    openSystemRequirements,
    rulesVersion,
    t,
    workspaceInitialized,
  ]);

  useEffect(() => {
    if (blockFeedback && result?.testCases.length) openFeedbackOnce(blockFeedback);
  }, [blockFeedback, openFeedbackOnce, result]);

  const filteredCases = useMemo(() => {
    const cases = result?.testCases ?? [];
    return scenarioFilter === "all"
      ? cases
      : cases.filter((testCase) => testCase.scenarioType === scenarioFilter);
  }, [result, scenarioFilter]);

  const coverageByCase = useMemo(() => {
    return new Map((result?.coverageRelations ?? []).map((item) => [item.testCaseId, item]));
  }, [result?.coverageRelations]);

  useEffect(() => {
    setPagination(current => ({ ...current, pageIndex: 0 }));
  }, [result, scenarioFilter]);

  const testColumns = useMemo<ColumnDef<BlackBoxTestCase>[]>(() => [
    {
      accessorKey: "title",
      header: t("testingPage.columns.case"),
      size: 260,
      cell: ({ row }) => (
        <div className="min-w-56 max-w-80 whitespace-normal">
          <div className="font-semibold text-foreground">{row.original.title}</div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">{row.original.id}</div>
        </div>
      ),
    },
    {
      accessorKey: "scenarioType",
      header: t("testingPage.columns.scenario"),
      size: 140,
      cell: ({ row }) => <Badge variant="outline" className={categoryChipTone(SCENARIO_TYPES.indexOf(row.original.scenarioType) - 1)}>{t(`testingPage.scenarios.${row.original.scenarioType.replace("-", "_")}`)}</Badge>,
    },
    {
      id: "steps",
      header: t("testingPage.columns.steps"),
      size: 330,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-72 max-w-[34rem] space-y-2 whitespace-normal">
          {row.original.steps.slice(0, 3).map(step => (
            <div key={step.order} className="rounded-md bg-muted/40 px-3 py-2">
              <div className="text-xs font-medium text-foreground">{step.order}. {step.action}</div>
              <div className="mt-1 text-xs text-muted-foreground">{step.expectedResult}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "coverage",
      header: t("testingPage.columns.coverage"),
      size: 210,
      enableSorting: false,
      cell: ({ row }) => {
        const coverage = coverageByCase.get(row.original.id);
        return (
          <div className="flex min-w-40 max-w-64 flex-wrap gap-1 whitespace-normal">
            {(coverage?.requirementIds ?? []).map(id => <Badge key={id} variant="outline" className="text-[10px]">{formatRuleId(id)}</Badge>)}
            {(coverage?.useCaseIds ?? []).map(id => <Badge key={id} variant="secondary" className="text-[10px]">{id}</Badge>)}
          </div>
        );
      },
    },
    {
      accessorKey: "priority",
      header: t("testingPage.columns.priority"),
      size: 100,
      cell: ({ row }) => (
        <span className={cn(
          "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
          row.original.priority === "P0" ? "bg-destructive/10 text-destructive"
            : row.original.priority === "P1" ? "bg-warning/10 text-warning"
              : row.original.priority === "P2" ? "bg-info/10 text-info"
                : "bg-muted text-muted-foreground",
        )}>{row.original.priority}</span>
      ),
    },
  ], [coverageByCase, t]);

  const coveredRequirements = new Set(
    (result?.coverageRelations ?? []).flatMap((item) => item.requirementIds),
  );
  const coveredUseCases = new Set(
    (result?.coverageRelations ?? []).flatMap((item) => item.useCaseIds),
  );

  return (
    <PageContainer className="flex min-h-full flex-col">
      <div className="flex w-full flex-col gap-5">
          <PageHeader
            title={t("testingPage.title")}
            description={t("testingPage.description")}
            notice={blockFeedback?.keepReopenEntry ? (
              <FeedbackReopenButton feedback={blockFeedback} />
            ) : null}
            actions={
              <Button
                type="button"
                className="shrink-0 gap-2"
                disabled={Boolean(blockedReason)}
                onClick={async () => {
                  if (!useCaseModel || !("useCases" in useCaseModel)) return;
                  try {
                    const nextResult = generateBlackBoxTests(
                      rules,
                      useCaseModel,
                      Object.values(designModels),
                      requirementModelTraceability,
                      t,
                    );
                    await updateTestGenerationResult(nextResult);
                    openFeedback({
                      dedupeKey: "testing:generation:completed",
                      revision: rulesVersion,
                      tone: "success",
                      title: t("testingPage.feedback.successTitle"),
                      message: t("testingPage.feedback.successMessage", {
                        count: nextResult.testCases.length,
                      }),
                    });
                  } catch {
                    openFeedback({
                      dedupeKey: "testing:generation:failed",
                      revision: rulesVersion,
                      tone: "destructive",
                      title: t("testingPage.feedback.failureTitle"),
                      message: t("testingPage.feedback.failureMessage"),
                    });
                  }
                }}
              >
                <Play className="size-4" />
                {t("testingPage.generate")}
              </Button>
            }
          />

          <div
            data-testid="test-summary-grid"
            className="grid w-full grid-cols-2 gap-3 lg:gap-6 xl:grid-cols-4"
          >
            {[
              [t("testingPage.summary.cases"), result?.testCases.length ?? 0],
              [t("testingPage.summary.requirements"), coveredRequirements.size],
              [t("testingPage.summary.usecases"), coveredUseCases.size],
              [t("testingPage.summary.relations"), result?.coverageRelations.length ?? 0],
            ].map(([label, value]) => (
              <Card key={label} className="gap-0 py-0 min-w-0 p-4">
                <div className="truncate text-sm text-muted-foreground">
                  {label}
                </div>
                <div className="mt-1 text-lg font-semibold leading-6 text-foreground">
                  {value}
                </div>
              </Card>
            ))}
          </div>

          <StudioDataTable
            columns={testColumns}
            data={filteredCases}
            getRowId={testCase => testCase.id}
            pagination={pagination}
            onPaginationChange={setPagination}
            pageSizeOptions={[10, 25, 50]}
            tableClassName="min-w-[1040px]"
            emptyState={t("testingPage.empty")}
            footerLabel={t("testingPage.pagination.itemLabel", { defaultValue: "个测试用例" })}
            toolbarLeading={
              <div className="flex shrink-0 items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">{t("testingPage.blackBox")}</h3>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {filteredCases.length}
                </Badge>
              </div>
            }
            filters={
              <label className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:gap-2">
                <Filter className="size-3.5" />
                <SelectControl
                  aria-label={t("testingPage.filterAria")}
                  value={scenarioFilter}
                  onValueChange={(value) => {
                    setScenarioFilter(value as TestScenarioType | "all");
                    setPagination((current) => ({ ...current, pageIndex: 0 }));
                  }}
                  className="h-8 w-36 shrink-0 text-sm"
                  size="sm"
                  options={SCENARIO_TYPES.map((value) => ({ value, label: t(`testingPage.scenarios.${value.replace("-", "_")}`) }))}
                />
              </label>
            }
          />
      </div>
    </PageContainer>
  );
}
