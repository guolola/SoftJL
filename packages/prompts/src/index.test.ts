// Verifies prompt builders preserve stage responsibilities, output constraints, and traceability instructions.
import assert from "node:assert/strict";
import test from "node:test";
import type { RequirementRule } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { expandPromptData } from "./prompt-data.js";
import { buildExtractRulesPrompt, buildGenerateDesignSequencePrompt, buildGenerateDocumentContentPrompt, buildGenerateDesignModelsPrompt, buildGenerateModelsPrompt, buildGenerateRequirementAnalysisPrompt } from "./index.js";

const sampleRules: RequirementRule[] = [
  {
    id: "r1",
    type: "functional" as const,
    text: "用户可以提交需求",

  },
];

test("design context uses compact JSON without losing upstream model fields", () => {
  const models = [modelFixture("requirements", "function")];
  const prompt = buildGenerateDesignModelsPrompt(models, [], ["architecture"]);
  assert.deepEqual(expandPromptData(JSON.parse(prompt.split("需求阶段来源模型：\n")[1].split("\n")[0])), models);
  assert.ok(!prompt.includes(JSON.stringify(models, null, 2)));
});

test("generation prompts retain bound facts without importing backend baseline constraints", () => {
  const rules: RequirementRule[] = Array.from({ length: 60 }, (_, index) => ({
    id: `r${index + 1}`, type: "functional" as const, text: `需求${index + 1}：${"保留完整约束。".repeat(80)}`,

  }));
  rules[59] = { ...rules[59]!, type: "operations" as const, text: "最后一条约束：服务只能部署在校内网络。" };
  const requirements = buildGenerateModelsPrompt(rules, ["usecase"]);
  assert.equal(requirements.split(rules[0]!.text).length - 1, 1);
  assert.doesNotMatch(requirements, /必须以 RequirementBaseline 中 accepted/);
  const design = buildGenerateDesignModelsPrompt([], [], ["architecture"]);
  assert.doesNotMatch(design, /最后一条约束：服务只能部署在校内网络。|RequirementBaseline/);
  assert.doesNotMatch(design, /内容已截断|fieldProvenance|系统满足该需求/);
});

test("requirement prompts use the exact bound rules without restoring omitted baseline rules", () => {
  const functional: RequirementRule = { id: "r1", type: "functional" as const, text: "用户查询订单",  };
  const accessibility: RequirementRule = { id: "r2", type: "quality" as const, text: "页面必须支持键盘操作",  };
  const prompt = buildGenerateModelsPrompt([functional], ["prototype"]);
  assert.ok(!prompt.includes(accessibility.text));
  assert.match(prompt, /绑定的规则范围由后端确定/);
  assert.match(prompt, /禁止为凑覆盖率虚构节点/);
  assert.match(prompt, /非功能需求是跨模型约束/);
});

// Inspect the embedded contract instead of matching retired prose versions of field rules.
function promptModelSchema(prompt: string, kind: string) {
  const prefix = `- ${kind} JSON Schema: `;
  const line = prompt.split("\n").find((entry) => entry.startsWith(prefix));
  assert.ok(line, `missing ${kind} schema in prompt`);
  return JSON.parse(line.slice(prefix.length));
}

test("rule extraction prompt separates readable text from source fragments", () => {
  const prompt = buildExtractRulesPrompt("一个小型图书馆管理系统需完成：(1)借书。");

  assert.match(prompt, /完整可读的需求条目/);
  assert.match(prompt, /sourceFragment/);
  assert.match(prompt, /不要输出额外字段/);
  assert.match(prompt, /不要只输出“\(1\)借书”/);
  assert.match(prompt, /只包含 rules|格式必须是.*rules/);
});

test("rule extraction includes complete source and requests plain JSON for backend validation", () => {
  const source = "需求".repeat(25000) + "SOURCE_TAIL";
  const prompt = buildExtractRulesPrompt(source);
  assert.ok(prompt.includes(source));
  assert.match(prompt, /直接返回完整候选 JSON，由后端校验/);
  assert.doesNotMatch(prompt, /validate_requirement_rules|submit_requirement_rules|get_upstream_artifact/);
});

test("text rule extraction identifies its source and checks completeness without changing evidence", () => {
  const source = "报销总额达到5000元（含5000元）时由经理审批；拒绝时保留原记录。";
  const prompt = buildExtractRulesPrompt(source);
  assert.match(prompt.split("\n")[0]!, /从下方本次提供的需求资料中抽取/);
  assert.doesNotMatch(prompt, /下面的软件工程实践平台需求/);
  assert.match(prompt, /下方原始需求文本是本次抽取的全部资料/);
  assert.match(prompt, /分类示例.*不是本次业务事实/);
  assert.match(prompt, /文本规则的 sourceFragment 必须逐字来自本次原文/);
  assert.match(prompt, /扩大逐字引用范围以区分来源/);
  assert.match(prompt, /规则抽取自检.*不得遗漏未带编号的明确要求/);
  assert.match(prompt, /规则集合必须共同保留.*包含边界、否定、顺序、备选和异常语义/);
  assert.match(prompt, /只输出最终规则 JSON，不输出自检过程/);
  assert.equal(prompt.split("原始需求：\n")[1], source);
  assert.doesNotMatch(prompt, /图片规则的 text|每条规则.*sourceFragment 必须逐字来自原文/);
});

