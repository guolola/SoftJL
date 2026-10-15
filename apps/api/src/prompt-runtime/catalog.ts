// Describes the active prompt instructions that administrators may version.
export type CatalogEntry = {
  id: string;
  path: string[];
  instruction: string;
  match: string;
  source: string;
  kind?: "prompt" | "skill" | "locked";
};

const entry = (id: string, path: string[], instruction: string, source: string, match = instruction): CatalogEntry => ({ id, path, instruction, match, source });

export const catalog: CatalogEntry[] = [
  entry("requirements.extract", ["需求建模", "规则抽取"], "请从下面的软件工程实践平台需求中抽取结构化需求规则。", "model-prompts.ts"),
  entry("requirements.extract-repair", ["需求建模", "规则抽取修复"], "请修复上一条需求规则抽取 JSON 的校验错误。", "model-prompts.ts"),
  ...(["context", "function", "usecase", "class", "activity", "deployment", "prototype"] as const).map((kind) =>
    entry(`requirements.model.${kind}`, ["需求建模", "模型生成", kind], "请根据已确认的需求规则和 RequirementBaseline 生成需求阶段 UML 结构化模型。", "model-prompts.ts")),
  entry("requirements.analysis", ["需求建模", "需求分析顺序图"], "请只根据单个用例的事件流，生成需求阶段需求分析顺序图结构化模型。", "model-prompts.ts"),
  entry("requirements.repair", ["需求建模", "模型修复"], "请修复下面不符合要求的 UML 结构化模型 JSON 输出。", "model-prompts.ts"),
  entry("requirements.trace", ["需求建模", "追踪关系生成"], "请为已经生成成功的需求阶段 UML 模型补充元素级可追踪关系。", "model-prompts.ts"),
  entry("requirements.trace-repair", ["需求建模", "追踪关系修复"], "请修复需求模型元素级可追踪关系 JSON。", "model-prompts.ts"),
  entry("requirements.activity-compact", ["需求建模", "超时重试", "总体业务流程"], "请只生成需求阶段总体业务流程 activity 模型。", "requirements-pipeline.ts"),
  entry("requirements.analysis-compact", ["需求建模", "超时重试", "需求分析"], "请只为单个用例生成需求分析顺序图 analysis 模型。", "requirements-pipeline.ts"),
  entry("requirements.rule-repair", ["需求建模", "规则修复", "单条"], "你是需求规则字段级修复助手。只修复当前一条需求规则的结构化字段，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。", "requirement-rule-repair.ts"),
  entry("requirements.rules-repair", ["需求建模", "规则修复", "批量"], "你是需求规则批量字段级修复助手。一次性为多条需求规则生成结构化字段修复候选，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。", "requirement-rule-repair.ts"),
  entry("feasibility.context", ["可行性分析", "系统环境图"], "根据已确认需求生成系统上下文结构。", "feasibility-prompts.ts"),
  entry("feasibility.business-flow", ["可行性分析", "业务与系统流程图"], "根据已确认需求规则生成可行性分析阶段的“业务与系统流程图”，使用一张 UML 泳道活动图展示目标系统参与的核心端到端业务流程。", "feasibility-business-flow-prompt.ts"),
  entry("feasibility.implementation", ["可行性分析", "实现方案"], "根据系统环境图、业务与系统流程图、需求基线和补充资料生成恰好 2 个可执行候选方案，两个候选都必须包含完整 implementation；recommendedCandidateId 必须引用其中一个候选方案。", "feasibility-prompts.ts"),
  entry("feasibility.json-repair", ["可行性分析", "业务流程修复"], "仅修复业务与系统流程图的结构、泳道归属、连通性和需求追踪错误，不得编造需求步骤。", "feasibility-prompts.ts"),
  entry("feasibility.plan-repair", ["可行性分析", "方案 JSON 修复"], "只修复校验错误涉及的字段或章节，其余内容必须原样保留。", "feasibility-prompts.ts"),
  entry("feasibility.section-repair", ["可行性分析", "章节修复"], "仅修复候选方案索引", "feasibility-prompts.ts"),
  entry("design.sequence", ["设计建模", "用例实现设计"], "请根据已确认需求项、需求阶段用例模型事件流和需求分析模型生成设计阶段用例实现设计结构化模型。", "model-prompts.ts"),
  ...(["architecture", "class", "navigation", "component", "deployment", "table"] as const).map((kind) =>
    entry(`design.model.${kind}`, ["设计建模", "模型生成", kind], "请根据已确认需求项、需求阶段模型和全部用例实现设计生成设计阶段 UML 结构化模型。", "model-prompts.ts")),
  entry("design.repair", ["设计建模", "模型修复"], "请修复下面不符合要求的设计阶段 UML 结构化模型 JSON 输出。", "model-prompts.ts"),
  entry("design.trace", ["设计建模", "追踪关系生成"], "请为已经生成成功的设计阶段 UML 模型补充元素级可追踪关系。", "model-prompts.ts"),
  entry("design.trace-repair", ["设计建模", "追踪关系修复"], "请修复设计模型元素级可追踪关系 JSON。", "model-prompts.ts"),
  
  
  
  
  
  
  
  
  
  
  entry("documents.generate", ["文档与渲染", "文档正文生成"], "请根据平台当前产物生成", "document-prompts.ts"),
  entry("documents.repair", ["文档与渲染", "文档正文修复"], "请修复《", "document-prompts.ts"),
  { id: "shared.json", path: ["共用约束", "JSON 系统指令"], instruction: "你是一个严谨的软件需求与 UML 建模助手。你必须只返回 JSON，不要输出 Markdown、解释或代码围栏。", match: "", source: "model-prompts.ts", kind: "locked" },
  { id: "shared.schema", path: ["共用约束", "结构化输出契约"], instruction: "由代码中的 JSON Schema、输入数据和安全约束生成，不开放编辑。", match: "", source: "response-formats", kind: "locked" },
  
];

export const catalogById = new Map(catalog.map((item) => [item.id, item]));

export function findPromptForMessage(content: string): CatalogEntry | null {
  if (content.startsWith("请根据已确认的需求规则和 RequirementBaseline 生成需求阶段 UML 结构化模型。")) {
    const kind = content.match(/只生成以下图类型：\s*\n([^\n]+)/u)?.[1]?.trim();
    return catalogById.get(`requirements.model.${kind}`) ?? null;
  }
  if (content.startsWith("请根据已确认需求项、需求阶段模型和全部用例实现设计生成设计阶段 UML 结构化模型。")) {
    const kind = content.match(/只生成以下设计图类型：\s*\n([^\n]+)/u)?.[1]?.trim();
    return catalogById.get(`design.model.${kind}`) ?? null;
  }
  return catalog.find((item) => item.kind !== "locked" && item.kind !== "skill" && item.match && content.slice(0, 300).includes(item.match)) ?? null;
}
