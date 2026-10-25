// Requirement, design, model, and traceability prompt builders used by generation pipelines.
import { getStageModelSchemas, getModelReviewProfile, generationResponseSchema, designRequirementSources } from "@uml-platform/contracts";
import { compactPromptData, PROMPT_DATA_FORMAT } from "./prompt-data.js";
import { modelGenerationSelfCheck } from "./generation-self-check.js";
import type { DesignDiagramKind, DesignDiagramModelSpec, DiagramKind, DiagramModelSpec, RequirementRule } from "@uml-platform/contracts";

export const JSON_ONLY_SYSTEM_PROMPT =
  "你是一个严谨的软件需求与 UML 建模助手。你必须只返回 JSON，不要输出 Markdown、解释或代码围栏。";

function selectedDiagramHardRules(selectedDiagrams: DiagramKind[]) {
  const unique = Array.from(new Set(selectedDiagrams));
  if (unique.length === 0) return "";
  const lines = [
    `本次只允许输出这些 diagramKind: ${unique.join(", ")}。`,
    "models 数组中不得出现未列出的 diagramKind；如果无法生成某类图，也不要改成其他图类型。",
  ];
  if (unique.length === 1) {
    const [kind] = unique;
    const labels: Record<DiagramKind, string> = {
      context: "系统上下文图（系统环境图）",
      function: "功能结构图",
      usecase: "用例模型",
      class: "领域概念模型",
      activity: "总体业务流程",
      deployment: "部署需求模型",
      prototype: "原型界面关系",
      analysis: "需求分析模型",
    };
    lines.push(
      `本次是 ${labels[kind]}(${kind}) 单图生成任务；models.length 必须为 1，且 models[0].diagramKind 必须严格等于 "${kind}"。`,
      "禁止输出其它任何 diagramKind；不要把同一业务主题换成其它图类型返回。",
      "如果上一次输出是其它 diagramKind 或其它图类型结构，必须丢弃错图，按本次唯一目标图从已确认需求项重新生成，不要只改 diagramKind 字段伪装。",
    );
    if (kind === "class") {
      lines.push(
        "本次只生成领域概念模型：必须输出 classes/interfaces/enums/relationships，禁止输出 swimlanes/nodes 作为主结构，禁止生成总体业务流程。",
      );
    }
    if (kind === "function") {
      lines.push(
        "本次只生成功能结构图：必须输出 nodes/relationships，并用 decomposition 关系表达功能分解树，禁止输出用例、类、流程或部署结构作为主模型。",
      );
    }
    if (kind === "activity") {
      lines.push(
        "本次只生成总体业务流程：与可行性分析的业务流程图统一为竖向泳道结构，必须输出 swimlanes/nodes/relationships。泳道按责任主体划分，每个 activity 的 actorOrLane 必须引用泳道 id；节点按业务顺序从上到下推进，跨泳道控制流表示交接。只使用 start/end/activity/decision/merge/fork/join 和 control_flow；分支、并行、循环显式表达，不生成对象节点、对象流或引脚。禁止输出 classes/databases/components/screens 作为主结构。",
      );
    }
    if (kind === "deployment") {
      lines.push(
        "本次只生成部署需求模型：输出已知设备、运行环境、外部系统与通信约束，components/artifacts 输出空数组，不提前设计实现组件或制品，禁止输出原型界面 screen/module/entry-point 结构。",
      );
    }
    if (kind === "prototype") {
      lines.push(
        "本次只生成原型界面关系：nodes[].nodeType 只能表达 screen/module/entry-point，禁止输出部署节点、Pod、服务器或数据库部署结构作为主模型。",
      );
    }
  }
  if (unique.length === 1 && unique[0] === "usecase") {
    lines.push(
      "本次是用例模型生成：models 只能包含 diagramKind=\"usecase\" 的模型，禁止输出 function/analysis/class/activity/deployment/prototype。",
      "useCases[] 必须覆盖核心业务用例，且每个关键用例必须包含 eventFlows；eventFlows 是后续需求分析顺序图、用例实现设计和黑盒测试的唯一来源。",
    );
  }
  return lines.join("\n");
}

