// Verifies prompt builders preserve stage responsibilities, output constraints, and traceability instructions.
import assert from "node:assert/strict";
import test from "node:test";
import type { RequirementBaseline, RequirementRule } from "@uml-platform/contracts";
import {
  
  
  
  
  
  
  
  
  
  
  
  
  buildExtractRulesPrompt,
  buildRepairExtractedRulesPrompt,
  buildGenerateDesignTraceabilityPrompt,
  buildGenerateDesignSequencePrompt,
  buildGenerateRequirementTraceabilityPrompt,
  buildGenerateDocumentContentPrompt,
  buildGenerateDesignModelsPrompt,
  buildGenerateModelsPrompt,
  buildGenerateRequirementAnalysisPrompt,
  
  buildRepairDesignModelsPrompt,
  buildRepairDesignTraceabilityPrompt,
  buildRepairModelsPrompt,
  buildRepairRequirementTraceabilityPrompt,
  
} from "./index.js";

const sampleRules: RequirementRule[] = [
  {
    id: "r1",
    category: "功能需求",
    text: "用户可以提交需求",
    relatedDiagrams: ["function", "usecase", "class", "activity", "deployment", "prototype", "analysis"],
  },
];

const sampleBaseline: RequirementBaseline = {
  runId: "run-1",
  sourceDocumentId: "inline-requirement",
  requirements: [
    {
      id: "REQ-001",
      sourceFragment: "用户可以提交需求",
      type: "functional",
      actor: "用户",
      subject: "用户",
      action: "提交",
      object: "需求",
      condition: null,
      outcome: "需求被系统接收",
      confidence: 0.9,
      status: "accepted",
      criticality: "critical",
      acceptanceCriteria: ["验证用户可以提交需求"],
      fieldProvenance: {},
      priority: "must",
      sourceRuleId: "r1",
    },
  ],
  assumptions: [],
  conflicts: [],
  qualityReport: {
    runId: "run-1",
    status: "passed",
    summary: "需求基线已通过",
    issues: [],
    blockingIssueIds: [],
    reviewRequiredRequirementIds: [],
  },
  createdAt: "2026-01-01T00:00:00.000Z",
};

test("rule extraction prompt separates readable text from source fragments", () => {
  const prompt = buildExtractRulesPrompt("一个小型图书馆管理系统需完成：(1)借书。");

  assert.match(prompt, /可读需求文本 text/);
  assert.match(prompt, /sourceFragment/);
  assert.match(prompt, /relatedDiagrams 只能使用: function, usecase/);
  assert.match(prompt, /不要只输出“\(1\)借书”/);
  assert.ok(prompt.includes('{"rules":[...]}'));
});

test("rule extraction repair prompt appends a diagnosis without restarting the task", () => {
  const prompt = buildRepairExtractedRulesPrompt('rules: Expected array, received undefined');
  assert.match(prompt, /上一条需求规则抽取 JSON/);
  assert.match(prompt, /只修改错误涉及的字段/);
  assert.match(prompt, /保留其他规则和已有业务含义/);
  assert.match(prompt, /rules: Expected array, received undefined/);
  assert.ok(prompt.includes('{"rules":[...]}'));
  assert.doesNotMatch(prompt, /原始需求：/);
});

test("requirement model prompts include requirement-stage responsibilities", () => {
  const prompt = buildGenerateModelsPrompt(sampleRules, sampleBaseline, [
    "function",
    "usecase",
    "class",
    "activity",
    "deployment",
  ]);

  assert.match(prompt, /需求阶段模型职责/);
  assert.match(prompt, /功能结构图\(function\): 只根据功能需求\/业务规则抽取系统功能层级/);
  assert.match(prompt, /PlantUML MindMap/);
  assert.match(prompt, /用例模型\(usecase\): 明确系统边界/);
  assert.match(prompt, /领域概念模型\(class\): 只描述业务领域内的核心概念实体/);
  assert.match(prompt, /禁止输出 \*Service/);
  assert.match(prompt, /operations 必须输出 \[\] 或省略/);
  assert.match(prompt, /总体业务流程\(activity\): 描述跨角色的业务活动/);
  assert.match(prompt, /重复业务步骤必须合并为一个 activity 节点/);
  assert.match(prompt, /部署需求模型\(deployment\): 描述需求阶段可识别的部署约束/);
  assert.match(prompt, /JSON 必须完整合法/);
  assert.match(prompt, /sourceId 和 targetId/);
  assert.match(prompt, /port.*字符串/);
  assert.match(prompt, /图上关系短标签约束/);
  assert.match(prompt, /不能塞进图上的 label\/name\/condition\/guard\/trigger/);
  assert.match(prompt, /label 写“加密访问”/);
  assert.match(prompt, /requirementModelTraceability 可以返回空数组/);
  assert.match(prompt, /模型结构生成成功后由系统分批补齐/);
  assert.match(prompt, /RequirementBaseline（结构化需求事实和约束）/);
  assert.match(prompt, /达到\/至少\/不低于\/以上必须保持为 >=/);
  assert.match(prompt, /正好等于阈值的路径/);
  assert.doesNotMatch(prompt, /原始需求：/);
  assert.doesNotMatch(prompt, /用户登录后进入首页/);
});

