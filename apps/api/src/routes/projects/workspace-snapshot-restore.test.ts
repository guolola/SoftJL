// Verifies project workspace snapshot restoration across requirement, design, code, and document artifacts.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  AtomicRequirement,
  
  DesignDiagramModelSpec,
  DesignRunSnapshot,
  DesignSvgArtifact,
  DiagramModelSpec,
  RequirementBaseline,
  RunSnapshot,
} from "@uml-platform/contracts";
import { snapshotInputFingerprint } from "@uml-platform/contracts";
import { createEmptySnapshot } from "../../runs/records/snapshots.js";
import { restoreRunSnapshotToWorkspaceState } from "./workspace-snapshot-restore.js";

function analysisModel(useCaseId: string, title: string): DiagramModelSpec {
  return {
    diagramKind: "analysis",
    modelId: `analysis:${useCaseId}`,
    sourceUseCaseId: useCaseId,
    sourceUseCaseName: title,
    title: `${title}需求分析模型`,
    summary: `根据${title}事件流生成。`,
    notes: [],
    participants: [
      {
        id: `actor_${useCaseId}`,
        name: "用户",
        participantType: "actor",
      },
    ],
    messages: [],
    fragments: [],
  };
}

function requirementUseCaseModel(): DiagramModelSpec {
  return {
    diagramKind: "usecase",
    title: "用例模型",
    summary: "当前需求用例。",
    notes: [],
    actors: [],
    useCases: [
      {
        id: "uc-1",
        name: "查看座位",
        goal: "查看可预约座位。",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  } as DiagramModelSpec;
}

function sequenceDesignModel(
  modelId: string,
  sourceUseCaseId: string,
): DesignDiagramModelSpec {
  return {
    diagramKind: "sequence",
    modelId,
    sourceUseCaseId,
    sourceUseCaseName: sourceUseCaseId,
    title: `${sourceUseCaseId}用例实现设计`,
    summary: "用例实现时序。",
    notes: [],
    participants: [],
    messages: [],
    fragments: [],
  };
}

function classDesignModel(): DesignDiagramModelSpec {
  return {
    diagramKind: "class",
    modelId: "class",
    title: "设计类图",
    summary: "静态设计模型。",
    notes: [],
    classes: [],
    interfaces: [],
    enums: [],
    relationships: [],
  };
}

function designSvgArtifact(
  diagramKind: "sequence" | "class" | "table",
  modelId: string,
): DesignSvgArtifact {
  return {
    diagramKind,
    modelId,
    svg: `<svg data-model-id="${modelId}" />`,
    renderMeta: {
      engine: "plantuml",
      generatedAt: "2026-06-10T00:00:00.000Z",
      sourceLength: 32,
      durationMs: 1,
    },
  };
}

function tableDesignModel(): DesignDiagramModelSpec {
  return {
    diagramKind: "table",
    modelId: "table",
    title: "数据库设计",
    summary: "用户表。",
    notes: [],
    tables: [
      {
        id: "users",
        name: "users",
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



function requirementRule(
  id: string,
  text = `${id} 需求规则。`,
): RunSnapshot["rules"][number] {
  return {
    id,
    category: "业务规则",
    text,
    relatedDiagrams: ["usecase"],
  };
}

function atomicRequirement(
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

function requirementBaseline(
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

function pendingReviewCandidate(requirement: AtomicRequirement) {
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

function designSnapshot(
  overrides: Partial<DesignRunSnapshot> = {},
): DesignRunSnapshot {
  return {
    runId: "design-run-restore",
    requirementText: "",
    selectedDiagrams: ["sequence"],
    requestedDiagrams: ["sequence"],
    rules: [],
    requirementBaseline: null,
    coverageMatrix: null,
    traceabilityMatrix: null,
    requirementModels: [requirementUseCaseModel()],
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





for (const stage of ["requirements", "design"] as const) {
  test(`restore replaces custom-ID sources with their models during ${stage} recovery`, () => {
    const design = stage === "design";
    const oldModel = { ...(design ? tableDesignModel() : requirementUseCaseModel()), modelId: "custom-old" };
    const newModel = { ...oldModel, modelId: "custom-new" };
    const modelField = design ? "designModels" : "models";
    const sourceField = design ? "designPlantUml" : "plantUml";
    const errorField = design ? "designDiagramErrors" : "diagramErrors";
    const currentState = {
      [modelField]: { "custom-old": oldModel },
      [sourceField]: { "custom-old": "old-source", unrelated: "keep-source" },
      [errorField]: { "custom-old": { stage: "render_svg", error: { code: "RUN_RENDER_FAILED" } } },
    };
    const snapshot = design
      ? designSnapshot({ selectedDiagrams: ["table"], requestedDiagrams: ["table"], models: [newModel as DesignDiagramModelSpec], plantUml: [{ diagramKind: "table", modelId: "custom-new", source: "new-source" }] })
      : createEmptySnapshot("custom-id-run", "", ["usecase"], [], { models: [newModel as DiagramModelSpec] });
    if (!design) (snapshot as RunSnapshot).plantUml = [{ diagramKind: "usecase", modelId: "custom-new", source: "new-source" }];
    snapshot.status = "completed";
    const restored = restoreRunSnapshotToWorkspaceState({ currentState, snapshot });
    assert.ok(!Object.hasOwn(restored[modelField] as object, "custom-old"));
    assert.deepEqual(restored[sourceField], { "custom-new": "new-source", unrelated: "keep-source" });
    assert.ok(!Object.hasOwn(restored[errorField] as object, "custom-old"));
  });
}

test("restore stores snapshot input fingerprints for requirement diagrams after current input changed", () => {
  const rulesV1 = [requirementRule("r1", "用户可以查看座位。")];
  const rulesV2 = [requirementRule("r1", "用户可以查看并筛选座位。")];
  const snapshotFingerprint = snapshotInputFingerprint({
    requirementText: "座位预约系统 v1",
    rules: rulesV1,
  });
  const workspaceFingerprint = snapshotInputFingerprint({
    requirementText: "座位预约系统 v2",
    rules: rulesV2,
  });
  const snapshot = createEmptySnapshot(
    "run-v1-usecase",
    "座位预约系统 v1",
    ["usecase"],
    rulesV1,
    {
      models: [requirementUseCaseModel()],
      plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
    },
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText: "座位预约系统 v2",
      rules: rulesV2,
      requirementInputFingerprint: workspaceFingerprint,
      rulesVersion: 2,
    },
    snapshot,
    mode: "merge",
  });

  assert.equal(restored.requirementText, "座位预约系统 v2");
  assert.deepEqual(restored.rules, rulesV2);
  assert.equal(restored.requirementInputFingerprint, workspaceFingerprint);
  assert.equal(
    (restored.diagramInputFingerprints as Record<string, string>).usecase,
    snapshotFingerprint,
  );
  assert.deepEqual(restored.generatedDiagramTypes, ["usecase"]);
});

test("restore does not rewrite requirement fingerprints from design snapshots without requirement input", () => {
  const requirementText = "用户可以查看座位。";
  const rules = [requirementRule("r1", "用户可以查看座位。")];
  const currentFingerprint = snapshotInputFingerprint({
    requirementText,
    rules,
  });

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText,
      rules,
      requirementInputFingerprint: currentFingerprint,
      rulesVersion: 3,
      rulesBasedOnTextVersion: 1,
      models: { usecase: requirementUseCaseModel() },
      generatedDiagramTypes: ["usecase"],
      diagramInputFingerprints: { usecase: currentFingerprint },
      diagramVersions: { usecase: 3 },
    },
    snapshot: designSnapshot({
      selectedDiagrams: ["table"],
      requestedDiagrams: ["table"],
      requirementText: "",
      rules: [],
      requirementModels: [
        {
          ...requirementUseCaseModel(),
          title: "空输入设计快照中的旧用例模型",
        },
      ],
      models: [tableDesignModel()],
      plantUml: [
        {
          diagramKind: "table",
          modelId: "table",
          source: "@startuml\n@enduml",
        },
      ],
    }),
    mode: "merge",
  });

  assert.equal(restored.requirementInputFingerprint, currentFingerprint);
  assert.equal(restored.rulesVersion, 3);
  assert.equal(restored.rulesBasedOnTextVersion, 1);
  assert.equal(
    (restored.diagramInputFingerprints as Record<string, string>).usecase,
    currentFingerprint,
  );
  assert.equal((restored.diagramVersions as Record<string, number>).usecase, 3);
  assert.deepEqual(restored.generatedDiagramTypes, ["usecase"]);
  assert.deepEqual(restored.generatedDesignDiagramTypes, []);
});

test("restore writes requirement rules from model snapshots when text still matches", () => {
  const requirementText = "学生检索图书并提交借阅申请。";
  const rules = [
    requirementRule("r1", "学生可以检索图书。"),
    requirementRule("r2", "学生可以提交借阅申请。"),
  ];
  const snapshot = createEmptySnapshot(
    "run-usecase-with-rules",
    requirementText,
    ["usecase"],
    rules,
    {
      models: [requirementUseCaseModel()],
      plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
    },
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText,
      rules: [],
      rulesVersion: 1,
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(restored.rules, rules);
  assert.equal(
    restored.requirementInputFingerprint,
    snapshotInputFingerprint({ requirementText, rules }),
  );
  assert.deepEqual(restored.generatedDiagramTypes, ["usecase"]);
});

test("restore replaces requirement input when terminal auto-sync requests it", () => {
  const oldRules = [
    requirementRule("old-1", "学生可以检索图书。"),
    requirementRule("old-2", "管理员可以审核借阅申请。"),
  ];
  const newRules = [requirementRule("new-1", "用户可以登录系统。")];
  const snapshot = createEmptySnapshot(
    "run-new-usecase",
    "用户可以登录系统。",
    ["usecase"],
    newRules,
    {
      models: [requirementUseCaseModel()],
      plantUml: [{ diagramKind: "usecase", source: "@startuml\n@enduml" }],
    },
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText: "学生可以检索图书并提交借阅申请。",
      rules: oldRules,
      requirementInputFingerprint: snapshotInputFingerprint({
        requirementText: "学生可以检索图书并提交借阅申请。",
        rules: oldRules,
      }),
      rulesVersion: 2,
    },
    snapshot,
    mode: "merge",
    replaceRequirementInput: true,
  });

  assert.equal(restored.requirementText, "用户可以登录系统。");
  assert.deepEqual(restored.rules, newRules);
  assert.equal(
    restored.requirementInputFingerprint,
    snapshotInputFingerprint({
      requirementText: "用户可以登录系统。",
      rules: newRules,
    }),
  );
  assert.deepEqual(restored.generatedDiagramTypes, ["usecase"]);
});

test("restore applies requirement baseline from model snapshots when input matches", () => {
  const requirementText = "用户通过邮箱注册账号，联系方式在认领通过前隐藏。";
  const rules = [
    requirementRule("r1", "用户通过邮箱注册账号。"),
    requirementRule("r6", "联系方式在认领通过前隐藏。"),
  ];
  const pendingRequirement = atomicRequirement({
    id: "REQ-006",
    sourceRuleId: "r6",
    sourceFragment: "联系方式在认领通过前隐藏。",
    actor: null,
    status: "pending-review",
  });
  const pendingBaseline = requirementBaseline([pendingRequirement], {
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
  const snapshot = createEmptySnapshot(
    "run-pending-baseline",
    requirementText,
    ["usecase"],
    rules,
    { models: [requirementUseCaseModel()] },
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.requirementBaseline = pendingBaseline;

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText,
      rules,
      requirementBaseline: requirementBaseline([
        atomicRequirement({
          id: "REQ-006",
          sourceRuleId: "r6",
          status: "accepted",
        }),
      ]),
      requirementQualityReport: requirementBaseline([]).qualityReport,
      requirementReviewCandidates: {
        r6: pendingReviewCandidate(pendingRequirement),
      },
    },
    snapshot,
    mode: "merge",
  });

  const restoredBaseline = restored.requirementBaseline as RequirementBaseline;
  assert.equal(restoredBaseline.qualityReport.status, "pending-review");
  assert.deepEqual(
    restoredBaseline.qualityReport.reviewRequiredRequirementIds,
    ["REQ-006"],
  );
  assert.equal(
    (
      (restored.requirementReviewCandidates as Record<string, { status: string }>)
        .r6
    ).status,
    "pending",
  );
});

test("restore keeps accepted candidates over older pending snapshot baselines", () => {
  const requirementText = "用户通过邮箱注册账号，联系方式在认领通过前隐藏。";
  const rules = [
    requirementRule("r1", "用户通过邮箱注册账号。"),
    requirementRule("r6", "联系方式在认领通过前隐藏。"),
  ];
  const pendingRequirement = atomicRequirement({
    id: "REQ-006",
    sourceRuleId: "r6",
    sourceFragment: "联系方式在认领通过前隐藏。",
    actor: null,
    status: "pending-review",
  });
  const acceptedRequirement = atomicRequirement({
    id: "REQ-006",
    sourceRuleId: "r6",
    sourceFragment: "联系方式在认领通过前隐藏。",
    actor: "认领用户",
    status: "accepted",
  });
  const snapshot = createEmptySnapshot(
    "run-pending-baseline",
    requirementText,
    ["usecase"],
    rules,
    { models: [requirementUseCaseModel()] },
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.requirementBaseline = requirementBaseline([pendingRequirement], {
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

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText,
      rules,
      requirementReviewCandidates: {
        r6: {
          ...pendingReviewCandidate(pendingRequirement),
          afterRequirement: acceptedRequirement,
          status: "accepted",
        },
      },
    },
    snapshot,
    mode: "merge",
  });

  const restoredBaseline = restored.requirementBaseline as RequirementBaseline;
  assert.equal(restoredBaseline.requirements[0]?.status, "accepted");
  assert.equal(restoredBaseline.requirements[0]?.actor, "认领用户");
  assert.equal(restoredBaseline.qualityReport.status, "passed");
  assert.deepEqual(restoredBaseline.qualityReport.issues, []);
  assert.deepEqual(restoredBaseline.qualityReport.reviewRequiredRequirementIds, []);
  assert.equal(
    (
      (restored.requirementReviewCandidates as Record<string, { status: string }>)
        .r6
    ).status,
    "accepted",
  );
});

test("restore drops stale pending candidates when the new baseline has passed", () => {
  const requirementText = "用户通过邮箱注册账号。";
  const rules = [requirementRule("r1", "用户通过邮箱注册账号。")];
  const requirement = atomicRequirement({
    id: "REQ-001",
    sourceRuleId: "r1",
    status: "accepted",
  });
  const snapshot = createEmptySnapshot(
    "run-passed-baseline",
    requirementText,
    ["usecase"],
    rules,
    { models: [requirementUseCaseModel()] },
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.requirementBaseline = requirementBaseline([requirement]);

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText,
      rules,
      requirementBaseline: requirementBaseline([
        {
          ...requirement,
          status: "pending-review",
        },
      ]),
      requirementQualityReport: requirementBaseline([]).qualityReport,
      requirementReviewCandidates: {
        r1: pendingReviewCandidate(requirement),
      },
    },
    snapshot,
    mode: "merge",
  });

  const restoredBaseline = restored.requirementBaseline as RequirementBaseline;
  assert.equal(restoredBaseline.qualityReport.status, "passed");
  assert.equal(
    (restored.requirementReviewCandidates as Record<string, unknown>).r1,
    undefined,
  );
});

test("restore replaces old design records by successful selected design kind", () => {
  const oldSequence = sequenceDesignModel("sequence:uc_old", "uc_old");
  const newSequence = sequenceDesignModel("sequence:uc-1", "uc-1");
  const snapshot = designSnapshot({
    models: [newSequence],
    plantUml: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc-1",
        source: "@startuml\n@enduml",
      },
    ],
    svgArtifacts: [designSvgArtifact("sequence", "sequence:uc-1")],
    designModelTraceability: [
      {
        source: {
          diagramKind: "usecase",
          elementId: "uc-1",
          elementKind: "useCase",
          label: "查看座位",
        },
        targets: [
          {
            modelId: "sequence:uc-1",
            diagramKind: "sequence",
            elementId: "message-1",
            elementKind: "message",
            label: "查看座位",
          },
        ],
      },
    ],
  });

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      designModels: {
        "sequence:uc_old": oldSequence,
        class: classDesignModel(),
      },
      designPlantUml: {
        "sequence:uc_old": "@startuml\n' old\n@enduml",
        class: "@startuml\nclass Existing\n@enduml",
      },
      designSvgArtifacts: {
        "sequence:uc_old": designSvgArtifact("sequence", "sequence:uc_old"),
        class: designSvgArtifact("class", "class"),
      },
      designInputFingerprints: {
        "sequence:uc_old": "old-fp",
        class: "class-fp",
      },
      designModelTraceability: [
        {
          source: {
            diagramKind: "usecase",
            elementId: "uc_old",
            elementKind: "useCase",
            label: "旧用例",
          },
          targets: [
            {
              modelId: "sequence:uc_old",
              diagramKind: "sequence",
              elementId: "old-message",
              elementKind: "message",
              label: "旧消息",
            },
          ],
        },
        {
          source: {
            diagramKind: "usecase",
            elementId: "uc-1",
            elementKind: "useCase",
            label: "查看座位",
          },
          targets: [
            {
              modelId: "class",
              diagramKind: "class",
              elementId: "Existing",
              elementKind: "class",
              label: "Existing",
            },
          ],
        },
      ],
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(
    Object.keys(restored.designModels as Record<string, unknown>).sort(),
    ["class", "sequence:uc-1"],
  );
  assert.deepEqual(
    Object.keys(restored.designPlantUml as Record<string, unknown>).sort(),
    ["class", "sequence:uc-1"],
  );
  assert.deepEqual(
    Object.keys(restored.designSvgArtifacts as Record<string, unknown>).sort(),
    ["class", "sequence:uc-1"],
  );
  assert.equal(
    (restored.designInputFingerprints as Record<string, string>)["sequence:uc_old"],
    undefined,
  );
  assert.equal(
    (restored.designModelTraceability as Array<{ targets: Array<{ modelId?: string }> }>)
      .some((entry) =>
        entry.targets.some((target) => target.modelId === "sequence:uc_old"),
      ),
    false,
  );
});

test("restore preserves old design records when selected design kind failed", () => {
  const oldSequence = sequenceDesignModel("sequence:uc_old", "uc_old");
  const snapshot = designSnapshot({
    status: "failed",
    models: [],
    plantUml: [],
    svgArtifacts: [],
    diagramErrors: {
      sequence: {
        stage: "generate_design_models",
        error: {
          code: "PLATFORM_PROVIDER_TIMEOUT",
          message: "当前模型服务响应超时，请稍后重试。",
          category: "platform_provider",
          retryable: true,
        },
      },
    },
  });

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      designModels: {
        "sequence:uc_old": oldSequence,
      },
      designPlantUml: {
        "sequence:uc_old": "@startuml\n' old\n@enduml",
      },
      designSvgArtifacts: {
        "sequence:uc_old": designSvgArtifact("sequence", "sequence:uc_old"),
      },
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(Object.keys(restored.designModels as Record<string, unknown>), [
    "sequence:uc_old",
  ]);
  assert.deepEqual(
    Object.keys(restored.designPlantUml as Record<string, unknown>),
    ["sequence:uc_old"],
  );
  assert.ok((restored.designDiagramErrors as Record<string, unknown>).sequence);
});

test("restore applies successful design artifacts from failed partial snapshots", () => {
  const tableModel = tableDesignModel();
  const snapshot = designSnapshot({
    selectedDiagrams: ["table", "component"],
    requestedDiagrams: ["table", "component"],
    status: "failed",
    error: {
      code: "RUN_RENDER_FAILED",
      message: "组件图渲染失败",
      category: "render",
      retryable: true,
    },
    models: [tableModel],
    plantUml: [
      {
        diagramKind: "table",
        modelId: "table",
        source: "@startuml\n@enduml",
      },
    ],
    svgArtifacts: [designSvgArtifact("table", "table")],
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
  });

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      generatedDesignDiagramTypes: ["class"],
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(restored.generatedDesignDiagramTypes, []);
  assert.deepEqual(Object.keys(restored.designModels as Record<string, unknown>), [
    "table",
  ]);
  assert.deepEqual(
    Object.keys(restored.designSvgArtifacts as Record<string, unknown>),
    ["table"],
  );
  assert.ok((restored.designDiagramErrors as Record<string, unknown>).component);
});





test("restore fills missing requirement text without replacing existing rules", () => {
  const existingRule = {
    id: "existing",
    category: "业务规则",
    text: "已有规则。",
    relatedDiagrams: ["usecase"],
  };
  const snapshot = createEmptySnapshot(
    "run-requirement-text",
    "用户可以发布动态并关注其他用户。",
    ["usecase"],
    [
      {
        id: "snapshot",
        category: "业务规则",
        text: "快照规则。",
        relatedDiagrams: ["usecase"],
      },
    ],
  );

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      requirementText: "",
      rules: [existingRule],
    },
    snapshot,
    mode: "merge",
  });

  assert.equal(restored.requirementText, "用户可以发布动态并关注其他用户。");
  assert.deepEqual(restored.rules, [existingRule]);
});