// Prompt fields and enums come from the same contracts as structured provider responses.
function modelContractLines(stage: "requirements" | "design", selected: string[]) {
  const schemas = getStageModelSchemas(stage).filter((schema) => !selected.length || selected.includes(schema.shape.diagramKind.value));
  return [modelGenerationSelfCheck(stage, schemas.map(schema => schema.shape.diagramKind.value)),
    ...schemas.map((schema) => `- ${schema.shape.diagramKind.value} JSON Schema: ${JSON.stringify(generationResponseSchema(schema))}\n对应结构规则：${getModelReviewProfile(stage, schema.shape.diagramKind.value).structure.join("\n")}`)];
}
function requirementDiagramSchemaLines(selectedDiagrams: DiagramKind[]) {
  return modelContractLines("requirements", selectedDiagrams);
}

const REQUIREMENT_STAGE_SEMANTICS = [
  "需求阶段模型职责：",
  "- 功能结构图(function): 根据功能需求抽取系统功能层级，用 PlantUML MindMap 表示功能分解；非功能需求、界面需求和部署约束不得作为独立功能节点或 dependency 关系。适用约束保留在 summary、notes 或节点 description 中，不绘制独立备注块。",
  "- 用例模型(usecase): 明确系统边界，直观展示“谁（角色）能做什么（用例）”，并为每个关键用例补充主事件流、备选事件流和异常事件流。",
  "- 领域概念模型(class): 只描述业务领域内的核心概念实体、属性及实体之间的关联，不表达服务、控制器、仓储或对象方法。",
  "- 总体业务流程(activity): 描述跨角色的业务活动、分支、并行和结束条件，不表达 UI 页面跳转。",
  "- 部署需求模型(deployment): 描述需求阶段可识别的部署约束、外部系统、网络拓扑和通信协议。",
  "- 原型界面关系(prototype): 描述页面、模块、入口点及它们之间的导航、打开、提交、返回和依赖关系。",
  "- 需求分析模型(analysis): 以用例事件流为依据，只使用 actor/boundary/control/entity 业务职责对象，不引入 Controller、Service、Repository 或数据库实现对象。",
  "- 活动图统一使用竖向泳道和控制流，允许不同位置同名动作、明确判断控制的循环与并行；所有动作注明所属泳道，分支用 decision/merge，并行用 fork/join，end 表示结束。",
  "- 用例引用所属 systemBoundaryId；extend 从扩展用例到基础用例，extensionPointIds 引用基础用例的 extensionPoints；include 从包含者到被包含者。",
].join("\n");

const REQUIREMENT_TRACEABILITY_RULES = [
  "需求 traceability 约束：",
  "- target.diagramKind 只能使用: function, usecase, class, activity, deployment, prototype, analysis。",
  "- 禁止把 requirements、requirement、design、model、traceability、page 等阶段名或页面名作为 diagramKind。",
  "- target.elementId 必须引用本次需求模型中真实存在的元素 id 或 relationship id；表字段类元素使用 tableId.columnId 形式。",
  "- 首次生成必须同时返回每个模型元素（包括节点、关系、边界、泳道、结构及嵌套元素） 的真实规则来源；没有来源的业务内容不得生成，禁止事后猜测补齐。",
  "- 如果错误提示包含非法 diagramKind，必须改成该元素实际所属的具体图类型，不允许继续返回阶段名。",
  "- 每条映射只返回 ruleId 和 target；引用是否有效仅按真实规则及模型元素 id 匹配，不返回附加来源标记、解释或评审字段。",
].join("\n");

