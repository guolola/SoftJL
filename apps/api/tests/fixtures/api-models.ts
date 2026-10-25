// Supplies model and requirement fixture data for API integration scenarios.

import { buildRequirementBaseline } from "../../src/runs/baselines/requirement-baseline.js";

export const TEST_RUN_ACCESS_CONTEXT = {
  userId: "api-index-test-user",
  projectId: "api-index-test-project",
};

export const TEST_PROVIDER_CONFIG_ID = "api-index-managed-provider";

export const MANAGED_PROVIDER_SETTINGS = {
  providerConfigId: TEST_PROVIDER_CONFIG_ID,
  model: "gpt-5.5",
};

export const RULES_JSON = JSON.stringify({  rules: [{ id: "r1", text: "研究人员可以根据文本需求生成 UML 模型。", sourceFragment: "实验平台根据文本需求生成模型和 UML 图。", type: "functional" as const }] });

export const TEST_REQUIREMENT_BASELINE = buildRequirementBaseline({
  runId: "api-index-baseline",
  requirementText: "实验平台根据文本需求生成模型和 UML 图。",
  rules: JSON.parse(RULES_JSON).rules,
});

export const CLASSIFIED_RULES_JSON = JSON.stringify({
  rules: [
    {
      id: "r1",
      type: "functional" as const,
      text: "用户通过微信登录、查座、预约和签到。",
      sourceFragment: "共享自习室座位预约系统支持微信登录、查座、预约和签到。",

    },
    {
      id: "r2",
      type: "quality" as const,
      text: "接口请求做合法性校验，防止恶意预约。",
      sourceFragment: "接口请求做合法性校验，防止恶意预约。",

    },
    {
      id: "r3",
      type: "quality" as const,
      text: "系统支持至少100人同时在线使用，页面加载速度小于2秒。",
      sourceFragment: "系统支持至少100人同时在线使用，页面加载速度小于2秒。",

    },
  ],
});

export const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

export const DOCUMENT_WORKSPACE_HEADERS = {
  "x-uml-workspace-id": "api-test-workspace",
  "x-uml-workspace-secret": "api-test-workspace-secret-value-123456",
};

export const USECASE_MODEL_JSON = JSON.stringify({
  models: [
    {
      diagramKind: "usecase",
      title: "实验平台用例",
      summary: "主要参与者和用例",
      notes: ["仅包含核心流程"],
      actors: [
        {
          id: "actor_researcher",
          name: "研究人员",
          actorType: "human",
          responsibilities: ["发起生成请求"],
        },
      ],
      useCases: [
        {
          id: "usecase_generate",
          systemBoundaryId: "boundary_platform",
          name: "生成模型",
          goal: "根据需求生成 UML 模型",
          preconditions: ["已输入需求文本"],
          postconditions: ["系统返回结构化模型与图"],
          primaryActorId: "actor_researcher",
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [
        {
          id: "boundary_platform",
          name: "实验平台",
        },
      ],
      relationships: [
        {
          id: "rel_association_1",
          sourceId: "actor_researcher",
          targetId: "usecase_generate",
          type: "association",
          label: "发起",
        },
      ],
    },
  ],
  requirementModelTraceability: [
    { ruleId: "r1", target: { diagramKind: "usecase", elementId: "boundary_platform", elementKind: "system-boundary", label: "实验平台" } },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "actor_researcher",
        elementKind: "actor",
        label: "研究人员",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "usecase_generate",
        elementKind: "usecase",
        label: "生成模型",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "usecase",
        elementId: "rel_association_1",
        elementKind: "relationship",
        label: "发起",
      },
    },
  ],
});

