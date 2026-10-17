// Verifies prompt builders preserve stage responsibilities, output constraints, and traceability instructions.
import assert from "node:assert/strict";
import test from "node:test";
import type { RequirementBaseline, RequirementRule } from "@uml-platform/contracts";
import { createRequirementBaselineSnapshot } from "@uml-platform/contracts";
import { modelFixture } from "../../contracts/src/testing/model-fixtures.js";
import { buildExtractRulesPrompt, buildRepairExtractedRulesPrompt, buildGenerateDesignTraceabilityPrompt, buildGenerateDesignSequencePrompt, buildGenerateRequirementTraceabilityPrompt, buildGenerateDocumentContentPrompt, buildGenerateDesignModelsPrompt, buildGenerateModelsPrompt, buildGenerateRequirementAnalysisPrompt, buildRepairDesignModelsPrompt, buildRepairDesignTraceabilityPrompt, buildRepairModelsPrompt, buildRepairRequirementTraceabilityPrompt, } from "./index.js";
const sampleRules: RequirementRule[] = [
    {
        id: "r1",
        category: "功能需求",
        text: "用户可以提交需求",
        relatedDiagrams: ["function", "usecase", "class", "activity", "deployment", "prototype", "analysis"],
    },
];
test("design context uses compact JSON without losing upstream model fields", () => {
    const models = [modelFixture("requirements", "usecase")];
    const baseline = createRequirementBaselineSnapshot({ runId: "compact", requirementText: "需求", rules: sampleRules });
    const prompt = buildGenerateDesignModelsPrompt(baseline, models, [], ["architecture"]);
    assert.ok(prompt.includes(JSON.stringify(models)));
    assert.ok(!prompt.includes(JSON.stringify(models, null, 2)));
});
test("allowed trace targets remain valid JSON and include the tail beyond 24k", () => {
    const model = { diagramKind: "usecase" as const, title: "用例", summary: "", notes: [], actors: [], systemBoundaries: [], relationships: [],
        useCases: Array.from({ length: 600 }, (_, index) => ({ id: `uc${index}`, name: `完整用例${index}`, goal: "业务", preconditions: [], postconditions: [], supportingActorIds: [], eventFlows: [] })) };
    const baseline = createRequirementBaselineSnapshot({ runId: "trace", requirementText: "需求", rules: sampleRules });
    const prompt = buildGenerateRequirementTraceabilityPrompt(sampleRules, baseline, [model]);
    const json = prompt.split("allowedTargets（唯一可引用目标清单，target 必须从这里逐项复制）：\n")[1]!;
    assert.ok(json.length > 24000);
    const targets = JSON.parse(json) as Array<{
        elementId: string;
    }>;
    assert.ok(targets.some(target => target.elementId === "uc599"));
});
test("rule snapshot prompts do not repeat rules or truncate design constraints", () => {
    const rules: RequirementRule[] = Array.from({ length: 60 }, (_, index) => ({
        id: `r${index + 1}`, category: "功能需求", text: `需求${index + 1}：${"保留完整约束。".repeat(80)}`,
        relatedDiagrams: ["usecase"],
    }));
    rules[59] = { ...rules[59]!, category: "部署需求", text: "最后一条约束：服务只能部署在校内网络。" };
    const baseline = createRequirementBaselineSnapshot({ runId: "large", requirementText: "原始需求", rules });
    const requirements = buildGenerateModelsPrompt(rules, baseline, ["usecase"]);
    assert.equal(requirements.split(rules[0]!.text).length - 1, 1);
    assert.doesNotMatch(requirements, /必须以 RequirementBaseline 中 accepted/);
    const design = buildGenerateDesignModelsPrompt(baseline, [], [], ["architecture"]);
    assert.match(design, /最后一条约束：服务只能部署在校内网络。/);
    assert.doesNotMatch(design, /内容已截断|fieldProvenance|系统满足该需求/);
});
// Inspect the embedded contract instead of matching retired prose versions of field rules.
function promptModelSchema(prompt: string, kind: string) {
    const prefix = `- ${kind} JSON Schema: `;
    const line = prompt.split("\n").find((entry) => entry.startsWith(prefix));
    assert.ok(line, `missing ${kind} schema in prompt`);
    return JSON.parse(line.slice(prefix.length));
}
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
    assert.match(prompt, /requirementModelTraceability 可以返回空数组/);
    assert.match(prompt, /模型结构生成成功后由系统分批补齐/);
    assert.match(prompt, /RequirementBaseline（结构化需求事实和约束）/);
    assert.match(prompt, /达到\/至少\/不低于\/以上必须保持为 >=/);
    assert.match(prompt, /正好等于阈值的路径/);
    assert.doesNotMatch(prompt, /原始需求：/);
    assert.doesNotMatch(prompt, /用户登录后进入首页/);
});
test("requirement repair prompt preserves requirement-stage responsibilities", () => {
    const prompt = buildRepairModelsPrompt(sampleRules, sampleBaseline, ["activity"], '{"models":[]}', "models.0.nodes: Required");
    assert.match(prompt, /需求阶段模型职责/);
    assert.match(prompt, /总体业务流程\(activity\): 描述跨角色的业务活动/);
    assert.match(prompt, /relationships\[\] 必须显式包含 sourceId 和 targetId/);
    assert.match(prompt, /deployment\.relationships\[\]\.port 必须是字符串/);
    assert.match(prompt, /若校验指出阈值语义冲突/);
});
test("requirement analysis repair prompt allows empty traceability", () => {
    const prompt = buildRepairModelsPrompt([], sampleBaseline, ["analysis"], '{"models":[],"requirementModelTraceability":[]}', "analysis JSON 结构不合法");
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
    const deploymentRepairPrompt = buildRepairModelsPrompt(sampleRules, sampleBaseline, ["deployment"], '{"models":[{"diagramKind":"prototype","nodes":[]}]}', "expected deployment, received prototype");
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
            { eventFlows: [],
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
    const prompt = buildGenerateRequirementTraceabilityPrompt([{ id: "r1", category: "功能需求", text: "用户可以提交需求", relatedDiagrams: ["usecase"] }], sampleBaseline, [model]);
    assert.match(prompt, /返回格式必须是 \{"requirementModelTraceability":\[\.\.\.\]\}/);
    assert.match(prompt, /只输出能从规则文本和模型元素语义直接证明/);
    assert.match(prompt, /target\.diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis/);
    assert.match(prompt, /禁止把 requirements、requirement、design、model、traceability、page/);
    assert.match(prompt, /每一个需求业务元素和 relationship 都必须至少映射到一条需求规则/);
    assert.match(prompt, /不要为 system-boundary、swimlane、start\/end\/flow_final\/merge\/fork\/join/);
    assert.match(prompt, /reviewStatus=pending、confidence=low/);
    assert.match(prompt, /allowedTargets（唯一可引用目标清单/);
    assert.match(prompt, /target 必须从 allowedTargets 清单原样复制/);
    assert.match(prompt, /"elementId":\s*"uc1"/);
    assert.match(prompt, /禁止返回 null，直接省略 modelId/);
    assert.doesNotMatch(prompt, /返回格式必须是 \{"models"/);
    const repairPrompt = buildRepairRequirementTraceabilityPrompt([], sampleBaseline, [model], "{}", "requirementModelTraceability: Required", [
        {
            diagramKind: "usecase",
            elementId: "uc1",
            elementKind: "usecase",
            label: "提交需求",
        },
    ]);
    assert.match(repairPrompt, /不要修改模型；只修复映射数组/);
    assert.match(repairPrompt, /必须补齐的缺失业务元素清单/);
    assert.match(repairPrompt, /"elementId":\s*"uc1"/);
    assert.match(repairPrompt, /allowedTargets（唯一可引用目标清单/);
    assert.match(repairPrompt, /包含 modelId 的目标必须保留 modelId/);
    assert.match(repairPrompt, /如果错误提示包含非法 diagramKind/);
});
test("design model prompt keeps navigation and implementation contracts separate from requirement activities", () => {
    const prompt = buildGenerateDesignModelsPrompt(sampleBaseline, [], [
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
    ], ["navigation", "architecture", "component", "sequence", "class", "deployment"]);
    assert.match(prompt, /设计阶段模型职责/);
    assert.match(prompt, /总体架构图\(architecture\): 系统逻辑架构层/);
    assert.match(prompt, /页面导航模型\(navigation\): 界面交互层/);
    assert.match(prompt, /组件（构件）关系\(component\): 组件结构层/);
    for (const [kind, fields] of [
        ["architecture", ["packages", "components", "relationships"]],
        ["component", ["components", "interfaces", "relationships"]],
        ["navigation", ["nodes", "relationships"]],
    ] as const) {
        const schema = promptModelSchema(prompt, kind);
        for (const field of fields)
            assert.ok(field in schema.properties, `${kind}.${field}`);
        assert.deepEqual(schema.properties.diagramKind.enum, [kind]);
    }
    assert.doesNotMatch(prompt, /- activity JSON Schema:/);
    assert.match(prompt, /navigation 是自定义页面导航模型/);
    assert.match(prompt, /alt\/par 至少两个带独立 id 的非空 branches/);
    assert.match(prompt, /分支消息不重叠且覆盖片段消息/);
    assert.match(prompt, /关系名称应简明/);
    const deploymentSchema = promptModelSchema(prompt, "deployment");
    assert.equal(deploymentSchema.properties.relationships.items.properties.protocol.type, "string");
    assert.equal(deploymentSchema.properties.relationships.items.properties.port.type, "string");
    assert.equal(deploymentSchema.properties.notes.items.type, "string");
    const messageTypes = promptModelSchema(prompt, "sequence").properties.messages.items.properties.type.enum;
    assert.ok(messageTypes.includes("return"));
    for (const alias of ["response", "reply", "result"])
        assert.ok(!messageTypes.includes(alias));
    assert.deepEqual(promptModelSchema(prompt, "class").properties.classes.items.properties.classKind.enum, ["entity", "aggregate", "valueObject", "service", "other"]);
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
    const repairPrompt = buildRepairDesignModelsPrompt(sampleBaseline, ["sequence"], '{"models":[]}', "models.0.notes: Required");
    assert.match(repairPrompt, /按错误路径逐项修复/);
    assert.match(repairPrompt, /不要改变原有业务语义/);
    assert.match(repairPrompt, /condition、guard、trigger、约束正文必须完整保留/);
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
    assert.match(prompt, /必须返回 designModelTraceability: \[\]/);
    assert.match(prompt, /系统会在模型结构解析成功后按元素清单确定性补齐可追踪关系/);
    assert.doesNotMatch(prompt, /矩阵会展示的每一个设计业务元素和 relationship 都必须至少映射到一个需求模型元素/);
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
    assert.match(prompt, /你必须且只能输出一个 analysis 模型/);
    assert.match(prompt, /modelId 必须是 analysis:<sourceUseCaseId>/);
    assert.match(prompt, /必须来自该 useCase\.eventFlows/);
    assert.match(prompt, /需求语义短语/);
    assert.match(prompt, /禁止使用 deleteEvent\(eventId\)、remove\(\)、save\(\) 等方法调用写法/);
    assert.match(prompt, /禁止加入设计阶段类名、Service、DAO、Repository、Controller、数据库/);
    assert.match(prompt, /requirementModelTraceability 必须返回空数组/);
    assert.match(prompt, /单用例需求阶段用例模型（唯一分析来源）/);
    assert.match(prompt, /"id":\s*"uc_reserve"/);
    assert.match(prompt, /"actorAction":\s*"客户选择日期和座位"/);
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
            { eventFlows: [],
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
    const prompt = buildGenerateDesignTraceabilityPrompt(sampleBaseline, [requirementModel], [designModel], [
        {
            diagramKind: "sequence",
            elementId: "m1",
            elementKind: "message",
            label: "submit",
        },
    ]);
    assert.match(prompt, /返回格式必须是 \{"designModelTraceability":\[\.\.\.\]\}/);
    assert.match(prompt, /requiredSources/);
    assert.match(prompt, /designModelTraceability\.length 必须等于 requiredSources\.length/);
    assert.match(prompt, /"elementId":\s*"m1"/);
    assert.match(prompt, /不要把整张需求模型套给每个设计元素/);
    assert.match(prompt, /允许派生映射/);
    assert.match(prompt, /source\.diagramKind 只能使用: architecture, sequence, class, navigation, component, deployment, table/);
    assert.match(prompt, /targets\[\]\.diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis/);
    assert.match(prompt, /每一个设计业务元素和 relationship 都必须至少映射到一个需求模型元素/);
    assert.match(prompt, /不要为 swimlane、start\/end\/flow_final\/merge\/fork\/join/);
    assert.match(prompt, /reviewStatus=pending、confidence=low/);
    assert.doesNotMatch(prompt, /返回格式必须是 \{"models"/);
    const repairPrompt = buildRepairDesignTraceabilityPrompt(sampleBaseline, [requirementModel], [designModel], "{}", "designModelTraceability: Required", [
        {
            diagramKind: "sequence",
            elementId: "m1",
            elementKind: "message",
            label: "submit",
        },
    ]);
    assert.match(repairPrompt, /不要修改模型；只修复映射数组/);
    assert.match(repairPrompt, /必须补齐的缺失业务元素清单/);
    assert.match(repairPrompt, /"elementId":\s*"m1"/);
    assert.match(repairPrompt, /禁止把 requirements、requirement、design、model、traceability、page/);
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
