// Verifies prompt builders preserve stage responsibilities, output constraints, and traceability instructions.
import assert from "node:assert/strict";
import test from "node:test";
import type { RequirementBaseline, RequirementRule } from "@uml-platform/contracts";
import { createRequirementBaselineSnapshot } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { expandPromptData } from "./prompt-data.js";
import { buildExtractRulesPrompt, buildRepairExtractedRulesPrompt, buildGenerateDesignSequencePrompt, buildGenerateDocumentContentPrompt, buildGenerateDesignModelsPrompt, buildGenerateModelsPrompt, buildGenerateRequirementAnalysisPrompt } from "./index.js";

const sampleRules: RequirementRule[] = [
  {
    id: "r1",
    type: "functional" as const,
    text: "用户可以提交需求",

  },
];

test("design context uses compact JSON without losing upstream model fields", () => {
  const models = [modelFixture("requirements", "function")];
  const baseline = createRequirementBaselineSnapshot({ runId: "compact", requirementText: "需求", rules: sampleRules });
  const prompt = buildGenerateDesignModelsPrompt(baseline, models, [], ["architecture"]);
  assert.deepEqual(expandPromptData(JSON.parse(prompt.split("需求阶段来源模型：\n")[1].split("\n")[0])), models);
  assert.ok(!prompt.includes(JSON.stringify(models, null, 2)));
});

test("rule snapshot prompts do not repeat rules or truncate design constraints", () => {
  const rules: RequirementRule[] = Array.from({ length: 60 }, (_, index) => ({
    id: `r${index + 1}`, type: "functional" as const, text: `需求${index + 1}：${"保留完整约束。".repeat(80)}`,

  }));
  rules[59] = { ...rules[59]!, type: "operations" as const, text: "最后一条约束：服务只能部署在校内网络。" };
  const baseline = createRequirementBaselineSnapshot({ runId: "large", requirementText: "原始需求", rules });
  const requirements = buildGenerateModelsPrompt(rules, baseline, ["usecase"]);
  assert.equal(requirements.split(rules[0]!.text).length - 1, 1);
  assert.doesNotMatch(requirements, /必须以 RequirementBaseline 中 accepted/);
  const design = buildGenerateDesignModelsPrompt(baseline, [], [], ["architecture"]);
  assert.match(design, /最后一条约束：服务只能部署在校内网络。/);
  assert.doesNotMatch(design, /内容已截断|fieldProvenance|系统满足该需求/);
});

test("fixed routing retains allowed quality constraints without creating artificial nodes", () => {
  const functional: RequirementRule = { id: "r1", type: "functional" as const, text: "用户查询订单",  };
  const accessibility: RequirementRule = { id: "r2", type: "quality" as const, text: "页面必须支持键盘操作",  };
  const baseline = createRequirementBaselineSnapshot({ runId: "constraints", requirementText: "订单需求", rules: [functional, accessibility] });
  const prompt = buildGenerateModelsPrompt([functional], baseline, ["prototype"]);
  assert.ok(prompt.includes(accessibility.text));
  assert.match(prompt, /需求类型到模型的关联已由程序固定/);
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

const sampleBaseline: RequirementBaseline = createRequirementBaselineSnapshot({
  runId: "run-1",
  requirementText: "用户可以提交需求",
  rules: sampleRules,
  createdAt: "2026-01-01T00:00:00.000Z",
});

test("rule extraction prompt separates readable text from source fragments", () => {
  const prompt = buildExtractRulesPrompt("一个小型图书馆管理系统需完成：(1)借书。");

  assert.match(prompt, /完整可读的需求条目/);
  assert.match(prompt, /sourceFragment/);
  assert.match(prompt, /不要输出额外字段/);
  assert.match(prompt, /不要只输出“\(1\)借书”/);
  assert.match(prompt, /只包含 rules|格式必须是.*rules/);
});

test("rule extraction repair carries full source and draft beyond the former history limit", () => {
  const source = "需求".repeat(25000) + "SOURCE_TAIL";
  const draft = "输出".repeat(25000) + "DRAFT_TAIL";
  const prompt = buildRepairExtractedRulesPrompt('rules: Expected array, received undefined', source, draft);
  assert.ok(prompt.includes(source));
  assert.ok(prompt.includes(draft));
  assert.match(prompt, /上一条需求规则抽取 JSON/);
  assert.match(prompt, /只修改错误涉及的字段/);
  assert.match(prompt, /保留其他规则和已有业务含义/);
  assert.match(prompt, /rules: Expected array, received undefined/);
  assert.match(prompt, /只包含 rules|格式必须是.*rules/);
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
  assert.match(prompt, /功能结构图\(function\): 根据功能需求抽取系统功能层级/);
  assert.match(prompt, /PlantUML MindMap/);
  assert.match(prompt, /用例模型\(usecase\): 明确系统边界/);
  assert.match(prompt, /领域概念模型\(class\): 只描述业务领域内的核心概念实体/);
  assert.match(prompt, /不表达服务、控制器、仓储或对象方法/);
  const classSchema = promptModelSchema(prompt, "class");
  assert.equal(classSchema.properties.classes.items.properties.operations.maxItems, 0);
  assert.match(prompt, /总体业务流程\(activity\): 描述跨角色的业务活动/);
  assert.match(prompt, /允许不同位置同名动作、合法循环、并行、多起点/);
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
  assert.match(prompt, /RequirementBaseline（结构化需求事实和约束）/);
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
  const prompt = buildGenerateDesignSequencePrompt(sampleBaseline, useCaseModel);

  assert.match(prompt, /每个 useCase 必须生成一个独立用例实现设计/);
  assert.match(prompt, /models\.length 必须等于 useCases\.length/);
  assert.match(prompt, /modelId = sequence:<useCaseId>/);
  assert.match(prompt, /sourceUseCaseId/);
  assert.match(prompt, /sourceUseCaseName/);
  assert.match(prompt, /boundary\/controller\/service\/entity\/database/);
  assert.match(prompt, /方法调用/);
  assert.match(prompt, /不能原样复用参与者和消息/);
  assert.match(prompt, /首次生成必须同时返回 models 和完整 designModelTraceability/);
  assert.doesNotMatch(prompt, /系统会在模型结构解析成功后按元素清单确定性补齐可追踪关系/);
  assert.match(prompt, /每个设计业务元素和 relationship 必须在首次生成时至少声明一个直接上游元素/);
  assert.match(prompt, /"id":\s*"uc_view"/);
  assert.match(prompt, /"id":\s*"uc_create"/);
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
  assert.match(prompt, /必须来自该 useCase\.eventFlows/);
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
  assert.match(prompt, /禁止使用原始需求文本、需求规则或 RequirementBaseline/);
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
