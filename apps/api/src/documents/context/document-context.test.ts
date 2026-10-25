// Verifies document fallback sections keep deliverable trace matrices concise.
import assert from "node:assert/strict";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import test from "node:test";
import {
  startDocumentRunRequestSchema,
  type DocumentSection,
} from "@uml-platform/contracts";
import {
  buildDocumentContext,
  diagramPlantUmlForDocument,
  diagramSvgKindsForDocument,
  expectedDocumentDiagramKinds,
  fallbackDocumentSections,
  findForbiddenDocumentPhrases,
  findUnsupportedDocumentClaims,
} from "./document-context.js";

const INTERACTIVE_TRACE_REVIEW_PATTERN =
  /未找到明确(?:上游)?来源|请在跟踪矩阵|候选映射|需复核|自动补齐|相似度建立映射|低置信追踪关系复核|采纳|忽略|确认是否采纳/u;

test("feasibility reports reject incomplete candidate economics instead of supplying substitute facts", () => {
  const current = startDocumentRunRequestSchema.parse({
    documentKind: "feasibilityStudy", requirementText: "预约系统", feasibilityInputs: {},
    feasibilityImplementationPlan: structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE),
  });
  for (const missing of ["analysisPeriodAssumption", "costEstimates", "benefitEstimates"] as const) {
    const input = structuredClone(current);
    const implementation = input.feasibilityImplementationPlan!.candidates[0]!.implementation!;
    if (missing === "analysisPeriodAssumption") implementation.analysisPeriodAssumption = null;
    else implementation[missing] = [];
    assert.throws(() => fallbackDocumentSections(input), /当前完整实现方案/);
  }
});

function sectionTextValuesForTest(section: DocumentSection) {
  return [
    section.title,
    ...section.body,
    ...(section.table?.headers ?? []),
    ...(section.table?.rows.flat() ?? []),
  ];
}

test("software design documents omit pending traceability review appendix", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "图书馆系统需要支持借书、还书。",
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          modelId: "class:design",
          elementKind: "class",
          elementId: "BookService",
          label: "BookService",
        },
        targets: [
          {
            diagramKind: "usecase",
            modelId: "usecase:requirements",
            elementKind: "useCase",
            elementId: "UC-Borrow",
            label: "借书",
          },
        ],


      },
    ],
  });

  const sections = fallbackDocumentSections(input);

  assert.equal(
    sections.some((section) => section.title.includes("低置信追踪关系复核")),
    false,
  );
  assert.equal(
    sections.flatMap((section) => sectionTextValuesForTest(section)).some((cell) =>
      INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("software design documents preserve accepted numeric business constraints", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "报销总额达到5000元时必须由直属经理审批。",
    requirementBaseline: {
      id: "baseline-test",
      version: 1,
      sourceInputFingerprint: "test-source-input",
      runId: "run-requirements",
      schemaVersion: 3 as const,

      rules: [{ id: "R3", requirementId: "B03", text: "报销总额达到5000元（包含正好5000元）时必须由直属经理审批。", sourceFragment: "报销总额达到5000元（包含正好5000元）时必须由直属经理审批。", type: "functional" as const }],
      createdAt: "2026-07-30T00:00:00.000Z",
    },
  });

  const constraintSection = fallbackDocumentSections(input).find(
    (section) => section.title === "已确认业务约束",
  );
  assert.ok(constraintSection);
  assert.match(
    constraintSection.table?.rows.flat().join(" ") ?? "",
    /达到5000元（包含正好5000元）/u,
  );
});

