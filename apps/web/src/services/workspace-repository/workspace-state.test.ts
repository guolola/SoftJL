// Verifies workspace snapshot merge rules that are shared by repository implementations.
import { createRunSnapshot, createDesignRunSnapshot } from "@/test/contract-fixtures";
import { describe, expect, it } from "vitest";
import { captureWorkspaceGuard } from "@uml-platform/contracts";
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
  mergeWorkspaceState,
} from "./workspace-state";

it("loads current rule facts without rewriting associations or versions", () => {
  const rule = { id: "r1", type: "functional" as const, text: "用户查看信息" };
  const next = mergeWorkspaceState({ rules: [rule], rulesVersion: 1, requirementText: rule.text });
  expect(next.rules).toEqual([rule]);
  expect(next.rulesVersion).toBe(1);
});

it("rejects obsolete rules on load instead of inferring classifications", () => {
  const obsolete = { rules: [{ id: "R1", text: "用户预约", category: "功能需求" }] };
  expect(() => mergeWorkspaceState(obsolete as unknown as Partial<WorkspaceRecord>)).toThrow(/type/);
  expect(obsolete.rules[0]).not.toHaveProperty("classification");
});

it("rejects obsolete saved models and incomplete feasibility artifacts without mutating storage", () => {
  const state = { models: { usecase: { diagramKind: "usecase", title: "obsolete" } }, designInputFingerprints: { class: "old" } };
  const before = structuredClone(state);
  expect(() => mergeWorkspaceState(state as unknown as Partial<WorkspaceRecord>)).toThrow();
  expect(state).toEqual(before);
  expect(() => mergeWorkspaceState({ feasibilityBusinessFlow: { model: {} } } as unknown as Partial<WorkspaceRecord>)).toThrow();
});

it("rejects outdated snapshot provenance before restoring any workspace artifacts", () => {
  const workspace = createEmptyWorkspace();
  const before = structuredClone(workspace);
  for (const field of ["operationType", "outputManifest"] as const) {
    const snapshot = createRunSnapshot();
    delete (snapshot as unknown as Record<string, unknown>)[field];
    expect(() => applySnapshotToWorkspace(workspace, snapshot)).toThrow();
  }
  expect(workspace).toEqual(before);
});

it("leaves contextual models untouched when the manifest accepts no model output", () => {
  const original = createUseCaseModel();
  const workspace = { ...createEmptyWorkspace(), models: { usecase: original } };
  const snapshot = createRunSnapshot({ selectedDiagrams: ["usecase"], models: [{ ...original, title: "仅运行上下文" }], outputManifest: [] });
  expect(applySnapshotToWorkspace(workspace, snapshot).models.usecase).toEqual(original);
});

it("does not invent a source fingerprint for an existing design when loading a workspace", () => {
  const design = tableDesignModel();
  const next = mergeWorkspaceState({
    models: { usecase: createUseCaseModel() },
    designModels: { table: design },
    generatedDesignDiagramTypes: ["table"],
    designInputFingerprints: {},
  });
  expect(next.designInputFingerprints).toEqual({});
  expect(next.designModels.table).toEqual(design);
});

