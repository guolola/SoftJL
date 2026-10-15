// Covers element-level traceability filtering before generated mappings reach the UI.
import assert from "node:assert/strict";
import test from "node:test";
import {
  autoFillRequirementTraceability,
  deriveDesignRelationshipTraceability,
  deriveUpstreamDesignRefsFromTraceability,
  formatTraceabilityMissingRefs,
  normalizeDesignTraceability,
  normalizeDesignTraceabilityWithCoverage,
  normalizeRequirementTraceability,
  normalizeRequirementTraceabilityWithCoverage,
} from "./traceability-normalizer.js";

const rule = {
  id: "r1",
  category: "业务规则",
  text: "用户必须登录后才能提交订单。",
  relatedDiagrams: ["usecase" as const],
};

const requirementModel = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "用户实体",
  notes: [],
  classes: [
    {
      id: "domain-user",
      name: "UserDomain",
      attributes: [],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [
    {
      id: "rel-user-order",
      sourceId: "domain-user",
      targetId: "domain-order",
      type: "association" as const,
    },
  ],
};

const designModel = {
  diagramKind: "class" as const,
  title: "设计类图",
  summary: "静态结构",
  notes: [],
  classes: [
    {
      id: "class-user-auth",
      name: "Class_UserAuth",
      attributes: [],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [],
};

test("requirement traceability keeps valid rule-to-element refs and drops invalid refs", () => {
  const normalized = normalizeRequirementTraceability(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      },
      {
        ruleId: "missing-rule",
        target: { diagramKind: "class", elementId: "domain-user" },
      },
      {
        ruleId: "r1",
        target: { diagramKind: "class", elementId: "missing-element" },
      },
    ],
    [rule],
    [requirementModel],
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.ruleId, "r1");
  assert.equal(normalized[0]?.target.elementId, "domain-user");
  assert.equal(normalized[0]?.target.label, "UserDomain");
});

test("requirement traceability normalizes safe diagram aliases", () => {
  const normalized = normalizeRequirementTraceability(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "domain-model",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      },
      {
        ruleId: "r1",
        target: {
          diagramKind: "requirements",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      },
    ],
    [rule],
    [requirementModel],
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.target.diagramKind, "class");
  assert.equal(normalized[0]?.target.elementId, "domain-user");
});

test("requirement traceability requires model ids only when duplicate analysis ids are ambiguous", () => {
  const analysisModels = ["uc_search", "uc_borrow"].map((useCaseId) => ({
    diagramKind: "analysis" as const,
    modelId: `analysis:${useCaseId}`,
    sourceUseCaseId: useCaseId,
    sourceUseCaseName: useCaseId,
    title: `${useCaseId}分析`,
    summary: "分析",
    notes: [],
    participants: [
      { id: "actor", name: "参与者", participantType: "actor" as const },
    ],
    messages: [],
    fragments: [],
  }));
  const analysisRule = {
    ...rule,
    relatedDiagrams: ["analysis" as const],
  };

  const ambiguous = normalizeRequirementTraceabilityWithCoverage(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "requirement-analysis",
          elementId: "actor",
          elementKind: "participant",
          label: "参与者",
        },
      },
    ],
    [analysisRule],
    analysisModels,
  );
  assert.equal(ambiguous.traceability.length, 0);
  assert.equal(ambiguous.missingTargets.length, 2);

  const scoped = normalizeRequirementTraceabilityWithCoverage(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "requirement-analysis",
          modelId: "analysis:uc_search",
          elementId: "actor",
          elementKind: "participant",
          label: "参与者",
        },
      },
    ],
    [analysisRule],
    analysisModels,
  );
  assert.equal(scoped.traceability.length, 1);
  assert.equal(scoped.traceability[0]?.target.modelId, "analysis:uc_search");
  assert.equal(scoped.missingTargets.length, 1);
});

test("requirement traceability reports uncovered model elements and relationships", () => {
  const normalized = normalizeRequirementTraceabilityWithCoverage(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      },
    ],
    [rule],
    [requirementModel],
  );

  assert.equal(normalized.traceability.length, 1);
  assert.deepEqual(
    normalized.missingTargets.map((target) => target.elementId),
    ["rel-user-order"],
  );
  assert.match(
    formatTraceabilityMissingRefs("requirement", normalized.missingTargets),
    /缺少 1 个需求元素映射：class:rel-user-order/,
  );
});

test("requirement traceability can auto-fill uncovered refs from related rules", () => {
  const classRule = {
    id: "r2",
    category: "数据需求" as const,
    text: "系统应管理用户领域对象。",
    relatedDiagrams: ["class" as const],
  };
  const coverage = normalizeRequirementTraceabilityWithCoverage(
    [],
    [rule, classRule],
    [requirementModel],
  );
  const recovered = normalizeRequirementTraceabilityWithCoverage(
    autoFillRequirementTraceability(coverage.missingTargets, [rule, classRule]),
    [rule, classRule],
    [requirementModel],
  );

  assert.equal(recovered.missingTargets.length, 0);
  assert.ok(recovered.traceability.every((entry) => entry.ruleId === "r2"));
});