test("feasibility fallback report follows the fixed A.1–A.7 template without existing-system analysis", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "feasibilityStudy",
    requirementText: "客户预约维修并在完成后支付。",
    rules: [{ id: "R1", type: "functional" as const, text: "客户可以预约维修。",  }],
    requirementModels: [{
      diagramKind: "context",
      title: "维修系统上下文",
      summary: "研究边界",
      notes: [],
      system: { id: "system", name: "维修预约系统", sourceRequirementIds: [] },
      people: [{ id: "customer", name: "客户", sourceRequirementIds: ["R1"] }],
      externalSystems: [],
      relationships: [{ id: "rel-1", sourceId: "customer", targetId: "system", direction: "bidirectional", label: "预约与确认", sourceRequirementIds: ["R1"] }],
    }],
    feasibilityInputs: { projectName: "维修预约系统" },
    feasibilityImplementationPlan: structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE),
  });

  const sections = fallbackDocumentSections(input);
  assert.deepEqual(sections.filter((section) => section.level === 1).map((section) => section.title), [
    "引言", "可行性研究的前提", "所建议的系统", "可选择的其他系统方案", "投资及效益分析", "社会因素方面的可行性", "结论",
  ]);
  assert.deepEqual(sections.filter((section) => section.level === 2 && ["引言", "可行性研究的前提"].includes(sections.slice(0, sections.indexOf(section)).filter((item) => item.level === 1).at(-1)?.title ?? "")).map((section) => section.title), [
    "编写目的", "背景", "定义", "参考资料", "要求", "目标", "条件、假定和限制", "进行可行性研究的方法", "评价尺度",
  ]);
  assert.equal(sections.some((section) => section.title.includes("对现有系统的分析")), false);
  assert.ok(sections.flatMap((section) => section.body).some((text) => text.includes("成本区间合计：CNY")));
  assert.equal(JSON.stringify(sections).includes("legacy"), false);
  assert.equal(sections.find((section) => section.title === "背景")?.diagramKind, "context");
  assert.equal(sections.find((section) => section.title === "处理流程和数据流程")?.diagramKind, undefined);
  assert.ok(sections.find((section) => section.title === "对开发的影响")?.table);
  assert.ok(sections.find((section) => section.title === "局限性")?.table);
});

test("requirements documents omit trace basis column from rule mapping tables", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "简单图书馆管理系统需要支持借书、还书和图书检索。",
    rules: [
      {
        id: "r1",
        type: "functional" as const,
        text: "系统应支持借书。",

      },
      {
        id: "r2",
        type: "functional" as const,
        text: "系统应支持图书检索。",

      },
    ],
    requirementModelTraceability: [
      {
        ruleId: "r1",
        target: {
          diagramKind: "class",
          elementKind: "class",
          elementId: "Book",
          label: "Book",
        },


      },
      {
        ruleId: "r2",
        target: {
          diagramKind: "class",
          elementKind: "class",
          elementId: "BookSearch",
          label: "图书检索",
        },


      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.title === "跟踪矩阵" && section.body.join("").includes("领域概念模型"),
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.headers, [
    "编号",
    "需求规则",
    "模型元素",
  ]);
  assert.equal(traceSection.table?.headers.includes("追踪依据"), false);
  assert.equal(traceSection.table?.rows[0]?.[1], "R1");
  assert.deepEqual(traceSection.table?.rows[1], ["2", "R2", "图书检索"]);
  assert.equal(
    traceSection.table?.rows.flat().some((cell) =>
      INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("analysis sections do not repeat unrelated global rules as direct mappings", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "用户登录系统；检索接口在100并发下响应不超过2秒。",
    rules: [
      {
        id: "r1",
        type: "functional" as const,
        text: "用户登录系统。",

      },
      {
        id: "r2",
        type: "quality" as const,
        text: "检索接口在100并发下响应不超过2秒。",

      },
    ],
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例",
        summary: "登录",
        notes: [],
        actors: [],
        useCases: [
          {
            id: "uc_login",
            name: "登录",
            goal: "进入系统",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
            eventFlows: [],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      },
      {
        diagramKind: "analysis",
        modelId: "analysis:uc_login",
        sourceUseCaseId: "uc_login",
        sourceUseCaseName: "登录",
        title: "登录分析",
        summary: "登录交互",
        notes: [],
        participants: [],
        messages: [],
        fragments: [],
      },
    ],
    useAiText: false,
  });

  const analysisTrace = fallbackDocumentSections(input).find(
    (section) =>
      section.title === "跟踪关系" &&
      section.table?.rows.some((row) => row.includes("无直接规则映射")),
  );
  assert.deepEqual(analysisTrace?.table?.rows, [
    ["1", "无直接规则映射", "由 uc_login 的已确认用例事件流派生"],
  ]);
  assert.equal(
    analysisTrace?.table?.rows.flat().includes("R2"),
    false,
  );
});

test("document grounding detects invented years and reference titles", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "建设设备预约系统，审计日志保留2年。",
  });
  const sections: DocumentSection[] = [
    {
      level: 2,
      title: "基线",
      body: ["本文档于2023年形成，参考《高校设备管理规程》。"],
    },
  ];

  assert.deepEqual(findUnsupportedDocumentClaims(input, sections), [
    "无来源年份 2023",
    "无来源参考资料《高校设备管理规程》",
  ]);
  assert.deepEqual(
    findUnsupportedDocumentClaims(input, [
      {
        level: 2,
        title: "参考资料",
        body: ["本文档为《需求规格说明书》。"],
      },
    ]),
    [],
  );
});