const DESIGN_TRACEABILITY_RULES = [
  "设计 traceability 约束：",
  "- 设计侧 source 必须包含 modelId；用例实现设计元素的 modelId 必须是对应 sequence:<useCaseId>，聚合下游设计模型可使用 architecture/class/navigation/component/deployment/table。",
  "- source.diagramKind 只能使用: architecture, sequence, class, navigation, component, deployment, table。",
  "- targets 引用本次实际提供的直接上游，允许需求模型或设计模型；组件图、数据库设计直接引用设计类图，部署设计可引用组件图，禁止猜测未提供的需求模型。",
  "- 上游引用 targets 的 diagramKind 必须使用其 modelId 所属输入模型的实际类型；需求分析模型为 analysis，用例实现设计为 sequence，禁止把 source.diagramKind 复制到上游 targets 或把当前输出当作上游。",
  "- 禁止把 requirements、requirement、design、model、traceability、page 等阶段名或页面名作为 diagramKind。",
  "- source.elementId 必须引用本次设计模型中真实存在的元素 id 或 relationship id；表字段类元素使用 tableId.columnId 形式。",
  "- source 和每个 targets 引用必须完整包含 modelId、diagramKind、elementId、elementKind、label；elementId 必须匹配对应模型内真实存在的 id，包括嵌套事件流的 id。没有独立 id 的步骤用其所属事件流 id 引用，不得把 order 顺序号当作元素 id。",
  "- 每个设计模型元素（包括节点、关系、结构及嵌套元素） 必须在首次生成时至少声明一个直接上游元素。程序检查引用和映射完整性，修复时在本对话中返回完整模型和全部有效来源映射。",
  "- 如果错误提示包含非法 diagramKind，必须改成该元素实际所属的具体图类型，不允许继续返回阶段名。",
  "- 每条映射只返回 source 和 targets；需求模型和设计模型来源均放入 targets，同一来源引用不得重复，不返回附加来源标记、解释或评审字段。",
].join("\n");

const DESIGN_MODEL_GENERATION_TRACEABILITY_RULES = [
  DESIGN_TRACEABILITY_RULES,
  "首次生成必须同时返回 models 和完整 designModelTraceability；每个设计模型元素必须带上来源，禁止只生成模型后再补来源。",
  "不得通过名称相似、数组位置或轮流分配来补来源；输入没有支撑的业务内容不得生成。",
].join("\n");

const DIAGRAM_SHORT_LABEL_RULES = [
  "关系名称应简明；condition、guard、trigger、约束正文必须完整保留，不能截断或以省略号替代。",
  "协议和端口分别写入 protocol、port。允许在图上换行，不得删减语义。",
].join("\n");

// Keep model semantics intact in downstream prompts, including nested branches and conditions.
function formatDesignModelsForPrompt(models: DesignDiagramModelSpec[]) {
  return JSON.stringify(compactPromptData(models));
}

function formatRequirementRulesForPrompt(rules: RequirementRule[]) {
  // Source fragments are stored for audit, but duplicate rule text in model input.
  return JSON.stringify(rules.map(({ id, text, type }) => ({ id, text, type })));
}

// Extraction chooses one type; conditions and quality targets remain explicit in the text.
const RULE_TYPE_GUIDANCE = [
  "type 只能单选八类：functional 功能需求、business-rule 业务规则、data 数据需求、interaction 界面交互、interface 外部接口、exception 异常处理、quality 质量需求、operations 部署运行。",
  "按句子的主要要求选择类型：资格、额度、计算等选 business-rule；系统行为选 functional；数据结构和保存要求选 data；页面布局和操作交互选 interaction；外部系统交互协议选 interface；失败后的处理选 exception；性能、安全、可用性等可评价指标选 quality；部署环境、技术选型及运行约束选 operations。",
  "同一学生同一时段最多一笔预约=business-rule；学生提交预约=functional；预约保存学生和座位编号=data；通过统一身份认证接口登录=interface；失败后保留输入=exception；95%的查询2秒内完成=quality；必须部署在指定内网=operations。",
  "需求类型到模型的关联由程序固定映射，不输出关联数组或额外分类字段。",
  "text 中保留原文明确的角色、适用对象、时间条件、验收标准、否定、数量和边界；不拆成独立属性，不补造未声明的功能、角色或质量指标。",
  "原文包含多个独立要求时可拆分并保留共同来源；仅有目标、未确认假设或待确认事项时，不得编造成已明确需求。",
  "覆盖原文所有 R、AC、CONFIRMED 标记的已明确要求；PENDING 或待确认内容不得当成已确认需求。",
].join("\n");

