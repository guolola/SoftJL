// Verifies workspace snapshot merge rules that are shared by repository implementations.
import { describe, expect, it } from "vitest";
import type {
  AtomicRequirement,
  
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  DiagramModelSpec,
  RequirementBaseline,
  RunSnapshot,
} from "@uml-platform/contracts";
import type { RequirementRule } from "../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../entities/workspace/model";
import { snapshotInputFingerprint } from "../../shared/lib/fingerprint";
import {
  applySnapshotToWorkspace,
  createEmptyWorkspace,
} from "./workspace-state";

function createRule(id: string, text = `${id} 需求规则。`): RequirementRule {
  return {
    id,
    category: "业务规则",
    text,
    relatedDiagrams: ["usecase"],
  };
}

function createAtomicRequirement(
  overrides: Partial<AtomicRequirement> = {},
): AtomicRequirement {
  return {
    id: "REQ-001",
    sourceRuleId: "r1",
    sourceFragment: "用户通过邮箱注册账号。",
    sourceLocation: { section: "input", startOffset: 0, endOffset: 10 },
    type: "functional",
    actor: "用户",
    subject: "用户",
    action: "注册",
    object: "账号",
    condition: null,
    outcome: "系统创建账号",
    confidence: 0.86,
    status: "accepted",
    criticality: "high",
    acceptanceCriteria: ["用户提交邮箱后系统创建账号。"],
    priority: "must",
    fieldProvenance: {},
    ...overrides,
  };
}