test("requirements documents exclude mappings rejected by trusted coverage evidence", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "用户登录后可以搜索课程。",
    rules: [
      {
        id: "r1",
        type: "functional" as const,
        text: "用户登录系统。",

      },
      {
        id: "r2",
        type: "functional" as const,
        text: "用户搜索课程。",

      },
    ],
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "用户流程",
        notes: [],
        actors: [],
        useCases: [
          {
            id: "login",
            name: "登录",
            goal: "进入系统",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
          {
            id: "search",
            name: "搜索课程",
            goal: "找到课程",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      },
    ],
    requirementModelTraceability: [
      {
        ruleId: "r2",
        target: {
          diagramKind: "usecase",
          elementKind: "usecase",
          elementId: "login",
          label: "登录",
        },
      },
      {
        ruleId: "r2",
        target: {
          diagramKind: "usecase",
          elementKind: "usecase",
          elementId: "search",
          label: "搜索课程",
        },
      },
    ],
    coverageMatrix: {
      runId: "run-trusted",
      rows: [
        {
          requirementId: "r1",
          status: "pending-review",
          rationale: "登录错误映射到搜索规则。",
          modelElements: [],
          designElements: [],
          codeArtifacts: [],
          tests: [],
          reviewItems: ["TRACE-001"],
        },
        {
          requirementId: "r2",
          status: "covered",
          rationale: "搜索用例解释搜索需求。",
          modelElements: ["usecase:search"],
          designElements: [],
          codeArtifacts: [],
          tests: [],
          reviewItems: [],
        },
      ],
    },
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.table?.rows.flat().includes("搜索课程"),
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.rows, [["1", "R2", "搜索课程"]]);
});