export function buildExtractRulesPrompt(requirementText: string) {
  return [
    "请从下面的软件工程实践平台需求中抽取结构化需求规则。",
    "直接返回完整候选 JSON，由后端校验；收到错误反馈后在本对话中返回修正后的完整 JSON。不要输出 Markdown、解释或代码块。",
    "只返回一个顶层 JSON 对象，格式必须是 {\"rules\":[...]}。",
    "每条规则只包含 id、type、text、sourceFragment；sourceFragment 必须逐字来自原文。",
    "text 必须是完整可读的需求条目，至少尽量包含角色/执行者、动作、对象或主体；不要只输出“(1)借书”这类编号短片段。",
    "sourceFragment 保留原始需求中的最小来源片段，可以包含编号或省略句，用于追踪来源。",
    "不要输出额外字段；模型级关联由固定类型表计算，具体模型元素在生成后单独追踪。",
    RULE_TYPE_GUIDANCE,
    "请保证规则编号从 r1 开始连续递增。",
    "",
    "原始需求：",
    requirementText,
  ].join("\n");
}

export function buildGenerateModelsPrompt(
  rules: RequirementRule[],
  selectedDiagrams: DiagramKind[],
) {
  const mappedRules = rules;
  return [
    "请只根据本次绑定的需求规则生成需求阶段 UML 结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[...]}。",
    "requirementModelTraceability 记录本模型实际采用的规则与真实元素的引用；每项只给出 ruleId 和 target。每个业务元素和业务关系必须同时有至少一条真实规则来源；没有来源的业务内容不得生成，禁止返回空数组或仅在 notes 中说明。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    "JSON 必须完整合法，字符串必须正确转义，不能出现未闭合字符串、未闭合数组/对象或裸换行。",
    "每个 model 必须包含：diagramKind, title, summary, notes，以及对应图类型要求的强类型字段。",
    "requirementModelTraceability 必须在首次生成时返回，字段为 ruleId, target；target 必须完整包含 modelId, diagramKind, elementId, elementKind, label。程序检查引用和映射完整性，修复时在本对话中返回完整模型和全部有效来源映射。",
    REQUIREMENT_TRACEABILITY_RULES,
    "notes 必须是字符串数组，不能是对象数组。",
    "所有 relationships[] 必须显式包含 sourceId 和 targetId；如果无法确定端点，不要输出该 relationship。",
    "deployment.relationships[].port 如需填写，必须是字符串，例如 \"8080\"，不能是数字。",
    DIAGRAM_SHORT_LABEL_RULES,
    "你必须从需求项中提取参与者、约束、功能点、流程和部署信息，不能依赖不存在的 SRS 字段。",
    "本阶段只能使用本次绑定的需求规则，不查询或引用任务之外的规则。",
    "需求规则正文是业务事实依据；不得自行补造结论或改写明确的业务条件。",
    "本次绑定的规则范围由后端确定，规则分类不限制来源引用。每条规则应在适当的行为、概念、约束或说明中体现；元素级引用只能指向真实体现该要求的元素，禁止为凑覆盖率虚构节点。",
    "规则正文中的角色、对象、条件和限制是建模依据，不得从缺失的元数据编造事实。",
    "功能结构图以绑定规则中的系统能力为节点；规则正文中的金额限制、字段校验等条件不得自动成为独立功能节点。",
    "总体业务流程只展开改变业务走向的异常；外部协作和信息传递使用当前输入中的外部接口规则，禁止塞入全部技术错误。",
    "用例模型以用户任务为核心；业务规则、前后置条件、输入输出、备选流和异常流放在用例规约及 eventFlows 中，页面布局与按钮样式不得自动变成用例。",
    "领域概念模型表达业务概念、属性、关系、多重性和业务约束；只根据当前输入的数据需求和业务规则发现概念，禁止提前生成数据库表或实现类。",
    "原型界面关系使用本次绑定规则；页面关系依据这些规则正文中明确的入口、状态和返回路径生成。",
    "非功能需求是跨模型约束：从本次绑定规则保留适用的性能、安全、易用性等要求，可放在模型支持的说明字段中，不得一律转成部署节点。",
    "部署需求模型只展开运行环境、容量、可用性、网络、安全隔离及外部系统连接约束；界面易用性和接口字段不应自动产生部署元素。",
    "数字、单位和比较符是受保护语义：达到/至少/不低于/以上必须保持为 >=，不超过/以内必须保持为 <=；不得把“达到5000元（包含正好5000元）”改成“超过5000元”或把互补分支写成“<=5000元”。",
    "判断节点、关系 condition/guard、事件流和 notes 中涉及同一阈值时必须使用一致的比较符；正好等于阈值的路径必须进入已确认规则指定的分支。",
    REQUIREMENT_STAGE_SEMANTICS,
    "只生成以下图类型：",
    selectedDiagrams.join(", "),
    selectedDiagramHardRules(selectedDiagrams),
    "",
    "图类型结构约束：",
    ...requirementDiagramSchemaLines(selectedDiagrams),
    "",
    "禁止输出通用 nodes/relations 旧结构，必须严格按 diagramKind 输出对应字段。",
    "",
    "本次绑定的需求规则（唯一需求来源）：",
    formatRequirementRulesForPrompt(mappedRules),
    "",
  ].join("\n");
}

