// Builds document content prompts for downstream API pipelines.
import type {
  DocumentKind,
} from "@uml-platform/contracts";



function truncateForPrompt(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 32))}\n...（内容已截断）`;
}

function stringifyDocumentContext(value: unknown) {
  // Chapter inputs already scope models and retain the fixed directory/terms.
  // Truncating this JSON could silently remove a chapter's required headings.
  if (value && typeof value === "object" && "chapterInstruction" in value) return JSON.stringify(value, null, 2);
  return truncateForPrompt(JSON.stringify(value, null, 2), 28000);
}

export function buildGenerateDocumentContentPrompt(
  documentKind: DocumentKind,
  context: unknown,
) {
  const isRequirements = documentKind === "requirementsSpec";
  const isFeasibility = documentKind === "feasibilityStudy";
  const title = isRequirements
    ? "需求规格说明书"
    : documentKind === "softwareDesignSpec"
      ? "软件设计说明书"
      : "可行性研究报告";
  const hierarchy = isRequirements
    ? [
        "标题 1：项目引言、需求概述、功能需求（用例模型）、数据需求（领域概念模型）、运行需求、界面需求、需求分析、其它需求、尚未解决的问题、附录。",
        "标题 2：编写目的、基线、定义与标识、参考资料、系统目标、文本需求、功能结构、总体业务流程、用例图、用户（角色）和跟踪关系、用例、领域概念模型、类的描述、类与类的关系、部署需求模型、部署描述、界面关系图、界面总体描述、性能/安全/操作/其它需求约束。",
        "标题 3：功能结构详述、跟踪关系、总体业务流程详述、对应用例的顺序图描述和跟踪关系。",
        "图位置：function 放功能结构，activity 放总体业务流程，usecase 放用例图，class 放领域概念模型，deployment 放部署需求模型，prototype 放界面关系图，analysis:<useCaseId> 放对应“用例的分析”。",
      ]
    : isFeasibility
      ? [
          "标题 1：引言、可行性研究的前提、所建议的系统、可选择的其他系统方案、投资及效益分析、社会因素方面的可行性、结论。",
          "标题 2 和标题 3：严格复用 canonicalSections 中的固定小节；不得生成‘对现有系统的分析’，不得恢复旧版九章目录或新增目录标题。",
          "处理流程和数据流程只生成文字说明，不创建或标记流程图；系统上下文图（系统环境图）和追踪表只放在背景小节。",
          "里程碑只放在对开发的影响，风险登记只放在局限性，成本收益只放在投资及效益分析对应小节。",
          "推荐实现方案、风险、里程碑、五类结论和总体决策只能使用 recommendedCandidateId 指向候选方案的 implementation；其他候选只进入备选方案比较。",
          "用户事实保持原文；AI 估算区间必须保留估算依据和来源状态，金额、比率、回收期和敏感性数值使用 canonicalSections 中的系统计算结果。",
        ]
      : [
        "标题 1：引言、系统总体架构 (System Architecture)、用例实现设计 (Use Case Realization)、领域模型设计 (Static Class & Domain Model)、交互响应与前端组件设计 (UI/UX Componentization)、数据库设计 (Persistence & Data Strategy)、组件设计、部署设计与交付 (Deployment & CI/CD)、尚未设计的问题。",
        "标题 2：系统概述、基线、定义与标识、参考资料、系统总体逻辑流程设计、系统架构设计、对应用例的实现方案、设计类图、设计类描述、设计类之间的关系、需求到类跟踪矩阵、界面关系图、界面的详述、表与表的关系图、表的详述、表与表的关系详述、设计阶段的组件关系图、组件描述、设计阶段的部署图、部署描述。",
        "标题 3：流程描述、总体架构描述、方案描述、各类跟踪关系。",
        "图位置：requirement:activity 放系统总体逻辑流程设计，architecture 放系统架构设计，sequence:<useCaseId> 放对应“用例的实现方案”，class 放设计类图，navigation 放页面导航模型，table 放表与表的关系图，component 放组件关系图，deployment 放设计阶段部署图。",
      ];

  return [
    `请根据平台当前产物生成《${title}》的结构化正文。`,
    "输出 JSON，必须符合接口 schema。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码块。",
    "必须严格按照当前产物上下文 canonicalSections 中给出的标题、顺序和层级返回 sections。",
    "不得删除、合并、重排、改名或新增章节；章节编号由平台自动生成，title 不要手写编号。",
    "如果 canonicalSections 指定 tableHeaders，必须为该章节返回 table，headers 必须与 tableHeaders 完全一致。",
    "如果 canonicalSections 指定 diagramKind，只需保留该小节正文；图像由平台在固定位置插入，不要另建图示小节。",
    "",
    "模板层级要求：",
    ...hierarchy,
    "",
    "写作要求：",
    "- 正文要像课程软件工程文档，不要写成运行报告或聊天总结。",
    "- 必须保留标题 1、标题 2、标题 3 的完整层级，不要只生成一级标题。",
    "- 不得出现具体大学、学院、教师、班级、学号、姓名等未由用户输入明确提供的真实机构或个人信息。",
    "- 不得虚构年份、版本基线日期、制度名称或参考资料；只有当前上下文中明确出现的年份和《资料名称》才可写入正文。",
    "- 表格内容必须来自已确认需求项、模型、类、表、接口或图产物，不要虚构无法追溯的系统能力。",
    "- 不允许输出占位或跳转话术，包括“当前阶段未明确”“待补充”“待完善”“后续评审”“后续补充”“见某小节/章节/部分”。",
    "- 如果信息不足，必须根据需求文本、需求规则、模型元素、追踪关系和图产物在本节内写出可交付说明；不要让读者去其它章节寻找答案。",
    "- 用户角色、外部约束、性能/安全/操作约束、类/表/部署/界面描述都要在对应章节展开描述。",
    "",
    "当前产物上下文：",
    stringifyDocumentContext(context),
  ].join("\n");
}

export function buildRepairDocumentContentPrompt(
  documentKind: DocumentKind,
  context: unknown,
  previousOutput: string,
  errorMessage: string,
) {
  const title =
    documentKind === "requirementsSpec"
      ? "需求规格说明书"
      : documentKind === "softwareDesignSpec"
        ? "软件设计说明书"
        : "可行性研究报告";

  return [
    `请修复《${title}》正文生成结果的 JSON 结构。`,
    "你是说明书结构化正文修复助手。",
    "只允许返回一个顶层 JSON 对象，不允许输出 Markdown、解释或代码围栏。",
    "返回格式必须是 {\"sections\":[...]}。",
    "必须严格按照当前产物上下文 canonicalSections 中给出的标题、顺序和层级返回 sections。",
    "不得删除、合并、重排、改名或新增章节；章节编号由平台自动生成，title 不要手写编号。",
    "如果 canonicalSections 指定 tableHeaders，必须为该章节返回 table，headers 必须与 tableHeaders 完全一致。",
    "不得输出占位或跳转话术，包括“当前阶段未明确”“待补充”“待完善”“后续评审”“后续补充”“见某小节/章节/部分”。",
    "不得虚构年份、版本基线日期、制度名称或参考资料；错误中列出的无来源事实必须删除，不能换一种写法保留。",
    "",
    "sections 每项字段：",
    "- level: 只能是 1、2、3。",
    "- title: 小节标题，不要包含 Markdown 符号。",
    "- body: 段落数组，每段为完整中文说明。",
    "- table: 可选，格式为 {headers:string[], rows:string[][]}。",
    "- diagramKind: 可选，只能标记已有图产物对应的小节。",
    "",
    "必须保留上一轮输出中可用的文档内容，但要修复 JSON 语法、字段类型、缺失字段和 schema 不匹配问题。",
    "如果某些内容无法安全还原，请基于当前上下文中的需求文本、模型元素和追踪关系改写为本节内完整说明，不要输出占位文字。",
    "",
    "解析或校验错误：",
    errorMessage,
    "",
    "上一轮原始输出：",
    truncateForPrompt(previousOutput, 16000),
    "",
    "当前产物上下文：",
    stringifyDocumentContext(context),
  ].join("\n");
}