test("software design class matrix includes declared ID mappings", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "简单图书馆管理系统需要支持借书。",
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          modelId: "class:design",
          elementKind: "class",
          elementId: "BorrowingService",
          label: "BorrowingService",
        },

        targets: [{
            diagramKind: "usecase",
            modelId: "usecase:requirements",
            elementKind: "useCase",
            elementId: "UC-Borrow",
            label: "借书",
          }, {
            diagramKind: "sequence",
            modelId: "sequence:borrow",
            elementKind: "participant",
            elementId: "BorrowingService",
            label: "借书实现",
          }],


      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.title === "设计类跟踪矩阵",
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.headers, [
    "编号",
    "设计元素",
    "映射需求元素",
  ]);
  assert.deepEqual(traceSection.table?.rows[0], [
    "1",
    "BorrowingService",
    "用例图：借书；用例实现设计：借书实现",
  ]);
  assert.equal(
    traceSection.table?.rows.flat().some((cell) =>
      /^r\d+$/iu.test(cell) || INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("software design class matrix presents declared source labels without review states", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "简单图书馆管理系统需要支持借书。",
    designModelTraceability: [
      {
        source: {
          diagramKind: "class",
          modelId: "class:design",
          elementKind: "class",
          elementId: "BorrowingService",
          label: "BorrowingService",
        },
        targets: [
          {
            diagramKind: "usecase",
            modelId: "usecase:requirements",
            elementKind: "useCase",
            elementId: "UC-Borrow",
            label: "借书",
          },
        ],


      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.title === "设计类跟踪矩阵",
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.rows[0], [
    "1",
    "BorrowingService",
    "用例图：借书",
  ]);
  assert.equal(
    traceSection.table?.rows.flat().some((cell) =>
      INTERACTIVE_TRACE_REVIEW_PATTERN.test(cell),
    ),
    false,
  );
});

test("software design interface matrix omits trace basis column", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "简单图书馆管理系统需要支持借书。",
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "借书",
        notes: [],
        systemBoundaries: [],
        actors: [
          {
            id: "reader",
            name: "读者",
            actorType: "human",
            responsibilities: [],
          },
        ],
        useCases: [
          {
            id: "UC-Borrow",
            name: "借书",
            goal: "完成图书借阅",
            primaryActorId: "reader",
            supportingActorIds: [],
            preconditions: [],
            postconditions: [],
            eventFlows: [],
          },
        ],
        relationships: [],
      },
      {
        diagramKind: "prototype",
        title: "界面需求",
        summary: "借书界面",
        notes: [],
        nodes: [
          {
            id: "screen-borrow",
            name: "借书页面",
            nodeType: "screen",
            sourceUseCaseIds: ["UC-Borrow"],
            sourceRequirementIds: [],
          },
        ],
        relationships: [],
      },
    ],
    useAiText: false,
  });

  const traceSection = fallbackDocumentSections(input).find(
    (section) => section.table?.headers.join("|") === "编号|用例名称|界面名称",
  );

  assert.ok(traceSection);
  assert.deepEqual(traceSection.table?.rows[0], [
    "1",
    "借书",
    "借书页面",
  ]);
});

test("requirements documents use generated use case event flows", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "requirementsSpec",
    requirementText: "社团活动管理系统需要支持活动报名。",
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "活动报名",
        notes: [],
        actors: [
          {
            id: "member",
            name: "社团成员",
            actorType: "human",
            responsibilities: [],
          },
        ],
        useCases: [
          {
            id: "uc_apply",
            name: "报名活动",
            goal: "完成活动报名",
            primaryActorId: "member",
            preconditions: ["用户已登录"],
            postconditions: ["报名记录已保存"],
            supportingActorIds: [],
            eventFlows: [
              {
                id: "main_apply",
                name: "正常报名",
                flowType: "main",
                trigger: "点击报名",
                steps: [
                  {
                    order: 1,
                    actor: "actor",
                    actorAction: "选择活动",
                    systemAction: "展示活动详情",
                    expectedResult: "进入报名确认页",
                  },
                ],
              },
              {
                id: "full_apply",
                name: "名额已满",
                flowType: "exception",
                condition: "活动名额已满",
                steps: [
                  {
                    order: 1,
                    actor: "system",
                    systemAction: "提示名额已满",
                    expectedResult: "报名不被创建",
                  },
                ],
              },
            ],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      },
    ],
    useAiText: false,
  });

  const sections = fallbackDocumentSections(input);
  const useCaseSection = sections.find((section) =>
    section.title.includes("报名活动"),
  );
  const body = useCaseSection?.body.join("\n") ?? "";

  assert.match(body, /主事件流：正常报名（?[^）]*触发：点击报名/u);
  assert.match(body, /步骤 1：参与者：选择活动；系统：展示活动详情；结果：进入报名确认页/u);
  assert.match(body, /异常事件流：名额已满（条件：活动名额已满）/u);
  assert.match(body, /系统：提示名额已满；结果：报名不被创建/u);
});