export function buildGenerateRequirementAnalysisPrompt(
  scopedUseCaseModel: DiagramModelSpec,
) {
  const target = scopedUseCaseModel.diagramKind === "usecase" ? scopedUseCaseModel.useCases[0] : undefined;
  return [
    "请只根据单个用例的事件流，生成需求阶段需求分析顺序图结构化模型。",
    "唯一来源是本次绑定的用例模型；禁止使用原始需求文本、独立需求规则或未绑定的其他模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"requirementModelTraceability\":[...]}，且 models 只包含 diagramKind 为 analysis 的需求分析模型。",
    "你必须且只能为本次目标用例输出一个 analysis 模型。其余 include/extend/generalization 关联用例仅作为参考，保留其事件流、前后置条件和异常，不为它们额外生成模型。",
    "analysis 模型必须包含 modelId, sourceUseCaseId, sourceUseCaseName；modelId 必须是 analysis:<sourceUseCaseId>。",
    "需求分析模型是需求阶段模型：参与对象、消息和组合片段必须来自该 useCase.eventFlows 的角色动作、系统动作、备选流和异常流。",
    "必须使用需求语义短语描述消息，例如“确认删除活动”“校验活动权限”“返回删除失败原因”；禁止使用 deleteEvent(eventId)、remove()、save() 等方法调用写法。",
    "禁止加入设计阶段类名、Service、DAO、Repository、Controller、数据库、数据库表、事务、具体方法实现或持久化细节。",
    "每个带 id 的元素（participants、messages、fragments、branches、activations）必须填写非空 sourceElementIds，引用输入用例模型中真实存在的元素 id；sourceUseCaseId 标识所属用例。requirementModelTraceability 返回空数组 []，不直接引用需求规则；系统保存并采信这些元素级来源，不派生或猜测映射，统一检查所有元素的来源覆盖。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    "JSON 必须完整合法，字符串必须正确转义，不能出现未闭合字符串、未闭合数组/对象或裸换行。",
    DIAGRAM_SHORT_LABEL_RULES,
    "analysis 结构约束：",
    ...modelContractLines("requirements", ["analysis"]),
    "messages[].name 和 fragments[].label 必须是短标签；完整业务解释放 description。",
    "",
    "本次目标用例：",
    JSON.stringify({ sourceUseCaseId: target?.id, sourceUseCaseName: target?.name, outputCount: 1 }),
    "单用例需求阶段用例模型（唯一分析来源）：",
    JSON.stringify(scopedUseCaseModel),
  ].join("\n");
}

const DESIGN_STAGE_SEMANTICS = [
  "设计阶段模型职责：",
  "- 总体架构图(architecture): 系统逻辑架构层，根据绑定的需求功能结构及其明确约束划分包、子系统、核心组件及其依赖，用 PlantUML 包图表示。",
  "- 用例实现设计(sequence): 动态行为层，必须基于用例事件流和需求分析模型，确定对象间具体的方法调用时序，包含正常流程与异常动态行为。",
  "- 页面导航模型(navigation): 界面交互层，根据原型界面关系描述页面、模块、入口点之间的跳转、提交、打开、返回和状态流转。",
  "- 类图(class): 静态结构层，定义实体、接口、聚合根的属性、行为及静态关联（1:N、泛化等）。",
  "- 组件（构件）关系(component): 组件结构层，根据设计类图归并服务、接口、模块和实体职责，展示组件与接口依赖。",
  "- 部署设计(deployment): 物理部署层，展示设备、执行环境、制品部署及其体现的逻辑组件，技术选择必须有上游依据。",
  "- 数据库设计(table): 数据库表结构层，体现表、字段、主键、外键和表间关联基数。",
].join("\n");