test("restore keeps requirement analysis model instances keyed by modelId", () => {
  const snapshot = createEmptySnapshot(
    "run-analysis-restore",
    "用户可以检索并预约设备。",
    ["analysis"],
    [],
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.models = [
    analysisModel("uc_search", "检索设备"),
    analysisModel("uc_reserve", "提交预约"),
  ];
  snapshot.plantUml = snapshot.models.map((model) => ({
    diagramKind: "analysis",
    modelId: model.modelId,
    source: `@startuml\n' ${model.modelId}\n@enduml`,
  }));
  snapshot.svgArtifacts = snapshot.models.map((model) => ({
    diagramKind: "analysis",
    modelId: model.modelId,
    svg: `<svg data-model-id="${model.modelId}" />`,
    renderMeta: {
      engine: "plantuml",
      generatedAt: "2026-06-04T00:00:00.000Z",
      sourceLength: 32,
      durationMs: 1,
    },
  }));

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      models: {
        analysis: analysisModel("old", "旧分析"),
      },
      plantUml: {
        analysis: "@startuml\n' old\n@enduml",
      },
      svgArtifacts: {
        analysis: {
          diagramKind: "analysis",
          svg: "<svg data-old />",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-06-04T00:00:00.000Z",
            sourceLength: 16,
            durationMs: 1,
          },
        },
      },
    },
    snapshot,
    mode: "merge",
  });

  const models = restored.models as Record<string, DiagramModelSpec>;
  const plantUml = restored.plantUml as Record<string, string>;
  const svgArtifacts = restored.svgArtifacts as Record<
    string,
    { modelId?: string }
  >;
  assert.equal(models.analysis, undefined);
  assert.deepEqual(Object.keys(models).sort(), [
    "analysis:uc_reserve",
    "analysis:uc_search",
  ]);
  assert.deepEqual(Object.keys(plantUml).sort(), [
    "analysis:uc_reserve",
    "analysis:uc_search",
  ]);
  assert.deepEqual(Object.keys(svgArtifacts).sort(), [
    "analysis:uc_reserve",
    "analysis:uc_search",
  ]);
});