test("requirement auto-fill rotates fallback rules and marks low-confidence reviews", () => {
  const rules = [
    {
      id: "r-class-1",
      category: "数据需求" as const,
      text: "系统需要维护基础资料。",
      relatedDiagrams: ["class" as const],
    },
    {
      id: "r-class-2",
      category: "数据需求" as const,
      text: "系统需要保存业务记录。",
      relatedDiagrams: ["class" as const],
    },
  ];
  const missingTargets = [
    {
      diagramKind: "class" as const,
      elementId: "alpha",
      elementKind: "class",
      label: "Alpha",
    },
    {
      diagramKind: "class" as const,
      elementId: "beta",
      elementKind: "class",
      label: "Beta",
    },
  ];

  const filled = autoFillRequirementTraceability(missingTargets, rules);

  assert.deepEqual(
    filled.map((entry) => entry.ruleId),
    ["r-class-1", "r-class-2"],
  );
  assert.ok(
    filled.every(
      (entry) =>
        entry.mappingSource === "auto-filled-pending-review" &&
        entry.reviewStatus === "pending" &&
        entry.confidence === "low",
    ),
  );
});
test("even strong name similarity remains pending and cannot become confirmed authority", () => {
  const filled = autoFillRequirementTraceability([{ diagramKind: "class", elementId: "订单", elementKind: "class", label: "订单" }], [{ id: "R1", category: "数据需求", text: "系统保存订单信息和订单状态", relatedDiagrams: ["class"] }]);
  assert.equal(filled[0]?.mappingSource, "auto-filled-pending-review");
  assert.equal(filled[0]?.reviewStatus, "pending");
});

test("requirement traceability preserves pending review metadata", () => {
  const normalized = normalizeRequirementTraceability(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
        mappingSource: "auto-filled-pending-review",
        reviewStatus: "pending",
        confidence: "low",
        rationale: "系统兜底补齐，需复核。",
      },
    ],
    [rule],
    [requirementModel],
  );

  assert.equal(normalized[0]?.mappingSource, "auto-filled-pending-review");
  assert.equal(normalized[0]?.reviewStatus, "pending");
  assert.equal(normalized[0]?.confidence, "low");
  assert.equal(normalized[0]?.rationale, "系统兜底补齐，需复核。");
});

test("requirement traceability coverage ignores structural activity elements", () => {
  const activityModel = {
    diagramKind: "activity" as const,
    title: "活动流程",
    summary: "业务节点",
    notes: [],
    swimlanes: [{ id: "lane-user", name: "用户" }],
    nodes: [
      { id: "start", type: "start", name: "开始" },
      { id: "submit", type: "activity", name: "提交订单" },
      { id: "check", type: "decision", name: "校验库存" },
      { id: "end", type: "end", name: "结束" },
    ],
    relationships: [
      { id: "flow-start", type: "control_flow" as const, sourceId: "start", targetId: "submit" },
      { id: "flow-submit", type: "control_flow" as const, sourceId: "submit", targetId: "check" },
      { id: "flow-end", type: "control_flow" as const, sourceId: "check", targetId: "end" },
    ],
  };
  const normalized = normalizeRequirementTraceabilityWithCoverage(
    [
      {
        ruleId: "r1",
        target: {
          diagramKind: "activity",
          elementId: "submit",
          elementKind: "activity",
          label: "提交订单",
        },
      },
    ],
    [rule],
    [activityModel],
  );

  assert.deepEqual(
    normalized.missingTargets.map((target) => target.elementId),
    ["check", "flow-submit"],
  );
});

test("design traceability keeps valid design-to-requirement refs and drops invalid targets", () => {
  const normalized = normalizeDesignTraceability(
    [
      {
        source: {
          diagramKind: "class",
          elementId: "class-user-auth",
          elementKind: "class",
          label: "Class_UserAuth",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "domain-user",
            elementKind: "class",
            label: "UserDomain",
          },
          {
            diagramKind: "class",
            elementId: "missing-element",
          },
        ],
      },
      {
        source: { diagramKind: "class", elementId: "missing-source" },
        targets: [{ diagramKind: "class", elementId: "domain-user" }],
      },
    ],
    [designModel],
    [requirementModel],
  );

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.source.elementId, "class-user-auth");
  assert.deepEqual(
    normalized[0]?.targets.map((target) => target.elementId),
    ["domain-user"],
  );
});