test("image rule extraction separates image labels from literal text citations", () => {
  const source = '用户提交预约。\n【图片附件 1："业务流程.png"】';
  const prompt = buildExtractRulesPrompt(source, { hasImages: true });
  assert.match(prompt, /原始需求文本及本次实际绑定的原图.*全部资料/);
  assert.match(prompt, /文本规则的 sourceFragment 必须逐字来自本次原文/);
  assert.match(prompt, /图片规则的 text.*原图中清晰可见的业务要求/);
  assert.match(prompt, /sourceFragment 必须完整引用对应的单个【图片附件 …】来源标记/);
  assert.match(prompt, /不能只写文件名或与文本来源混在同一个 sourceFragment 中/);
  assert.doesNotMatch(prompt, /每条规则.*sourceFragment 必须逐字来自原文/);
  assert.equal(prompt.split("原始需求：\n")[1], source);
});

test("requirement model prompts include requirement-stage responsibilities", () => {
  const prompt = buildGenerateModelsPrompt(sampleRules, [
    "function",
    "usecase",
    "class",
    "activity",
    "deployment",
  ]);

  assert.match(prompt, /需求阶段模型职责/);
  assert.match(prompt, /功能结构图\(function\): 根据功能需求抽取系统功能层级/);
  assert.match(prompt, /PlantUML MindMap/);
  assert.match(prompt, /用例模型\(usecase\): 明确系统边界/);
  assert.match(prompt, /领域概念模型\(class\): 只描述业务领域内的核心概念实体/);
  assert.match(prompt, /不表达服务、控制器、仓储或对象方法/);
  const classSchema = promptModelSchema(prompt, "class");
  assert.equal(classSchema.properties.classes.items.properties.operations.maxItems, 0);
  assert.match(prompt, /总体业务流程\(activity\): 描述跨角色的业务活动/);
  assert.match(prompt, /统一使用竖向泳道和控制流，允许不同位置同名动作、明确判断控制的循环与并行/);
  assert.doesNotMatch(prompt, /重复业务步骤必须合并/);
  assert.match(prompt, /部署需求模型\(deployment\): 描述需求阶段可识别的部署约束/);
  assert.match(prompt, /JSON 必须完整合法/);
  assert.match(prompt, /sourceId 和 targetId/);
  assert.match(prompt, /port.*字符串/);
  assert.match(prompt, /关系名称应简明/);
  assert.match(prompt, /condition、guard、trigger、约束正文必须完整保留/);
  assert.match(prompt, /不能截断或以省略号替代/);
  assert.match(prompt, /每个业务元素和业务关系必须同时有至少一条真实规则来源/);
  assert.match(prompt, /本模型实际采用的规则/);
  assert.match(prompt, /本次绑定的需求规则（唯一需求来源）/);
  assert.doesNotMatch(prompt, /RequirementBaseline/);
  assert.match(prompt, /达到\/至少\/不低于\/以上必须保持为 >=/);
  assert.match(prompt, /正好等于阈值的路径/);
  assert.doesNotMatch(prompt, /原始需求：/);
  assert.doesNotMatch(prompt, /用户登录后进入首页/);
});