export const ACTIVITY_MODEL = {
  diagramKind: "activity" as const,
  title: "活动流程",
  summary: "带泳道的活动图",
  notes: [],
  swimlanes: [
    { id: "lane_user", name: "用户" },
    { id: "lane_system", name: "系统" },
  ],
  nodes: [
    { id: "start", type: "start", name: "开始" },
    {
      id: "submit",
      type: "activity",
      name: "提交需求",
      actorOrLane: "lane_user",
      input: ["需求"],
      output: ["请求"],
    },
    {
      id: "generate",
      type: "activity",
      name: "生成模型",
      actorOrLane: "lane_system",
      input: ["请求"],
      output: ["模型"],
    },
    { id: "end", type: "end", name: "结束" },
  ],
  relationships: [
    { id: "flow_start", type: "control_flow", sourceId: "start", targetId: "submit" },
    { id: "flow_submit", type: "control_flow", sourceId: "submit", targetId: "generate" },
    { id: "flow_generate", type: "control_flow", sourceId: "generate", targetId: "end" },
  ],
};

export const PROTOTYPE_MODEL = {
  diagramKind: "prototype" as const,
  title: "原型界面关系",
  summary: "模型生成工作台页面关系",
  notes: [],
  nodes: [
    {
      id: "screen_input",
      name: "需求输入页",
      nodeType: "screen",
      route: "/requirements",
      sourceUseCaseIds: ["usecase_generate"],
      sourceRequirementIds: ["r1"],
    },
    {
      id: "screen_result",
      name: "模型结果页",
      nodeType: "screen",
      route: "/models",
      sourceUseCaseIds: ["usecase_generate"],
      sourceRequirementIds: ["r1"],
    },
  ],
  relationships: [
    {
      id: "proto_submit",
      type: "submits",
      sourceId: "screen_input",
      targetId: "screen_result",
      label: "提交后查看模型结果",
      trigger: "点击生成模型",
    },
  ],
};

export const CLASS_MODEL = {
  diagramKind: "class" as const,
  title: "领域概念模型",
  summary: "文本需求与 UML 模型领域对象",
  notes: [],
  classes: [
    {
      id: "user",
      name: "文本需求",
      classKind: "entity",
      attributes: [
        {
          name: "id",
          type: "INT",
          visibility: "public",
          required: true,
        },
        {
          name: "content",
          type: "VARCHAR(100)",
          visibility: "public",
          required: true,
        },
      ],
      operations: [],
    },
    {
      id: "order",
      name: "UML模型",
      classKind: "entity",
      attributes: [
        {
          name: "id",
          type: "INT",
          visibility: "public",
          required: true,
        },
        {
          name: "requirementId",
          type: "INT",
          visibility: "public",
          required: true,
        },
      ],
      operations: [],
    },
  ],
  interfaces: [],
  enums: [],
  relationships: [
    {
      id: "rel_user_order",
      type: "association",
      sourceId: "user",
      targetId: "order",
      sourceMultiplicity: "1",
      targetMultiplicity: "0..*",
      label: "生成",
    },
  ],
};

export const MULTI_MODEL_JSON = JSON.stringify({
  models: [JSON.parse(USECASE_MODEL_JSON).models[0], ACTIVITY_MODEL],
  requirementModelTraceability: [
    ...JSON.parse(USECASE_MODEL_JSON).requirementModelTraceability,
    ...["lane_user", "lane_system", "start", "end", "flow_start", "flow_generate"].map(elementId => ({
      ruleId: "r1", target: { diagramKind: "activity", elementId, elementKind: "element", label: elementId },
    })),
    {
      ruleId: "r1",
      target: {
        diagramKind: "activity",
        elementId: "submit",
        elementKind: "activity",
        label: "提交需求",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "activity",
        elementId: "generate",
        elementKind: "activity",
        label: "生成模型",
      },
    },
    {
      ruleId: "r1",
      target: {
        diagramKind: "activity",
        elementId: "flow_submit",
        elementKind: "relationship",
        label: "submit -> generate",
      },
    },
  ],
});

export const USECASE_REQUIREMENT_TRACEABILITY =
  JSON.parse(USECASE_MODEL_JSON).requirementModelTraceability;