test("design traceability rejects stage names as diagramKind and reports missing source coverage", () => {
  const normalized = normalizeDesignTraceabilityWithCoverage(
    [
      {
        source: {
          diagramKind: "requirements",
          elementId: "class-user-auth",
          elementKind: "class",
          label: "Class_UserAuth",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "domain-user",
            elementKind: "class",
            label: "UserDomain",
          },
        ],
      },
    ],
    [designModel],
    [requirementModel],
  );

  assert.equal(normalized.traceability.length, 0);
  assert.deepEqual(
    normalized.missingSources.map((source) => source.elementId),
    ["class-user-auth"],
  );
});

test("design traceability distinguishes same element ids across sequence model instances", () => {
  const sequenceModels = [
    {
      diagramKind: "sequence" as const,
      modelId: "sequence:uc_view",
      sourceUseCaseId: "uc_view",
      sourceUseCaseName: "查看活动",
      title: "查看活动顺序图",
      summary: "查看活动流程",
      notes: [],
      participants: [
        { id: "p_user", name: "用户", participantType: "actor" as const },
      ],
      messages: [],
      fragments: [],
    },
    {
      diagramKind: "sequence" as const,
      modelId: "sequence:uc_create",
      sourceUseCaseId: "uc_create",
      sourceUseCaseName: "创建活动",
      title: "创建活动顺序图",
      summary: "创建活动流程",
      notes: [],
      participants: [
        { id: "p_user", name: "用户", participantType: "actor" as const },
      ],
      messages: [],
      fragments: [],
    },
  ];

  const normalized = normalizeDesignTraceabilityWithCoverage(
    [
      {
        source: {
          modelId: "sequence:uc_view",
          diagramKind: "sequence",
          elementId: "p_user",
          elementKind: "participant",
          label: "用户",
        },
        targets: [
          {
            diagramKind: "class",
            elementId: "domain-user",
            elementKind: "class",
            label: "UserDomain",
          },
        ],
      },
    ],
    sequenceModels,
    [requirementModel],
  );

  assert.equal(normalized.traceability.length, 1);
  assert.equal(normalized.traceability[0]?.source.modelId, "sequence:uc_view");
  assert.deepEqual(
    normalized.missingSources.map((source) => `${source.modelId}:${source.elementId}`),
    ["sequence:uc_create:p_user"],
  );
});

test("design traceability can derive relationship mappings from endpoint mappings", () => {
  const activityDesignModel = {
    diagramKind: "activity" as const,
    title: "设计活动图",
    summary: "页面流程",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "open", type: "activity" as const, name: "打开页面" },
      { id: "submit", type: "activity" as const, name: "提交表单" },
    ],
    relationships: [
      {
        id: "flow-open-submit",
        type: "control_flow" as const,
        sourceId: "open",
        targetId: "submit",
      },
    ],
  };
  const current = [
    {
      source: {
        diagramKind: "activity" as const,
        elementId: "open",
        elementKind: "activity",
        label: "打开页面",
      },
      targets: [
        {
          diagramKind: "usecase" as const,
          elementId: "usecase_generate",
          elementKind: "usecase",
          label: "生成模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "activity" as const,
        elementId: "submit",
        elementKind: "activity",
        label: "提交表单",
      },
      targets: [
        {
          diagramKind: "usecase" as const,
          elementId: "actor_researcher",
          elementKind: "actor",
          label: "研究人员",
        },
      ],
    },
  ];

  const derived = deriveDesignRelationshipTraceability(current, [
    activityDesignModel,
  ]);
  const relationship = derived.find(
    (entry) => entry.source.elementId === "flow-open-submit",
  );

  assert.equal(relationship?.mappingSource, "derived-from-endpoints");
  assert.deepEqual(
    relationship?.targets.map((target) => target.elementId).sort(),
    ["actor_researcher", "usecase_generate"],
  );
});

test("design traceability derives upstream sequence refs from shared requirement targets", () => {
  const current = [
    {
      source: {
        modelId: "sequence:uc_submit",
        diagramKind: "sequence" as const,
        elementId: "submit-message",
        elementKind: "message",
        label: "submitReservation",
      },
      targets: [
        {
          diagramKind: "class" as const,
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      ],
    },
    {
      source: {
        diagramKind: "class" as const,
        elementId: "reservation-service",
        elementKind: "class",
        label: "ReservationService",
      },
      targets: [
        {
          diagramKind: "class" as const,
          elementId: "domain-user",
          elementKind: "class",
          label: "UserDomain",
        },
      ],
    },
  ];

  const derived = deriveUpstreamDesignRefsFromTraceability(current);
  const service = derived.find(
    (entry) => entry.source.elementId === "reservation-service",
  );

  assert.equal(service?.mappingSource, "derived-from-endpoints");
  assert.equal(service?.upstreamDesignRefs?.[0]?.modelId, "sequence:uc_submit");
  assert.equal(service?.upstreamDesignRefs?.[0]?.elementId, "submit-message");
});