test("design sequence prompt requires one sequence per use case", () => {
  const useCaseModel = {
    diagramKind: "usecase" as const,
    title: "用例模型",
    summary: "系统边界",
    notes: [],
    actors: [],
    useCases: [
      { eventFlows: [],
        id: "uc_view",
        name: "查看活动",
        goal: "查看活动",
        preconditions: [],
        postconditions: [],
        supportingActorIds: [],
      },
      { eventFlows: [],
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
  const prompt = buildGenerateDesignSequencePrompt(useCaseModel);

  assert.match(prompt, /每个 useCase 必须生成一个独立用例实现设计/);
  assert.match(prompt, /models\.length 必须等于 useCases\.length/);
  assert.match(prompt, /modelId = sequence:<useCaseId>/);
  assert.match(prompt, /sourceUseCaseId/);
  assert.match(prompt, /sourceUseCaseName/);
  assert.match(prompt, /界面、控制、业务处理、实体及必要的持久化协作对象/);
  assert.match(prompt, /方法调用/);
  assert.match(prompt, /不能原样复制业务步骤作为全部设计内容/);
  assert.match(prompt, /首次生成必须同时返回 models 和完整 designModelTraceability/);
  assert.doesNotMatch(prompt, /系统会在模型结构解析成功后按元素清单确定性补齐可追踪关系/);
  assert.match(prompt, /每个设计模型元素.*必须在首次生成时至少声明一个直接上游元素/);
  assert.match(prompt, /"id":\s*"uc_view"/);
  assert.match(prompt, /"id":\s*"uc_create"/);
  assert.doesNotMatch(prompt, /原始需求：/);
  assert.doesNotMatch(prompt, /活动日历/);
});

test("requirement analysis prompt scopes one sequence to the complete target use case", () => {
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
            flowType: "main" as const,
            steps: [
              {
                order: 1,
                actor: "actor" as const,
                actorAction: "客户选择日期和座位",
                systemAction: "系统校验座位可用并创建预约",
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
  assert.match(prompt, /你必须且只能为本次目标用例输出一个 analysis 模型/);
  assert.match(prompt, /modelId 必须是 analysis:<sourceUseCaseId>/);
  assert.match(prompt, /分析范围包括目标用例的目标、参与者、系统边界、前后置条件、主事件流、备选流和异常流/);
  assert.match(prompt, /需求语义短语/);
  assert.match(prompt, /禁止使用 deleteEvent\(eventId\)、remove\(\)、save\(\) 等方法调用写法/);
  assert.match(prompt, /禁止加入设计阶段类名、Service、DAO、Repository、Controller、数据库/);
  assert.match(prompt, /requirementModelTraceability 返回空数组 \[\]/);
  assert.match(prompt, /非空 sourceElementIds/);
  assert.match(prompt, /单用例需求阶段用例模型（唯一分析来源）/);
  assert.match(prompt, /"id":\s*"uc_reserve"/);
  assert.match(prompt, /"actorAction":\s*"客户选择日期和座位"/);
  assert.doesNotMatch(prompt, /原始需求：/);
  assert.doesNotMatch(prompt, /客户预约自习室座位/);
  assert.doesNotMatch(prompt, /已确认需求项：/);
  assert.doesNotMatch(prompt, /RequirementBaseline（/);
  assert.match(prompt, /不直接引用原始需求文本、独立需求规则或未提供的模型/);
  assert.match(prompt, /所有 sourceElementIds 的唯一引用范围/);
  assert.match(prompt, /步骤没有独立 id 时，引用所属事件流 id/);
  assert.match(prompt, /不得把 order 顺序号、名称或数组位置当作元素 id/);
  const upstream = JSON.parse(prompt.split("单用例需求阶段用例模型（唯一分析来源）：\n")[1]!);
  assert.deepEqual(upstream, useCaseModel);
});

test("model tasks name their output and keep business and trace scopes aligned", () => {
  const prompt = buildGenerateModelsPrompt(sampleRules, ["usecase"]);
  assert.match(prompt.split("\n")[0]!, /分析谁使用系统、要完成什么业务.*用例模型/);
  assert.doesNotMatch(prompt, /需求阶段 UML 结构化模型|本次是用例模型生成|只生成功能结构图|部署需求模型只展开/);
  assert.match(prompt, /唯一业务依据.*requirementModelTraceability.ruleId 的唯一引用范围/);
  assert.match(prompt, /JSON Schema、结构规则及示例只规定表达方式/);
  const upstream = JSON.parse(prompt.split("本次绑定的需求规则（唯一需求来源）：\n")[1]!);
  assert.deepEqual(upstream, sampleRules);
  for (const kind of ["architecture", "class", "navigation", "component", "deployment", "table"] as const) {
    const design = buildGenerateDesignModelsPrompt([], [], [kind]);
    assert.doesNotMatch(design.split("\n")[0]!, /UML 结构化模型/);
    assert.match(design, /全部直接上游；designModelTraceability.targets 只能引用这些输入中的真实元素/);
    assert.match(design, /输入为空的模型类别没有可引用元素/);
  }
});

test("sequence design distinguishes analysis refinement from generation without analysis", () => {
  const usecase = modelFixture("requirements", "usecase");
  const analysis = modelFixture("requirements", "analysis");
  const without = buildGenerateDesignSequencePrompt(usecase, []);
  const withAnalysis = buildGenerateDesignSequencePrompt(usecase, [analysis]);
  assert.match(without, /本次未提供需求分析模型.*来源映射只能引用用例模型/);
  assert.doesNotMatch(without, /已提供对应需求分析模型：/);
  assert.match(withAnalysis, /已提供对应需求分析模型：以其业务消息和组合片段为细化起点/);
  assert.doesNotMatch(withAnalysis, /本次未提供需求分析模型：/);
  assert.deepEqual(JSON.parse(withAnalysis.split("需求阶段需求分析模型（可为空）：\n")[1]!), [analysis]);
  for (const prompt of [without, withAnalysis]) {
    assert.match(prompt, /业务依据与来源映射必须使用同一范围/);
    assert.match(prompt, /不能把它们当成两个独立流程重复实现/);
    assert.match(prompt, /不能串成一条无条件执行路径/);
    assert.match(prompt, /不为凑分层强行增加服务、数据库对象或技术设施/);
  }
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