export const PROTOTYPE_REQUIREMENT_TRACEABILITY = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "prototype",
      elementId: "screen_input",
      elementKind: "screen",
      label: "需求输入页",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "prototype",
      elementId: "screen_result",
      elementKind: "screen",
      label: "模型结果页",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "prototype",
      elementId: "proto_submit",
      elementKind: "relationship",
      label: "提交后查看模型结果",
    },
  },
];

export const CLASS_REQUIREMENT_TRACEABILITY = [
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "user",
      elementKind: "class",
      label: "文本需求",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "order",
      elementKind: "class",
      label: "UML模型",
    },
  },
  {
    ruleId: "r1",
    target: {
      diagramKind: "class",
      elementId: "rel_user_order",
      elementKind: "relationship",
      label: "生成",
    },
  },
];

export const DESIGN_SEQUENCE_MODEL = {
  diagramKind: "sequence" as const,
  modelId: "sequence:usecase_generate",
  sourceUseCaseId: "usecase_generate",
  sourceUseCaseName: "生成模型",
  title: "生成模型顺序",
  summary: "用户触发生成后的对象调用",
  notes: ["设计阶段动态行为"],
  participants: [
    {
      id: "actor_researcher",
      name: "研究人员",
      participantType: "actor",
    },
    {
      id: "ui",
      name: "Web 页面",
      participantType: "boundary",
    },
    {
      id: "api",
      name: "编排 API",
      participantType: "control",
    },
  ],
  messages: [
    {
      id: "msg_submit",
      type: "sync",
      sourceId: "actor_researcher",
      targetId: "ui",
      name: "submitTextRequirement",
      parameters: ["文本需求"],
      description: "研究人员提交文本需求。",
    },
    {
      id: "msg_start",
      type: "sync",
      sourceId: "ui",
      targetId: "api",
      name: "generateUmlModel",
      parameters: ["selectedDiagrams", "UML 模型"],
      returnValue: "runId 与 UML 模型生成结果",
    },
  ],
  fragments: [],
};

export const DESIGN_SEQUENCE_JSON = JSON.stringify({
  models: [DESIGN_SEQUENCE_MODEL],
  designModelTraceability: [
    {
      source: {
        modelId: "sequence:usecase_generate",
        diagramKind: "sequence",
        elementId: "actor_researcher",
        elementKind: "participant",
        label: "研究人员",
      },
      targets: [
        {
          diagramKind: "usecase",
          elementId: "actor_researcher",
          elementKind: "actor",
          label: "研究人员",
        },
      ],
    },
    {
      source: {
        modelId: "sequence:usecase_generate",
        diagramKind: "sequence",
        elementId: "ui",
        elementKind: "participant",
        label: "Web 页面",
      },
      targets: [
        {
          diagramKind: "usecase",
          elementId: "usecase_generate",
          elementKind: "usecase",
          label: "生成模型",
        },
      ],
    },
    {
      source: {
        modelId: "sequence:usecase_generate",
        diagramKind: "sequence",
        elementId: "api",
        elementKind: "participant",
        label: "编排 API",
      },
      targets: [
        {
          diagramKind: "usecase",
          elementId: "usecase_generate",
          elementKind: "usecase",
          label: "生成模型",
        },
      ],
    },
    {
      source: {
        modelId: "sequence:usecase_generate",
        diagramKind: "sequence",
        elementId: "msg_submit",
        elementKind: "message",
        label: "submitRequirement",
      },
      targets: [
        {
          diagramKind: "usecase",
          elementId: "usecase_generate",
          elementKind: "usecase",
          label: "生成模型",
        },
      ],
    },
    {
      source: {
        modelId: "sequence:usecase_generate",
        diagramKind: "sequence",
        elementId: "msg_start",
        elementKind: "message",
        label: "startRun",
      },
      targets: [
        {
          diagramKind: "usecase",
          elementId: "usecase_generate",
          elementKind: "usecase",
          label: "生成模型",
        },
      ],
    },
  ],
});