test("restore does not mark context requirement models generated without artifacts", () => {
  const snapshot = createEmptySnapshot(
    "run-class-restore",
    "用户可以浏览活动并报名。",
    ["class"],
    [],
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.models = [
    {
      diagramKind: "usecase",
      modelId: "usecase",
      title: "上下文用例模型",
      summary: "来自早前运行。",
      notes: [],
      actors: [],
      useCases: [],
      relationships: [],
    } as DiagramModelSpec,
    {
      diagramKind: "class",
      modelId: "class",
      title: "领域概念模型",
      summary: "本次运行生成。",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    } as DiagramModelSpec,
  ];
  snapshot.plantUml = [
    {
      diagramKind: "class",
      source: "@startuml\nclass Activity\n@enduml",
    },
  ];
  snapshot.svgArtifacts = [
    {
      diagramKind: "class",
      svg: "<svg><text>Activity</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-06-08T00:00:00.000Z",
        sourceLength: 32,
        durationMs: 1,
      },
    },
  ];

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      models: {
        usecase: {
          diagramKind: "usecase",
          modelId: "usecase",
          title: "旧用例模型",
          summary: "旧状态。",
          notes: [],
          actors: [],
          useCases: [],
          relationships: [],
        },
      },
      plantUml: {
        usecase: "@startuml\nusecase Old\n@enduml",
      },
      svgArtifacts: {
        usecase: {
          diagramKind: "usecase",
          svg: "<svg><text>Old</text></svg>",
          renderMeta: {
            engine: "plantuml",
            generatedAt: "2026-06-08T00:00:00.000Z",
            sourceLength: 24,
            durationMs: 1,
          },
        },
      },
      generatedDiagramTypes: ["usecase"],
      diagramVersions: { usecase: 1 },
    },
    snapshot,
    mode: "restore",
  });

  const models = restored.models as Record<string, DiagramModelSpec>;
  const plantUml = restored.plantUml as Record<string, string>;
  const svgArtifacts = restored.svgArtifacts as Record<
    string,
    { diagramKind?: string }
  >;
  assert.deepEqual(restored.generatedDiagramTypes, ["class"]);
  assert.deepEqual(Object.keys(models), ["class"]);
  assert.deepEqual(Object.keys(plantUml), ["class"]);
  assert.deepEqual(Object.keys(svgArtifacts), ["class"]);
  assert.deepEqual(restored.diagramVersions, { class: 1 });
});