function createRule(id: string, text = `${id} 需求规则。`): RequirementRule {
  return {
    id,
    type: "business-rule" as const,
    text,

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
    type: "functional" as const,
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
      id: "baseline-test",
      version: 1,
      sourceInputFingerprint: "test-source-input",
    runId: "run-baseline",
    sourceDocumentId: "inline-requirement",
    createdAt: "2026-06-18T00:00:00.000Z",
    assumptions: [],
    conflicts: [],
    schemaVersion: 3 as const,

      rules: (requirements).map(item => ({ id: item.sourceRuleId ?? item.id, requirementId: item.id, text: item.sourceFragment, type: "business-rule" as const, origin: "generated" as const })),
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

it("retains baseline metadata when an older model result has the same requirement content", () => {
  const rule = createRule("r1", "用户通过邮箱注册账号。");
  const baseline = createBaseline([createAtomicRequirement()]);
  const workspace = { ...createEmptyWorkspace(), requirementText: rule.text, rules: [rule], requirementBaseline: baseline };
  const incoming = { ...baseline, runId: "model-task", createdAt: "2026-10-17T00:00:00Z", qualityReport: { ...baseline.qualityReport, runId: "model-task" } };
  const snapshot = createRunSnapshot({ runId: "model-task", requirementText: rule.text, rules: [rule], selectedDiagrams: ["usecase"], requirementBaseline: incoming });
  const next = applySnapshotToWorkspace(workspace, snapshot);
  expect(next.requirementBaseline).toEqual(baseline);
  expect(next.requirementQualityReport).toEqual(baseline.qualityReport);
});

function createUseCaseModel(): DiagramModelSpec {
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
  return createRunSnapshot({ runId: "run-snapshot", selectedDiagrams: ["usecase"], models: [createUseCaseModel()], ...overrides });
}

function createDesignSnapshot(
  overrides: Partial<DesignRunSnapshot>,
): DesignRunSnapshot {
  return createDesignRunSnapshot({ runId: "design-run-snapshot", requirementText: "图书馆管理系统", selectedDiagrams: ["table", "component"], requestedDiagrams: ["table", "component"], ...overrides });
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

describe("applySnapshotToWorkspace", () => {
  it("preserves a design target edited after the run began", () => {
    const original = { ...createEmptyWorkspace(), designModels: { table: tableDesignModel() } };
    const snapshot = createDesignSnapshot({ models: [tableDesignModel()], selectedDiagrams: ["table"] });
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...original });
    const edited = { ...original, designModels: { table: { ...tableDesignModel(), title: "人工修改" } } };
    expect(applySnapshotToWorkspace(edited, snapshot)).toBe(edited);
  });
  it("refuses stale run facts in browser merges while allowing unrelated preferences", () => {
    const original = { ...createEmptyWorkspace(), requirementText: "原需求", rules: [createRule("r1")] };
    const snapshot = createSnapshot({ requirementText: original.requirementText, rules: original.rules, models: [createUseCaseModel()] });
    snapshot.workspaceGuard = captureWorkspaceGuard({ snapshot }, { ...original });
    const edited = { ...original, requirementText: "刚修改的需求" };
    expect(applySnapshotToWorkspace(edited, snapshot)).toBe(edited);
    const fresh = applySnapshotToWorkspace(original, snapshot);
    expect(Object.values(fresh.models)).toContainEqual(createUseCaseModel());
    snapshot.publicationSkipped = "输入已变更";
    expect(applySnapshotToWorkspace(original, snapshot)).toBe(original);
  });
  it.each(["requirements", "design"])("replaces custom-ID sources with their models during %s snapshot recovery", (stage) => {
    const design = stage === "design";
    const oldModel = { ...(design ? tableDesignModel() : createUseCaseModel()), modelId: "custom-old" };
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
        models: [createUseCaseModel()],
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
        models: [createUseCaseModel()],
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
    const existingUseCaseModel = createUseCaseModel();
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
            ...createUseCaseModel(),
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
    const pendingBaseline = createBaseline([createAtomicRequirement(), pendingRequirement], {
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
        createAtomicRequirement(),
        createAtomicRequirement({
          id: "REQ-006",
          sourceRuleId: "r6",
          sourceFragment: "联系方式在认领通过前隐藏。",
          status: "accepted",
        }),
      ]),
      requirementQualityReport: createBaseline([]).qualityReport,

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
  });

  it("applies the explicit baseline and its quality report", () => {
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
    const pendingBaseline = createBaseline([createAtomicRequirement(), pendingRequirement], {
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

      },
      createSnapshot({
        runId: "run-pending-baseline",
        requirementText,
        rules,
        requirementBaseline: pendingBaseline,
      }),
    );

    expect(merged.requirementBaseline?.rules[0]?.origin).toBe("generated");
    expect(merged.requirementBaseline?.rules[0]?.type).toBe("business-rule");
    expect(merged.requirementBaseline?.rules.map(rule => rule.text)).toEqual(rules.map(rule => rule.text));
    expect(merged.requirementBaseline?.qualityReport).toEqual(pendingBaseline.qualityReport);
    expect(
      merged.requirementBaseline?.qualityReport.reviewRequiredRequirementIds,
    ).toEqual(["REQ-006"]);
  });

  it("replaces the pending baseline with a passed baseline", () => {
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