function createBaseline(
  requirements: AtomicRequirement[],
  overrides: Partial<RequirementBaseline> = {},
): RequirementBaseline {
  return {
    runId: "run-baseline",
    sourceDocumentId: "inline-requirement",
    createdAt: "2026-06-18T00:00:00.000Z",
    assumptions: [],
    conflicts: [],
    requirements,
    qualityReport: {
      runId: "run-baseline",
      status: "passed",
      summary: "需求规则已确认。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    ...overrides,
  };
}

function useCaseModel(): DiagramModelSpec {
  return {
    diagramKind: "usecase",
    title: "需求用例模型",
    summary: "根据需求规则生成。",
    notes: [],
    actors: [],
    useCases: [],
    systemBoundaries: [],
    relationships: [],
  } as DiagramModelSpec;
}

function createSnapshot(
  overrides: Partial<RunSnapshot>,
): RunSnapshot {
  return {
    runId: "run-snapshot",
    requirementText: "",
    selectedDiagrams: ["usecase"],
    analysisTargetUseCaseIds: [],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    models: [useCaseModel()],
    requirementModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    requirementTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
    ...overrides,
  };
}

function createDesignSnapshot(
  overrides: Partial<DesignRunSnapshot>,
): DesignRunSnapshot {
  return {
    runId: "design-run-snapshot",
    requirementText: "图书馆管理系统",
    selectedDiagrams: ["table", "component"],
    requestedDiagrams: ["table", "component"],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    requirementModels: [],
    requirementModelTraceability: [],
    models: [],
    designModelTraceability: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {},
    designTrace: [],
    currentStage: "render_svg",
    status: "completed",
    error: null,
    ...overrides,
  };
}



function tableDesignModel(): DesignDiagramModelSpec {
  return {
    diagramKind: "table",
    title: "数据库设计",
    summary: "用户表。",
    notes: [],
    tables: [
      {
        id: "users",
        name: "users",
        constraints: [],
        relationalConstraints: [{ id: "pk_users", type: "primary-key", columnIds: ["id"] }],
        columns: [
          {
            id: "id",
            name: "id",
            dataType: "VARCHAR",
            constraints: [],
            isPrimaryKey: true,
            isForeignKey: false,
            nullable: false,
          },
        ],
      },
    ],
    relationships: [],
  };
}

function createPendingCandidate(
  requirement: AtomicRequirement,
): WorkspaceRecord["requirementReviewCandidates"][string] {
  return {
    ruleId: requirement.sourceRuleId ?? "r1",
    beforeRequirement: requirement,
    afterRequirement: {
      ...requirement,
      status: "accepted",
    },
    repairRationale: "补齐缺失字段。",
    blockingReasons: [],
    status: "pending",
    errorMessage: null,
    createdAt: "2026-06-18T00:00:00.000Z",
  };
}

describe("applySnapshotToWorkspace", () => {
  it.each(["requirements", "design"])("replaces custom-ID sources with their models during %s snapshot recovery", (stage) => {
    const design = stage === "design";
    const oldModel = { ...(design ? tableDesignModel() : useCaseModel()), modelId: "custom-old" };
    const newModel = { ...oldModel, modelId: "custom-new" };
    const workspace = createEmptyWorkspace();
    const modelField = design ? "designModels" : "models";
    const sourceField = design ? "designPlantUml" : "plantUml";
    const errorField = design ? "designDiagramErrors" : "diagramErrors";
    Object.assign(workspace, {
      [modelField]: { "custom-old": oldModel },
      [sourceField]: { "custom-old": "old-source", unrelated: "keep-source" },
      [errorField]: { "custom-old": { stage: "render_svg", error: { code: "RUN_RENDER_FAILED", category: "internal", message: "old-error", retryable: true } } },
    });
    const snapshot = design
      ? createDesignSnapshot({ selectedDiagrams: ["table"], requestedDiagrams: ["table"], models: [newModel as DesignDiagramModelSpec], plantUml: [{ diagramKind: "table", modelId: "custom-new", source: "new-source" }] })
      : createSnapshot({ models: [newModel as DiagramModelSpec], plantUml: [{ diagramKind: "usecase", modelId: "custom-new", source: "new-source" }] });
    const merged = applySnapshotToWorkspace(workspace, snapshot);
    expect(merged[modelField]).not.toHaveProperty("custom-old");
    expect(merged[sourceField]).toEqual({ "custom-new": "new-source", unrelated: "keep-source" });
    expect(merged[errorField]).not.toHaveProperty("custom-old");
  });

  it("keeps requirement run targets out of workspace draft selection", () => {
    const workspace: WorkspaceRecord = {
      ...createEmptyWorkspace(),
      selectedDiagramTypes: ["class" as const],
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createSnapshot({
        selectedDiagrams: ["usecase"],
        models: [useCaseModel()],
        plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
      }),
    );

    expect(merged.selectedDiagramTypes).toEqual([]);
    expect(merged.generatedDiagramTypes).toEqual(["usecase"]);
  });

  it("stores snapshot input fingerprints for requirement diagrams restored after current input changed", () => {
    const rulesV1 = [createRule("r1", "用户可以查看座位。")];
    const rulesV2 = [createRule("r1", "用户可以查看并筛选座位。")];
    const snapshotFingerprint = snapshotInputFingerprint({
      requirementText: "座位预约系统 v1",
      rules: rulesV1,
    });
    const workspaceFingerprint = snapshotInputFingerprint({
      requirementText: "座位预约系统 v2",
      rules: rulesV2,
    });

    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText: "座位预约系统 v2",
        rules: rulesV2,
        requirementInputFingerprint: workspaceFingerprint,
        rulesVersion: 2,
      },
      createSnapshot({
        runId: "run-v1-usecase",
        requirementText: "座位预约系统 v1",
        rules: rulesV1,
        selectedDiagrams: ["usecase"],
        models: [useCaseModel()],
        plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
      }),
    );

    expect(merged.requirementText).toBe("座位预约系统 v2");
    expect(merged.rules).toEqual(rulesV2);
    expect(merged.requirementInputFingerprint).toBe(workspaceFingerprint);
    expect(merged.diagramInputFingerprints.usecase).toBe(snapshotFingerprint);
    expect(merged.generatedDiagramTypes).toEqual(["usecase"]);
  });

  it("keeps design run targets out of workspace draft selection", () => {
    const workspace: WorkspaceRecord = {
      ...createEmptyWorkspace(),
      selectedDiagramTypes: ["class" as const],
      selectedDesignDiagramTypes: ["table" as const],
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createDesignSnapshot({
        selectedDiagrams: ["table", "component"],
        requestedDiagrams: ["component"],
        models: [tableDesignModel()],
        plantUml: [
          { diagramKind: "table", modelId: "table", source: "@startuml\n@enduml" },
        ],
      }),
    );

    expect(merged.selectedDiagramTypes).toEqual([]);
    expect(merged.selectedDesignDiagramTypes).toEqual([]);
    expect(merged.generatedDesignDiagramTypes).toEqual([]);
  });

  it("does not rewrite requirement model fingerprints from design snapshots without requirement input", () => {
    const requirementText = "用户可以查看座位。";
    const rules = [createRule("r1", "用户可以查看座位。")];
    const currentFingerprint = snapshotInputFingerprint({
      requirementText,
      rules,
    });
    const existingUseCaseModel = useCaseModel();
    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText,
        rules,
        requirementInputFingerprint: currentFingerprint,
        rulesVersion: 3,
        rulesBasedOnTextVersion: 1,
        models: { usecase: existingUseCaseModel },
        generatedDiagramTypes: ["usecase"],
        diagramInputFingerprints: { usecase: currentFingerprint },
        diagramVersions: { usecase: 3 },
      },
      createDesignSnapshot({
        requirementText: "",
        rules: [],
        requirementModels: [
          {
            ...useCaseModel(),
            title: "空输入设计快照中的旧用例模型",
          },
        ],
        models: [tableDesignModel()],
        plantUml: [
          { diagramKind: "table", modelId: "table", source: "@startuml\n@enduml" },
        ],
      }),
    );

    expect(merged.requirementInputFingerprint).toBe(currentFingerprint);
    expect(merged.rulesVersion).toBe(3);
    expect(merged.rulesBasedOnTextVersion).toBe(1);
    expect(merged.diagramInputFingerprints.usecase).toBe(currentFingerprint);
    expect(merged.diagramVersions.usecase).toBe(3);
    expect(merged.models.usecase).toEqual(existingUseCaseModel);
    expect(merged.generatedDiagramTypes).toEqual(["usecase"]);
    expect(merged.generatedDesignDiagramTypes).toEqual([]);
  });

  

  

  

  

  it("applies requirement baseline from model snapshots when requirement input matches", () => {
    const requirementText = "用户通过邮箱注册账号，联系方式在认领通过前隐藏。";
    const rules = [
      createRule("r1", "用户通过邮箱注册账号。"),
      createRule("r6", "联系方式在认领通过前隐藏。"),
    ];
    const pendingRequirement = createAtomicRequirement({
      id: "REQ-006",
      sourceRuleId: "r6",
      sourceFragment: "联系方式在认领通过前隐藏。",
      actor: null,
      status: "pending-review",
    });
    const pendingBaseline = createBaseline([pendingRequirement], {
      runId: "run-pending-baseline",
      qualityReport: {
        runId: "run-pending-baseline",
        status: "pending-review",
        summary: "发现 1 个需求质量提示。",
        issues: [
          {
            id: "ISS-006",
            code: "missing-actor",
            message: "REQ-006 缺少明确角色/执行者。",
            severity: "warning",
            requirementId: "REQ-006",
            blocksDownstream: false,
          },
        ],
        blockingIssueIds: [],
        reviewRequiredRequirementIds: ["REQ-006"],
      },
    });
    const workspace = {
      ...createEmptyWorkspace(),
      requirementText,
      rules,
      requirementBaseline: createBaseline([
        createAtomicRequirement({
          id: "REQ-006",
          sourceRuleId: "r6",
          status: "accepted",
        }),
      ]),
      requirementQualityReport: createBaseline([]).qualityReport,
      requirementReviewCandidates: {
        r6: createPendingCandidate(pendingRequirement),
      },
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createSnapshot({
        runId: "run-pending-baseline",
        requirementText,
        rules,
        requirementBaseline: pendingBaseline,
      }),
    );

    expect(merged.requirementBaseline?.qualityReport.status).toBe(
      "pending-review",
    );
    expect(
      merged.requirementBaseline?.qualityReport.reviewRequiredRequirementIds,
    ).toEqual(["REQ-006"]);
    expect(merged.requirementReviewCandidates.r6?.status).toBe("pending");
  });

  it("keeps accepted review candidates over older pending snapshot baselines", () => {
    const requirementText = "用户通过邮箱注册账号，联系方式在认领通过前隐藏。";
    const rules = [
      createRule("r1", "用户通过邮箱注册账号。"),
      createRule("r6", "联系方式在认领通过前隐藏。"),
    ];
    const pendingRequirement = createAtomicRequirement({
      id: "REQ-006",
      sourceRuleId: "r6",
      sourceFragment: "联系方式在认领通过前隐藏。",
      actor: null,
      status: "pending-review",
    });
    const acceptedRequirement = createAtomicRequirement({
      id: "REQ-006",
      sourceRuleId: "r6",
      sourceFragment: "联系方式在认领通过前隐藏。",
      actor: "认领用户",
      status: "accepted",
    });
    const pendingBaseline = createBaseline([pendingRequirement], {
      runId: "run-pending-baseline",
      qualityReport: {
        runId: "run-pending-baseline",
        status: "pending-review",
        summary: "发现 1 个需求质量提示。",
        issues: [
          {
            id: "ISS-006",
            code: "missing-actor",
            message: "REQ-006 缺少明确角色/执行者。",
            severity: "warning",
            requirementId: "REQ-006",
            blocksDownstream: false,
          },
        ],
        blockingIssueIds: [],
        reviewRequiredRequirementIds: ["REQ-006"],
      },
    });

    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText,
        rules,
        requirementReviewCandidates: {
          r6: {
            ...createPendingCandidate(pendingRequirement),
            afterRequirement: acceptedRequirement,
            status: "accepted",
          },
        },
      },
      createSnapshot({
        runId: "run-pending-baseline",
        requirementText,
        rules,
        requirementBaseline: pendingBaseline,
      }),
    );

    expect(merged.requirementBaseline?.requirements[0]?.status).toBe("accepted");
    expect(merged.requirementBaseline?.requirements[0]?.actor).toBe("认领用户");
    expect(merged.requirementBaseline?.qualityReport.status).toBe("passed");
    expect(merged.requirementBaseline?.qualityReport.issues).toEqual([]);
    expect(
      merged.requirementBaseline?.qualityReport.reviewRequiredRequirementIds,
    ).toEqual([]);
    expect(merged.requirementReviewCandidates.r6?.status).toBe("accepted");
  });

  it("drops stale pending candidates when the new baseline has passed", () => {
    const requirementText = "用户通过邮箱注册账号。";
    const rules = [createRule("r1", "用户通过邮箱注册账号。")];
    const requirement = createAtomicRequirement({
      id: "REQ-001",
      sourceRuleId: "r1",
      status: "accepted",
    });
    const passedBaseline = createBaseline([requirement]);
    const workspace = {
      ...createEmptyWorkspace(),
      requirementText,
      rules,
      requirementBaseline: createBaseline([
        {
          ...requirement,
          status: "pending-review",
        },
      ]),
      requirementQualityReport: createBaseline([]).qualityReport,
      requirementReviewCandidates: {
        r1: createPendingCandidate(requirement),
      },
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createSnapshot({
        requirementText,
        rules,
        requirementBaseline: passedBaseline,
      }),
    );

    expect(merged.requirementBaseline?.qualityReport.status).toBe("passed");
    expect(merged.requirementReviewCandidates.r1).toBeUndefined();
  });

  it("restores missing requirement text without replacing existing rules", () => {
    const existingRules = [createRule("existing")];
    const merged = applySnapshotToWorkspace(
      {
        ...createEmptyWorkspace(),
        requirementText: "",
        rules: existingRules,
      },
      createSnapshot({
        requirementText: "用户可以发布动态并关注其他用户。",
        rules: [createRule("snapshot")],
      }),
    );

    expect(merged.requirementText).toBe("用户可以发布动态并关注其他用户。");
    expect(merged.rules).toEqual(existingRules);
  });

  it("persists successful design artifacts from failed partial snapshots", () => {
    const tableModel = tableDesignModel();
    const workspace: WorkspaceRecord = {
      ...createEmptyWorkspace(),
      generatedDesignDiagramTypes: ["class"],
    };

    const merged = applySnapshotToWorkspace(
      workspace,
      createDesignSnapshot({
        status: "failed",
        error: {
          code: "RUN_RENDER_FAILED",
          message: "组件图渲染失败",
          category: "render",
          retryable: true,
        },
        models: [tableModel],
        plantUml: [{ diagramKind: "table", source: "@startuml\n@enduml" }],
        svgArtifacts: [
          {
            diagramKind: "table",
            svg: "<svg data-kind=\"table\" />",
            renderMeta: {
              engine: "plantuml",
              generatedAt: "2026-06-18T00:00:00.000Z",
              sourceLength: 18,
              durationMs: 1,
            },
          },
        ],
        diagramErrors: {
          component: {
            stage: "render_svg",
            error: {
              code: "RUN_RENDER_FAILED",
              message: "组件图渲染失败",
              category: "render",
              retryable: true,
            },
          },
        },
      }),
    );

    expect(merged.generatedDesignDiagramTypes).toEqual([]);
    expect(merged.designModels.table).toEqual(tableModel);
    expect(merged.designSvgArtifacts.table?.svg).toContain("table");
    expect(merged.designDiagramErrors.component?.error.code).toBe(
      "RUN_RENDER_FAILED",
    );
  });
});