test("restore preserves existing artifacts when selected diagram only has an error", () => {
  const snapshot = createEmptySnapshot(
    "run-activity-timeout",
    "用户可以浏览活动并报名。",
    ["activity"],
    [],
  ) as RunSnapshot;
  snapshot.status = "completed";
  snapshot.currentStage = "render_svg";
  snapshot.models = [
    {
      diagramKind: "usecase",
      modelId: "usecase",
      title: "上下文用例模型",
      summary: "已有模型。",
      notes: [],
      actors: [],
      useCases: [],
      relationships: [],
    } as DiagramModelSpec,
    {
      diagramKind: "class",
      modelId: "class",
      title: "领域概念模型",
      summary: "已有模型。",
      notes: [],
      classes: [],
      interfaces: [],
      enums: [],
      relationships: [],
    } as DiagramModelSpec,
    {
      diagramKind: "deployment",
      modelId: "deployment",
      title: "部署需求模型",
      summary: "上一子任务成功生成。",
      notes: [],
      nodes: [],
      databases: [],
      components: [],
      externalSystems: [],
      artifacts: [],
      relationships: [],
    } as DiagramModelSpec,
  ];
  snapshot.diagramErrors = {
    activity: {
      stage: "generate_models",
      error: {
        code: "PLATFORM_PROVIDER_TIMEOUT",
        message: "当前模型服务响应超时，请稍后重试。",
        category: "platform_provider",
        retryable: true,
      },
    },
  };

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      generatedDiagramTypes: ["usecase", "class", "deployment"],
      models: Object.fromEntries(
        snapshot.models.map((model) => [model.diagramKind, model]),
      ),
      plantUml: {
        usecase: "@startuml\nusecase Existing\n@enduml",
        class: "@startuml\nclass Existing\n@enduml",
        deployment: "@startuml\nnode Existing\n@enduml",
      },
      svgArtifacts: {
        usecase: { diagramKind: "usecase", svg: "<svg>usecase</svg>" },
        class: { diagramKind: "class", svg: "<svg>class</svg>" },
        deployment: { diagramKind: "deployment", svg: "<svg>deployment</svg>" },
      },
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(restored.generatedDiagramTypes, [
    "usecase",
    "class",
    "deployment",
  ]);
  assert.deepEqual(
    Object.keys(restored.plantUml as Record<string, unknown>).sort(),
    ["class", "deployment", "usecase"],
  );
  assert.deepEqual(
    Object.keys(restored.svgArtifacts as Record<string, unknown>).sort(),
    ["class", "deployment", "usecase"],
  );
  assert.equal(
    (restored.models as Record<string, unknown>).activity,
    undefined,
  );
  assert.equal(
    (restored.diagramErrors as Record<string, { error: { code: string } }>)
      .activity.error.code,
    "PLATFORM_PROVIDER_TIMEOUT",
  );
});