export const DESIGN_NAVIGATION_JSON = JSON.stringify({
  models: [{ ...PROTOTYPE_MODEL, diagramKind: "navigation", modelId: "navigation", title: "页面导航", summary: "需求界面的实现路由" }],
  designModelTraceability: PROTOTYPE_REQUIREMENT_TRACEABILITY.map((entry) => ({ source: { ...entry.target, diagramKind: "navigation", modelId: "navigation" }, targets: [entry.target] })),
});

export const DESIGN_CLASS_AND_TABLE_JSON = JSON.stringify({
  models: [
    {
      ...CLASS_MODEL,
      title: "设计类图",
      summary: "设计阶段静态结构",
      classes: CLASS_MODEL.classes.map((item) => ({
        ...item,
        operations: [
          {
            name: "save",
            returnType: "void",
            visibility: "public",
            parameters: [],
          },
        ],
      })),
    },
    {
      diagramKind: "table",
      title: "表关系图",
      summary: "文本需求与 UML 模型表关系",
      notes: [],
      tables: [
        {
          id: "user",
          name: "需求",
          relationalConstraints: [{ id: "pk_user", type: "primary-key", columnIds: ["id"] }],
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
          ],
        },
        {
          id: "order",
          name: "UML模型",
          relationalConstraints: [{ id: "pk_order", type: "primary-key", columnIds: ["id"] }, { id: "rel_user_order_table", type: "foreign-key", columnIds: ["user_id"], referenceTableId: "user", referenceColumnIds: ["id"] }],
          columns: [
            {
              id: "id",
              name: "id",
              dataType: "INT",
              isPrimaryKey: true,
              isForeignKey: false,
              nullable: false,
            },
            {
              id: "user_id",
              name: "requirement_id",
              dataType: "INT",
              isPrimaryKey: false,
              isForeignKey: true,
              nullable: false,
              references: { tableId: "user", columnId: "id" },
            },
          ],
        },
      ],
      relationships: [
        {
          id: "order.rel_user_order_table",
          type: "one-to-many",
          sourceTableId: "user",
          targetTableId: "order",
          label: "需求生成模型",
        },
      ],
    },
  ],
  designModelTraceability: [
    ...["user", "order"].map(elementId => ({
      source: { diagramKind: "table", elementId: `${elementId}.pk_${elementId}`, elementKind: "relational-constraint", label: `pk_${elementId}` },
      targets: [{ diagramKind: "class", elementId, elementKind: "class", label: elementId }],
    })),
    {
      source: {
        diagramKind: "class",
        elementId: "user",
        elementKind: "class",
        label: "文本需求",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "class",
        elementId: "order",
        elementKind: "class",
        label: "UML模型",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "order",
          elementKind: "class",
          label: "UML模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "class",
        elementId: "rel_user_order",
        elementKind: "relationship",
        label: "生成",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "rel_user_order",
          elementKind: "relationship",
          label: "生成",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "user",
        elementKind: "table",
        label: "需求",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "user.id",
        elementKind: "table-column",
        label: "user.id",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order",
        elementKind: "table",
        label: "UML模型",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "order",
          elementKind: "class",
          label: "UML模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order.id",
        elementKind: "table-column",
        label: "order.id",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "order",
          elementKind: "class",
          label: "UML模型",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order.user_id",
        elementKind: "table-column",
        label: "UML模型.requirement_id",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "user",
          elementKind: "class",
          label: "文本需求",
        },
      ],
    },
    {
      source: {
        diagramKind: "table",
        elementId: "order.rel_user_order_table",
        elementKind: "relationship",
        label: "需求生成模型",
      },
      targets: [
        {
          diagramKind: "class",
          elementId: "rel_user_order",
          elementKind: "relationship",
          label: "生成",
        },
      ],
    },
  ],
});