test("requirement repair prompt preserves requirement-stage responsibilities", () => {
  const prompt = buildRepairModelsPrompt(
    sampleRules,
    sampleBaseline,
    ["activity"],
    '{"models":[]}',
    "models.0.nodes: Required",
  );

  assert.match(prompt, /需求阶段模型职责/);
  assert.match(prompt, /总体业务流程\(activity\): 描述跨角色的业务活动/);
  assert.match(prompt, /relationships\[\] 必须显式包含 sourceId 和 targetId/);
  assert.match(prompt, /deployment\.relationships\[\]\.port 必须是字符串/);
  assert.match(prompt, /若校验指出阈值语义冲突/);
});

test("requirement analysis repair prompt allows empty traceability", () => {
  const prompt = buildRepairModelsPrompt(
    [],
    sampleBaseline,
    ["analysis"],
    '{"models":[],"requirementModelTraceability":[]}',
    "analysis JSON 结构不合法",
  );

  assert.match(prompt, /本次修复需求分析模型/);
  assert.match(prompt, /requirementModelTraceability 必须允许为空数组/);
  assert.doesNotMatch(prompt, /requirementModelTraceability 必须是非空数组/);
});

test("single requirement model prompts forbid cross-diagram substitutions", () => {
  const classPrompt = buildGenerateModelsPrompt(sampleRules, sampleBaseline, ["class"]);
  assert.match(classPrompt, /领域概念模型\(class\) 单图生成任务/);
  assert.match(classPrompt, /models\.length 必须为 1/);
  assert.match(classPrompt, /models\[0\]\.diagramKind 必须严格等于 "class"/);
  assert.match(classPrompt, /禁止输出其它任何 diagramKind/);
  assert.match(classPrompt, /禁止输出 swimlanes\/nodes 作为主结构/);
  assert.match(classPrompt, /禁止生成总体业务流程/);

  const deploymentRepairPrompt = buildRepairModelsPrompt(
    sampleRules,
    sampleBaseline,
    ["deployment"],
    '{"models":[{"diagramKind":"prototype","nodes":[]}]}',
    "expected deployment, received prototype",
  );
  assert.match(deploymentRepairPrompt, /部署需求模型\(deployment\) 单图生成任务/);
  assert.match(deploymentRepairPrompt, /models\[0\]\.diagramKind 必须严格等于 "deployment"/);
  assert.match(deploymentRepairPrompt, /必须丢弃错图/);
  assert.match(deploymentRepairPrompt, /禁止输出原型界面 screen\/module\/entry-point 结构/);
  assert.doesNotMatch(deploymentRepairPrompt, /prototype: 必须包含 nodes, relationships/);
  assert.doesNotMatch(deploymentRepairPrompt, /nodeType\(screen\|module\|entry-point\)/);
});