function designModelSchemaInstructions(selected: DesignDiagramKind[]) {
  return ["设计模型结构约束：", DIAGRAM_SHORT_LABEL_RULES, ...modelContractLines("design", selected),
    "所有标识唯一、所有引用存在。关系方向遵循 sourceId 到 targetId；组合/聚合 sourceId 是整体，继承 sourceId 是特化类型。",
    "包嵌套使用 parentId，组件归属使用 packageId；contains 关系只能与归属一致。",
    "sequence/analysis：消息按数组顺序发生；alt/par 至少两个带独立 id 的非空 branches，分支消息不重叠且覆盖片段消息。嵌套片段必须引用 parentFragmentId 和 parentBranchId；片段连续且不得交叉。loop 可以覆盖全部消息。独立激活区间使用 activations。对每个片段，激活两端必须在同一分支内，或两端均在片段外并完整包围它；不得只有一端位于某个分支或 loop 中。",
    "navigation 是自定义页面导航模型，包含和模块依赖不代表页面跳转。returns 从当前页面指向返回目的页面。",
    "deployment：nodeType 表达 UML 类别，technology 表达技术；parentId 表示承载，deployment 从制品到节点，manifestation 从制品到逻辑组件。技术选择必须有上游依据。",
    "table：relationalConstraints 是主键、唯一、外键、检查约束的唯一来源；每张表一个主键（可联合）。复合外键列顺序对应且引用唯一键。列 PK/FK 标志、references 和 relationships 由系统派生，无需生成。多对多必须建立关联表。",
  ].join("\n");
}

export function buildGenerateDesignSequencePrompt(
  useCaseModel: DiagramModelSpec,
  analysisModels: DiagramModelSpec[] = [],
  sourceUseCaseId?: string,
) {
  return [
    "请根据本次绑定的需求阶段用例模型事件流和需求分析模型生成设计阶段用例实现设计结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"designModelTraceability\":[...]}，且 models 只包含 diagramKind 为 sequence 的用例实现设计模型。",
    sourceUseCaseId
      ? "只为本次目标用例生成一个用例实现设计，models.length 必须为 1；其余 include/extend/generalization 关联用例仅作为事件流和异常依据，不为它们额外生成模型。"
      : "每个 useCase 必须生成一个独立用例实现设计；models.length 必须等于 useCases.length；禁止把多个用例合成一个总用例实现设计。",
    "每个用例实现设计必须包含 modelId, sourceUseCaseId, sourceUseCaseName；modelId = sequence:<useCaseId>。",
    DESIGN_MODEL_GENERATION_TRACEABILITY_RULES,
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    DESIGN_STAGE_SEMANTICS,
    "只使用本次绑定的用例模型和需求分析模型，所有来源引用必须在这些模型内真实存在；禁止补入其他用例或规则。",
    designModelSchemaInstructions(["sequence"]),
    "每个用例实现设计只表达一个用例的独立对象交互流程，并把该用例 eventFlows 中的角色动作、系统动作、备选流和异常流转化为对象间方法调用时序。",
    "如果输入包含需求分析模型，必须以其业务消息和组合片段作为语义来源，但不能原样复用参与者和消息；必须补充设计阶段 boundary/controller/service/entity/database 等对象职责。",
    "用例实现设计必须明显不同于需求分析模型：参与者应体现界面、控制器、服务、仓储/数据库、实体协作；消息应体现方法调用、参数和返回值。",
    "必须包含主要正常流程；如已确认需求项中存在异常处理或扩展条件，也要用消息或片段表达。",
    "",
    ...(sourceUseCaseId ? ["本次目标用例：", JSON.stringify({ sourceUseCaseId, modelId: `sequence:${sourceUseCaseId}`, outputCount: 1 })] : []),
    "需求阶段用例模型：",
    JSON.stringify(useCaseModel),
    "",
    "需求阶段需求分析模型（可为空）：",
    JSON.stringify(analysisModels),
  ].join("\n");
}