test("restore applies successful requirement artifacts from cancelled partial snapshots", () => {
  const snapshot = createEmptySnapshot(
    "run-cancelled-requirements",
    "用户可以浏览活动并报名。",
    ["activity", "deployment"],
    [],
  ) as RunSnapshot;
  snapshot.status = "cancelled";
  snapshot.currentStage = "generate_models";
  snapshot.models = [
    {
      diagramKind: "deployment",
      modelId: "deployment",
      title: "部署需求模型",
      summary: "部署相关约束已生成。",
      notes: [],
      nodes: [],
      databases: [],
      components: [],
      externalSystems: [],
      artifacts: [],
      relationships: [],
    } as DiagramModelSpec,
  ];
  snapshot.plantUml = [
    {
      diagramKind: "deployment",
      source: "@startuml\nnode App\n@enduml",
    },
  ];
  snapshot.svgArtifacts = [
    {
      diagramKind: "deployment",
      svg: "<svg><text>deployment</text></svg>",
      renderMeta: {
        engine: "plantuml",
        generatedAt: "2026-06-20T00:00:00.000Z",
        sourceLength: 24,
        durationMs: 1,
      },
    },
  ];
  snapshot.diagramErrors = {
    activity: {
      stage: "generate_models",
      error: {
        code: "PLATFORM_PROVIDER_TIMEOUT",
        message: "当前模型服务响应超时，请稍后重试。",
        category: "platform_provider",
        retryable: true,
      },
    },
  };

  const restored = restoreRunSnapshotToWorkspaceState({
    currentState: {
      generatedDiagramTypes: ["usecase"],
      models: {
        usecase: requirementUseCaseModel(),
      },
    },
    snapshot,
    mode: "merge",
  });

  assert.deepEqual(
    (restored.generatedDiagramTypes as string[]).sort(),
    ["deployment", "usecase"],
  );
  assert.deepEqual(restored.selectedDiagramTypes, []);
  assert.equal(
    (restored.models as Record<string, DiagramModelSpec>).deployment
      .diagramKind,
    "deployment",
  );
  assert.equal(
    (restored.models as Record<string, unknown>).activity,
    undefined,
  );
  assert.equal(
    (restored.diagramErrors as Record<string, { error: { code: string } }>)
      .activity.error.code,
    "PLATFORM_PROVIDER_TIMEOUT",
  );
});