test("requirement traceability prompts only ask for element mappings", () => {
  const model = {
    diagramKind: "usecase" as const,
    title: "用例模型",
    summary: "系统边界",
    notes: [],
    actors: [{ id: "user", name: "用户", actorType: "human" as const, responsibilities: [] }],
    useCases: [
      {
        id: "uc1",
        name: "提交需求",
        goal: "提交需求文本",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const prompt = buildGenerateRequirementTraceabilityPrompt(
    [{ id: "r1", category: "功能需求", text: "用户可以提交需求", relatedDiagrams: ["usecase"] }],
    sampleBaseline,
    [model],
  );

  assert.match(prompt, /返回格式必须是 \{"requirementModelTraceability":\[\.\.\.\]\}/);
  assert.match(prompt, /只输出能从规则文本和模型元素语义直接证明/);
  assert.match(prompt, /target\.diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis/);
  assert.match(prompt, /禁止把 requirements、requirement、design、model、traceability、page/);
  assert.match(prompt, /每一个需求业务元素和 relationship 都必须至少映射到一条需求规则/);
  assert.match(prompt, /不要为 system-boundary、swimlane、start\/end\/merge\/fork\/join/);
  assert.match(prompt, /reviewStatus=pending、confidence=low/);
  assert.match(prompt, /allowedTargets（唯一可引用目标清单/);
  assert.match(prompt, /target 必须从 allowedTargets 清单原样复制/);
  assert.match(prompt, /"elementId": "uc1"/);
  assert.match(prompt, /禁止返回 null，直接省略 modelId/);
  assert.doesNotMatch(prompt, /返回格式必须是 \{"models"/);

  const repairPrompt = buildRepairRequirementTraceabilityPrompt(
    [],
    sampleBaseline,
    [model],
    "{}",
    "requirementModelTraceability: Required",
    [
      {
        diagramKind: "usecase",
        elementId: "uc1",
        elementKind: "usecase",
        label: "提交需求",
      },
    ],
  );
  assert.match(repairPrompt, /不要修改模型；只修复映射数组/);
  assert.match(repairPrompt, /必须补齐的缺失业务元素清单/);
  assert.match(repairPrompt, /"elementId": "uc1"/);
  assert.match(repairPrompt, /allowedTargets（唯一可引用目标清单/);
  assert.match(repairPrompt, /包含 modelId 的目标必须保留 modelId/);
  assert.match(repairPrompt, /如果错误提示包含非法 diagramKind/);
});

test("design model prompt keeps design-stage activity semantics", () => {
  const prompt = buildGenerateDesignModelsPrompt(
    sampleBaseline,
    [],
    [
      {
        diagramKind: "sequence",
        modelId: "sequence:uc_login",
        sourceUseCaseId: "uc_login",
        sourceUseCaseName: "登录",
        title: "登录顺序图",
        summary: "动态行为",
        notes: [],
        participants: [],
        messages: [],
        fragments: [],
      },
    ],
    ["activity"],
  );

  assert.match(prompt, /设计阶段模型职责/);
  assert.match(prompt, /总体架构图\(architecture\): 系统逻辑架构层/);
  assert.match(prompt, /界面关系图\(activity\): 界面交互层/);
  assert.match(prompt, /组件（构件）关系\(component\): 组件结构层/);
  assert.match(prompt, /architecture: 必须包含 packages, components, relationships/);
  assert.match(prompt, /component: 必须包含 components, interfaces, relationships/);
  assert.match(prompt, /activity 表达设计阶段界面关系图/);
  assert.match(prompt, /多分支 alt 必须优先输出 branches/);
  assert.match(prompt, /PlantUML alt\/else\/end 分隔线/);
  assert.match(prompt, /图上关系短标签约束/);
  assert.match(prompt, /deployment 的 protocol、port 必须分别写入 protocol、port 字段/);
  assert.match(prompt, /notes 永远是字符串数组/);
  assert.match(prompt, /response\/reply\/result 必须写 return/);
  assert.match(prompt, /classKind 只能使用 entity\|aggregate\|valueObject\|service\|other/);
  assert.match(prompt, /全部用例实现设计/);
  assert.match(prompt, /modelId/);
  assert.match(prompt, /sourceUseCaseId/);
  assert.match(prompt, /下游聚合设计模型/);
  assert.match(prompt, /必须返回 designModelTraceability: \[\]/);
  assert.match(prompt, /系统会在模型结构解析成功后按元素清单确定性补齐可追踪关系/);
  assert.match(prompt, /不要为了可追踪矩阵输出长映射数组/);
  assert.doesNotMatch(prompt, /矩阵会展示的每一个设计业务元素和 relationship 都必须至少映射到一个需求模型元素/);
  assert.match(prompt, /设计阶段禁止使用原始需求文本作为事实来源/);
  assert.match(prompt, /RequirementBaseline（只用于约束和验收边界）/);
  assert.doesNotMatch(prompt, /原始需求：/);
  assert.doesNotMatch(prompt, /用户登录后进入首页/);

  const repairPrompt = buildRepairDesignModelsPrompt(
    sampleBaseline,
    ["sequence"],
    '{"models":[]}',
    "models.0.notes: Required",
  );
  assert.match(repairPrompt, /按错误路径逐项修复/);
  assert.match(repairPrompt, /不要改变原有业务语义/);
  assert.match(repairPrompt, /图上关系短标签约束/);
});

test("design sequence prompt requires one sequence per use case", () => {
  const useCaseModel = {
    diagramKind: "usecase" as const,
    title: "用例模型",
    summary: "系统边界",
    notes: [],
    actors: [],
    useCases: [
      {
        id: "uc_view",
        name: "查看活动",
        goal: "查看活动",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
      {
        id: "uc_create",
        name: "创建活动",
        goal: "创建活动",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const prompt = buildGenerateDesignSequencePrompt(sampleBaseline, useCaseModel);

  assert.match(prompt, /每个 useCase 必须生成一个独立用例实现设计/);
  assert.match(prompt, /models\.length 必须等于 useCases\.length/);
  assert.match(prompt, /modelId = sequence:<useCaseId>/);
  assert.match(prompt, /sourceUseCaseId/);
  assert.match(prompt, /sourceUseCaseName/);
  assert.match(prompt, /boundary\/controller\/service\/entity\/database/);
  assert.match(prompt, /方法调用/);
  assert.match(prompt, /不能原样复用参与者和消息/);
  assert.match(prompt, /必须返回 designModelTraceability: \[\]/);
  assert.match(prompt, /系统会在模型结构解析成功后按元素清单确定性补齐可追踪关系/);
  assert.doesNotMatch(prompt, /矩阵会展示的每一个设计业务元素和 relationship 都必须至少映射到一个需求模型元素/);
  assert.match(prompt, /"id": "uc_view"/);
  assert.match(prompt, /"id": "uc_create"/);
  assert.doesNotMatch(prompt, /原始需求：/);
  assert.doesNotMatch(prompt, /活动日历/);
});

test("requirement analysis prompt scopes one sequence to one use case event flow", () => {
  const useCaseModel = {
    diagramKind: "usecase" as const,
    title: "用例模型",
    summary: "系统边界",
    notes: [],
    actors: [{ id: "customer", name: "客户", actorType: "human" as const, responsibilities: [] }],
    useCases: [
      {
        id: "uc_reserve",
        name: "预约座位",
        goal: "完成座位预约",
        preconditions: ["用户已登录"],
        postconditions: ["预约记录已创建"],
        supportingActorIds: [],
        eventFlows: [
          {
            id: "flow_main",
            name: "主成功场景",
            type: "main" as const,
            steps: [
              {
                order: 1,
                actorAction: "客户选择日期和座位",
                systemResponse: "系统校验座位可用并创建预约",
              },
            ],
          },
        ],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const prompt = buildGenerateRequirementAnalysisPrompt(useCaseModel);

  assert.match(prompt, /models 只包含 diagramKind 为 analysis 的需求分析模型/);
  assert.match(prompt, /你必须且只能输出一个 analysis 模型/);
  assert.match(prompt, /modelId 必须是 analysis:<sourceUseCaseId>/);
  assert.match(prompt, /必须来自该 useCase\.eventFlows/);
  assert.match(prompt, /需求语义短语/);
  assert.match(prompt, /禁止使用 deleteEvent\(eventId\)、remove\(\)、save\(\) 等方法调用写法/);
  assert.match(prompt, /禁止加入设计阶段类名、Service、DAO、Repository、Controller、数据库/);
  assert.match(prompt, /requirementModelTraceability 必须返回空数组/);
  assert.match(prompt, /单用例需求阶段用例模型（唯一分析来源）/);
  assert.match(prompt, /"id": "uc_reserve"/);
  assert.match(prompt, /"actorAction": "客户选择日期和座位"/);
  assert.doesNotMatch(prompt, /原始需求：/);
  assert.doesNotMatch(prompt, /客户预约自习室座位/);
  assert.doesNotMatch(prompt, /已确认需求项：/);
  assert.doesNotMatch(prompt, /RequirementBaseline（/);
  assert.match(prompt, /禁止使用原始需求文本、需求规则或 RequirementBaseline/);
});

test("design traceability prompts only ask for design-to-requirement mappings", () => {
  const requirementModel = {
    diagramKind: "usecase" as const,
    title: "用例模型",
    summary: "系统边界",
    notes: [],
    actors: [],
    useCases: [
      {
        id: "uc1",
        name: "提交需求",
        goal: "提交需求文本",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
    ],
    systemBoundaries: [],
    relationships: [],
  };
  const designModel = {
    diagramKind: "sequence" as const,
    title: "顺序图",
    summary: "动态行为",
    notes: [],
    participants: [
      { id: "user", name: "用户", participantType: "actor" as const },
      { id: "system", name: "系统", participantType: "control" as const },
    ],
    messages: [
      {
        id: "m1",
        type: "sync" as const,
        sourceId: "user",
        targetId: "system",
        name: "submit",
        parameters: [],
      },
    ],
    fragments: [],
  };
  const prompt = buildGenerateDesignTraceabilityPrompt(
    sampleBaseline,
    [requirementModel],
    [designModel],
    [
      {
        diagramKind: "sequence",
        elementId: "m1",
        elementKind: "message",
        label: "submit",
      },
    ],
  );

  assert.match(prompt, /返回格式必须是 \{"designModelTraceability":\[\.\.\.\]\}/);
  assert.match(prompt, /requiredSources/);
  assert.match(prompt, /designModelTraceability\.length 必须等于 requiredSources\.length/);
  assert.match(prompt, /"elementId": "m1"/);
  assert.match(prompt, /不要把整张需求模型套给每个设计元素/);
  assert.match(prompt, /允许派生映射/);
  assert.match(prompt, /source\.diagramKind 只能使用: architecture, sequence, class, activity, component, deployment, table/);
  assert.match(prompt, /targets\[\]\.diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis/);
  assert.match(prompt, /每一个设计业务元素和 relationship 都必须至少映射到一个需求模型元素/);
  assert.match(prompt, /不要为 swimlane、start\/end\/merge\/fork\/join/);
  assert.match(prompt, /reviewStatus=pending、confidence=low/);
  assert.doesNotMatch(prompt, /返回格式必须是 \{"models"/);

  const repairPrompt = buildRepairDesignTraceabilityPrompt(
    sampleBaseline,
    [requirementModel],
    [designModel],
    "{}",
    "designModelTraceability: Required",
    [
      {
        diagramKind: "sequence",
        elementId: "m1",
        elementKind: "message",
        label: "submit",
      },
    ],
  );
  assert.match(repairPrompt, /不要修改模型；只修复映射数组/);
  assert.match(repairPrompt, /必须补齐的缺失业务元素清单/);
  assert.match(repairPrompt, /"elementId": "m1"/);
  assert.match(repairPrompt, /禁止把 requirements、requirement、design、model、traceability、page/);
});

test("code generation prompts use business background theme and modular files", () => {
  const codeContext = {
    authority: "Design Model Only",
    designModels: [
      {
        diagramKind: "architecture",
        title: "校园活动架构",
        summary: "前端模块和活动服务边界。",
        notes: [],
        packages: [{ id: "pkg-events", name: "活动模块", componentIds: ["cmp-events"] }],
        components: [{ id: "cmp-events", name: "活动工作台", packageId: "pkg-events" }],
        relationships: [],
      },
    ],
    
  };

  const specPrompt = buildGenerateCodeSpecPrompt([]);
  const planPrompt = buildGenerateCodeAgentPlanPrompt(codeContext, {
    "/src/App.tsx": "",
  });
  const appBlueprintPrompt = buildGenerateCodeAppBlueprintPrompt([]);
  
  
  const uiBlueprintPrompt = buildGenerateCodeUiBlueprintPrompt(
    codeContext,
    appBlueprint,
  );
  const businessLogic = {
    appName: "校园活动平台",
    domainSummary: "面向学生的活动浏览、报名与提醒服务。",
    coreWorkflow: "浏览活动，查看详情，报名并接收提醒。",
    actors: [
      {
        id: "student",
        name: "学生",
        type: "human",
        responsibilities: ["浏览活动", "提交报名"],
      },
    ],
    businessEntities: [
      {
        id: "activity",
        name: "活动",
        description: "校园活动信息",
        fields: ["id:string", "title:string", "status:string"],
        relationships: ["活动包含报名记录"],
      },
    ],
    pageFlows: [
      {
        id: "overview",
        name: "活动总览",
        route: "/",
        purpose: "浏览活动列表",
        actors: ["学生"],
        entryPoints: ["进入系统"],
        userActions: ["筛选活动", "查看详情"],
        states: ["空列表", "可报名", "已满员"],
        sourceRefs: ["activity"],
      },
      {
        id: "detail",
        name: "活动详情",
        route: "/detail",
        purpose: "查看详情并报名",
        actors: ["学生"],
        entryPoints: ["点击活动"],
        userActions: ["提交报名"],
        states: ["未报名", "报名成功"],
        sourceRefs: ["sequence"],
      },
    ],
    stateMachines: [],
    permissions: [],
    edgeCases: ["活动已满时禁止报名"],
    frontendOperations: ["筛选活动", "提交报名", "查看提醒"],
    plantUmlTraceability: ["class:Activity", "sequence:signup"],
  };
  
  const filePlanPrompt = buildGenerateCodeFilePlanPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
    null,
    null,
    null,
    {},
    [
      {
        name: "react-prototype-quality",
        description: "提升 React 原型质量",
        source: "builtin",
        location: "apps/api/src/code-skills/builtin/react-prototype-quality/SKILL.md",
        appliesTo: ["planning", "implementation"],
        priority: 82,
        reason: "默认启用",
      },
    ],
  );
  const uiMockupPrompt = buildGenerateCodeUiMockupPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
  );
  
  
  
  const operationsPrompt = buildGenerateCodeFileOperationsPrompt(
    codeContext,
    {},
    {
      businessLogic,
      
      
      
      
      
      
      codeSkillInstructions:
        '<code_skill alias="@web-design" name="ui-ux-pro-max">生成完整可运行代码。</code_skill>',
      
      
    },
  );
  const repairOperationsPrompt = buildRepairCodeFileOperationsPrompt(
    codeContext,
    {
      "/src/App.tsx": "export default function App() { return null; }",
      "/src/styles.css": ":root{--bg:#050506}body{background:#050506}",
    },
    '{"operations":[]}',
    "缺少主题切换",
    {
      businessLogic,
      
      
      
      
      
      codeSkillInstructions:
        '<code_skill alias="@web-design" name="ui-ux-pro-max">生成完整可运行代码。</code_skill>',
    },
  );
  const uiIrPrompt = buildGenerateCodeUiIrPrompt(
    codeContext,
    appBlueprint,
    uiBlueprint,
    null,
    null,
  );
  
  const visualDirectionPrompt = buildGenerateCodeVisualDirectionPrompt(
    businessLogic,
    {
      alias: "@web-design",
      aliases: ["@web-design"],
      name: "ui-ux-pro-max",
      description: "UI/UX design intelligence",
      source: "project",
      location: "apps/api/src/code-skills/ui-ux-pro-max/SKILL.md",
      baseDir: "apps/api/src/code-skills/ui-ux-pro-max",
      fileManifest: [],
      content: "UI/UX design intelligence",
      loadedAt: new Date().toISOString(),
    },
  );
  const discoveryPrompt = buildGenerateCodeSkillResourceDiscoveryPrompt(
    businessLogic,
    {
      alias: "@web-design",
      aliases: ["@web-design"],
      name: "ui-ux-pro-max",
      description: "UI/UX design intelligence",
      source: "project",
      location: "apps/api/src/code-skills/ui-ux-pro-max/SKILL.md",
      baseDir: "apps/api/src/code-skills/ui-ux-pro-max",
      fileManifest: [
        {
          path: "apps/api/src/code-skills/ui-ux-pro-max/data/styles.csv",
          relativePath: "data/styles.csv",
          kind: "data",
          size: 100,
        },
      ],
      content: "UI/UX design intelligence",
      loadedAt: new Date().toISOString(),
    },
    visualDirection,
  );
  const verifyFidelityPrompt = buildVerifyCodeUiFidelityPrompt(businessLogic, null, {
    deterministicCheck: {
      fileFacts: [
        "/src/App.tsx 存在并已纳入还原检查上下文。",
        "检测到 4 个页面/功能文件：/src/pages/CalendarPage.tsx。",
      ],
      missing: [],
      repairSuggestions: [],
      routeExpectation:
        "业务路径只要求通过模拟 route state / mock route table / PageKey 体现。",
    },
    criticalFiles: [
      { path: "/src/App.tsx", content: "export default function App() { return null; }" },
      { path: "/src/components/WorkspaceShell.tsx", content: "const routes = ['/calendar'];" },
    ],
    pageFiles: [
      { path: "/src/pages/CalendarPage.tsx", content: "export function CalendarPage() { return <button />; }" },
    ],
    supportingFiles: [
      { path: "/src/data/mock-data.ts", content: "export const events = [];" },
    ],
    omittedFiles: [
      { path: "/BUSINESS_CONTEXT.md", originalLength: 3000, reason: "辅助说明文件省略。" },
    ],
  });

  assert.match(specPrompt, /theme 必须描述业务领域主题/);
  assert.match(specPrompt, /不是软件工程实践平台主题/);
  
  
  
  
  
  
  
  
  
  
  
  assert.match(planPrompt, /App、components、domain\/types、data\/mock-data/);
  assert.match(appBlueprintPrompt, /2 到 6 个页面/);
  assert.match(uiBlueprintPrompt, /避免空壳营销页/);
  assert.match(uiMockupPrompt, /draw-ui 风格约束/);
  assert.match(uiIrPrompt, /结构化 UI IR/);
  assert.match(uiIrPrompt, /WorkspaceShell, SidebarNav, TopBar/);
  assert.match(uiMockupPrompt, /真实、具体、贴合业务的示例数据/);
  assert.match(filePlanPrompt, /至少 2 个 \/src\/pages/);
  assert.match(filePlanPrompt, /至少 3 个 \/src\/components/);
  assert.match(filePlanPrompt, /当前启用的 Code Skills/);
  assert.match(operationsPrompt, /每个操作必须使用字段 operation/);
  assert.match(operationsPrompt, /operation, path, content, reason, message/);
  assert.match(operationsPrompt, /create_file\/update_file 的 content 必须是完整文件正文/);
  assert.match(operationsPrompt, /不能使用 type、action、op、kind/);
  assert.match(operationsPrompt, /businessLogic\.pageFlows/);
  assert.match(operationsPrompt, /必须逐项覆盖 designToCodeMapping\.items/);
  assert.match(operationsPrompt, /每个 create_file\/update_file 的 reason 必须引用至少一个设计模型元素 id/);
  assert.match(operationsPrompt, /禁止从设计模型以外的信息推导/);
  assert.doesNotMatch(operationsPrompt, /requirementText|rules|requirementBaseline/);
  assert.match(operationsPrompt, /\/src\/domain\/types\.ts/);
  assert.match(operationsPrompt, /\/src\/data\/mock-data\.ts/);
  assert.match(operationsPrompt, /不能默认套软件工程实践平台风格/);
  assert.match(operationsPrompt, /当前启用的 Skill 摘要/);
  assert.match(operationsPrompt, /Skill 资源查询计划/);
  assert.match(operationsPrompt, /视觉方向（必须执行）/);
  assert.match(operationsPrompt, /Skill 资源预览结果/);
  assert.match(operationsPrompt, /visualDirection\.promptBrief/);
  assert.match(operationsPrompt, /Skill action 查询结果（必须优先使用）/);
  assert.match(operationsPrompt, /skillResourcePlan/);
  assert.match(operationsPrompt, /ui-ux-pro-max/);
  assert.match(operationsPrompt, /Tailwind utility class/);
  assert.match(operationsPrompt, /必须生成 \/src\/lib\/utils\.ts/);
  assert.match(operationsPrompt, /clsx \+ tailwind-merge/);
  assert.match(operationsPrompt, /至少 3 个 \/src\/components\/ui\/\*/);
  assert.match(operationsPrompt, /button\.tsx、badge\.tsx、card\.tsx/);
  assert.match(operationsPrompt, /class-variance-authority/);
  assert.match(operationsPrompt, /cn\(\)/);
  assert.match(operationsPrompt, /\/src\/components\/ui\/\*/);
  assert.match(operationsPrompt, /components\.json/);
  assert.match(operationsPrompt, /新链路不生成界面图/);
  assert.match(operationsPrompt, /响应式布局/);
  assert.match(operationsPrompt, /默认必须是浅色主题/);
  assert.match(operationsPrompt, /浅色\/深色主题切换控件/);
  assert.match(operationsPrompt, /#050506/);
  assert.match(operationsPrompt, /--bg、--surface、--text、--muted、--primary、--border/);
  assert.match(operationsPrompt, /document\.title/);
  assert.match(operationsPrompt, /内存模拟路由表/);
  assert.match(operationsPrompt, /history\.replaceState/);
  assert.match(operationsPrompt, /SecurityError/);
  assert.match(repairOperationsPrompt, /默认必须修复为浅色主题/);
  assert.match(repairOperationsPrompt, /#050506/);
  assert.match(repairOperationsPrompt, /\[data-theme="dark"\]/);
  assert.match(repairOperationsPrompt, /class-variance-authority/);
  assert.match(repairOperationsPrompt, /不能退回普通 CSS/);
  assert.match(repairOperationsPrompt, /至少 3 个 \/src\/components\/ui\/\*/);
  assert.match(repairOperationsPrompt, /缺失的本地组件/);
  assert.match(repairOperationsPrompt, /document\.title/);
  assert.match(repairOperationsPrompt, /BrowserRouter/);
  assert.match(operationsPrompt, /不要把权限边界、服务边界、过滤条件、函数名、规则溯源等说明性文本直接显示/);
  assert.match(operationsPrompt, /\/BUSINESS_CONTEXT\.md/);
  assert.match(operationsPrompt, /不要放到 \/src\/docs\/\*/);
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  assert.match(visualDirectionPrompt, /promptBrief/);
  assert.match(visualDirectionPrompt, /优秀官网 demo/);
  assert.match(visualDirectionPrompt, /Web React/);
  assert.match(discoveryPrompt, /先声明要预览哪些 CSV/);
  assert.match(discoveryPrompt, /data\/styles\.csv/);
  assert.match(discoveryPrompt, /data\/stacks\/react\.csv/);
  assert.match(discoveryPrompt, /data\/stacks\/shadcn\.csv/);
  assert.match(discoveryPrompt, /data\/stacks\/html-tailwind\.csv/);
  assert.match(discoveryPrompt, /禁止预览移动端\/原生端资源/);
  assert.match(verifyFidelityPrompt, /criticalFiles/);
  assert.match(verifyFidelityPrompt, /pageFiles/);
  assert.match(verifyFidelityPrompt, /supportingFiles/);
  assert.match(verifyFidelityPrompt, /omittedFiles/);
  assert.match(verifyFidelityPrompt, /模拟 route state/);
  assert.match(verifyFidelityPrompt, /不得把 omittedFiles 中的辅助文件直接判定为缺失/);
  assert.match(verifyFidelityPrompt, /不得再笼统声称“未包含 App 或具体页面组件”/);

  const longUiMockupPrompt = buildGenerateCodeUiMockupPrompt(
    {
      requirementText: "校园活动平台需要覆盖复杂审批、通知、统计和运营配置。".repeat(5000),
      rules: Array.from({ length: 80 }, (_, index) => ({
        id: `r${index + 1}`,
        category: "功能需求",
        text: "需要在界面中展示真实业务数据、筛选条件、状态变化和下一步操作。".repeat(80),
        relatedDiagrams: ["usecase"],
      })),
      designModels: Array.from({ length: 40 }, (_, index) => ({
        diagramKind: "sequence",
        title: `流程 ${index + 1}`,
        summary: "包含复杂参与者、消息和异常分支。".repeat(80),
        participants: [],
        messages: [],
        fragments: [],
      })),
    },
    appBlueprint,
    uiBlueprint,
  );
  assert.ok(longUiMockupPrompt.length <= 24000);
  assert.doesNotMatch(longUiMockupPrompt, /requirementText|rules|requirementBaseline/);
});

test("document content prompt forbids unprovided school and personal names", () => {
  const prompt = buildGenerateDocumentContentPrompt("requirementsSpec", {
    requirementText: "系统支持用户注册和登录。",
  });

  assert.match(prompt, /不得出现具体大学、学院、教师、班级、学号、姓名/);
  assert.match(prompt, /不得虚构年份、版本基线日期、制度名称或参考资料/);
  assert.match(prompt, /未由用户输入明确提供/);
  assert.match(prompt, /章节编号由平台自动生成/);
  assert.match(prompt, /功能需求（用例模型）/);
  assert.match(prompt, /analysis:<useCaseId>/);
  assert.match(prompt, /不允许输出占位或跳转话术/);
  assert.match(prompt, /在本节内写出可交付说明/);
  assert.doesNotMatch(prompt, /保留章节并写“当前阶段未明确”/);
  assert.doesNotMatch(prompt, /统一写“待填写”/);
});