export function buildGenerateDesignModelsPrompt(
  requirementModels: DiagramModelSpec[],
  sequenceModels: DesignDiagramModelSpec[],
  selectedDiagrams: DesignDiagramKind[],
  designContextModels: DesignDiagramModelSpec[] = [],
) {
  // Trace target catalogs are validated server-side, not supplied as unrelated business facts.
  const allowedKinds = new Set(selectedDiagrams.flatMap((kind) => designRequirementSources[kind] ?? []));
  const sources = requirementModels.filter((model) => allowedKinds.has(model.diagramKind));
  const sequences = selectedDiagrams.some(kind => kind === "sequence" || kind === "class") ? sequenceModels : [];
  return [
    "请根据本次指定的需求阶段来源模型和上游设计模型生成设计阶段 UML 结构化模型。",
    "返回 JSON 对象，格式必须是 {\"models\":[...],\"designModelTraceability\":[...]}。",
    DESIGN_MODEL_GENERATION_TRACEABILITY_RULES,
    "本阶段生成的是下游聚合设计模型：总体架构图、设计类图、界面关系图、组件关系图、部署设计、数据库设计都各自保持一张总图，不按用例拆分。",
    "只允许返回一个顶层 JSON 对象，不允许在 JSON 前后输出任何说明、Markdown、代码块或额外文字。",
    DESIGN_STAGE_SEMANTICS.split("\n").filter((line) => !line.startsWith("- ") || selectedDiagrams.some(kind => line.includes(`(${kind})`))).join("\n"),
    designModelSchemaInstructions(selectedDiagrams).split("\n").filter(line => !/^(?:sequence\/analysis|navigation|deployment|table)：/.test(line) || selectedDiagrams.some(kind => line.startsWith(kind))).join("\n"),
    PROMPT_DATA_FORMAT,
    "只使用本次绑定的需求模型和上游设计模型；模型内明确的业务约束必须保留，禁止查询或补入任务之外的规则和模型。",
    "若本次生成总体架构图(architecture)，必须根据绑定的需求阶段功能结构图及其明确约束推导包、子系统、核心组件及其依赖。",
    "若本次生成设计类图(class)，必须从领域概念模型推导实体、属性和关系，从用例模型事件流推导操作与协作职责；不要求先生成用例实现设计。",
    "若本次生成页面导航模型(navigation)，必须从原型界面关系推导页面、路由、打开、提交和返回关系；不要求先生成用例实现设计。",
    "若本次生成数据库设计(table)，表结构必须从设计类图中的持久化实体、属性、关系和约束推导；界面、控制器、无持久化职责的技术服务不得机械转换为表。不要求先生成用例实现设计。",
    "若本次生成组件（构件）关系(component)，必须根据已生成设计类图归并组件和接口。",
    "若本次生成部署设计(deployment)，必须参考已生成组件（构件）关系，把组件映射到物理节点和通信关系。",
    "只生成以下设计图类型：",
    selectedDiagrams.join(", "),
    "",
    "映射规则：",
    "- 需求阶段功能结构图及其明确约束 -> 设计阶段总体架构图（architecture，包图）。",
    "- 需求阶段原型界面关系 -> 设计阶段页面导航模型（navigation，页面与路由）。",
    "- 需求阶段领域概念模型 + 用例模型事件流 -> 设计阶段类图（设计类图），领域结构与用例职责共同确定实体、操作、接口和服务。",
    "- 聚合设计类图 -> 设计阶段组件（构件）关系图。",
    "- 需求阶段部署需求模型 + 组件（构件）关系图 -> 设计阶段部署设计。",
    "- 聚合设计类图中的持久化实体、属性、关系和约束 -> 设计阶段数据库设计。",
    "",
    "需求阶段来源模型：",
    JSON.stringify(compactPromptData(sources)),
    "",
    "本次绑定的用例实现设计：",
    formatDesignModelsForPrompt(sequences),
    "",
    "已生成设计阶段上下文模型：",
    formatDesignModelsForPrompt(designContextModels),
  ].join("\n");
}