test("document contexts include new diagram kinds in expected order", () => {
  assert.deepEqual(expectedDocumentDiagramKinds("requirementsSpec"), [
    "function",
    "activity",
    "usecase",
    "class",
    "deployment",
    "prototype",
    "analysis",
  ]);
  assert.deepEqual(expectedDocumentDiagramKinds("softwareDesignSpec"), [
    "architecture",
    "sequence",
    "class",
    "navigation",
    "table",
    "component",
    "deployment",
  ]);

  const requirementSections = fallbackDocumentSections(
    startDocumentRunRequestSchema.parse({
      documentKind: "requirementsSpec",
      requirementText: "订单系统需要支持创建订单。",
      useAiText: false,
    }),
  );
  assert.deepEqual(
    requirementSections
      .map((section) => section.diagramKind)
      .filter(Boolean),
    ["function", "activity", "usecase", "class", "deployment", "prototype", "analysis"],
  );

  const designSections = fallbackDocumentSections(
    startDocumentRunRequestSchema.parse({
      documentKind: "softwareDesignSpec",
      requirementText: "订单系统需要支持创建订单。",
      useAiText: false,
    }),
  );
  assert.deepEqual(
    designSections
      .filter((section) => section.diagramKind)
      .map((section) => section.diagramModelId ?? section.diagramKind),
    [
      "requirement:activity",
      "architecture",
      "sequence:UC-1",
      "class",
      "navigation",
      "table",
      "component",
      "deployment",
    ],
  );
});

test("fallback documents use logical headings and avoid placeholder prose", () => {
  const sections = fallbackDocumentSections(
    startDocumentRunRequestSchema.parse({
      documentKind: "requirementsSpec",
      requirementText: "订单系统需要支持创建订单。",
      useAiText: false,
    }),
  );

  assert.equal(sections[0]?.title, "项目引言");
  assert.ok(sections.every((section) => !/^\d/u.test(section.title)));
  assert.deepEqual(findForbiddenDocumentPhrases(sections), []);
});

test("software design documents keep per-use-case sequence diagram references", () => {
  const input = startDocumentRunRequestSchema.parse({
    documentKind: "softwareDesignSpec",
    requirementText: "社团活动管理系统需要支持活动报名和活动取消。",
    requirementModels: [
      {
        diagramKind: "usecase",
        title: "用例模型",
        summary: "活动管理",
        notes: [],
        actors: [],
        useCases: [
          {
            id: "uc_apply",
            name: "报名活动",
            goal: "完成活动报名",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
          {
            id: "uc_cancel",
            name: "取消报名",
            goal: "撤销报名记录",
            preconditions: [],
            postconditions: [],
            supportingActorIds: [],
          },
        ],
        systemBoundaries: [],
        relationships: [],
      },
    ],
    designPlantUml: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_apply",
        source: "@startuml\nparticipant A\n@enduml",
      },
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_cancel",
        source: "@startuml\nparticipant B\n@enduml",
      },
    ],
    designSvgArtifacts: [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_apply",
        svg: "<svg />",
        renderMeta: {
          engine: "plantuml",
          generatedAt: "2026-06-14T00:00:00.000Z",
          sourceLength: 28,
          durationMs: 1,
        },
      },
    ],
    requirementPlantUml: [
      {
        diagramKind: "activity",
        source: "@startuml\n:需求流程;\n@enduml",
      },
    ],
    useAiText: false,
  });

  const sequenceSections = fallbackDocumentSections(input).filter(
    (section) => section.diagramKind === "sequence",
  );
  assert.deepEqual(
    sequenceSections.map((section) => section.diagramModelId),
    ["sequence:uc_apply", "sequence:uc_cancel"],
  );

  const context = buildDocumentContext(input);
  assert.deepEqual(
    context.canonicalSections
      .filter((section) => section.diagramKind === "sequence")
      .map((section) => section.diagramModelId),
    ["sequence:uc_apply", "sequence:uc_cancel"],
  );
  assert.equal(
    diagramPlantUmlForDocument(input).get("sequence:uc_cancel"),
    "@startuml\nparticipant B\n@enduml",
  );
  assert.equal(
    diagramPlantUmlForDocument(input).get("requirement:activity"),
    "@startuml\n:需求流程;\n@enduml",
  );
  assert.equal(diagramSvgKindsForDocument(input).has("sequence:uc_apply"), true);
});
