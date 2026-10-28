// Describes the active prompt instructions that administrators may version.
import type { PromptRuntimeMode } from "@uml-platform/contracts";
import { requirementModelInstruction, designModelInstruction, REQUIREMENT_EXTRACTION_INSTRUCTION, REQUIREMENT_ANALYSIS_INSTRUCTION, DESIGN_SEQUENCE_INSTRUCTION, FEASIBILITY_CONTEXT_INSTRUCTION, FEASIBILITY_BUSINESS_FLOW_INSTRUCTION, FEASIBILITY_IMPLEMENTATION_INSTRUCTION } from "@uml-platform/prompts";
import { standardCatalog } from "./standard-catalog.js";
export type CatalogEntry = {
  id: string;
  path: string[];
  instruction: string;
  match: string;
  source: string;
  mode: PromptRuntimeMode;
  kind?: "prompt" | "skill" | "reference" | "rules" | "locked";
  description: string;
  maxContentLength?: number;
  resourcePath?: string;
};

const entry = (id: string, path: string[], instruction: string, source: string, match = instruction): CatalogEntry => ({ id, path, instruction, match, source, mode: "professional", description: "仅用于工程建模；固定契约和项目输入由服务端拼装。" });

const requirementLabels = { context: "系统环境图", function: "功能结构图", usecase: "用例模型", class: "领域概念模型", activity: "总体业务流程", deployment: "部署需求模型", prototype: "原型界面关系" };
const designLabels = { architecture: "总体架构图", class: "设计类图", navigation: "页面导航模型", component: "组件（构件）关系", deployment: "部署设计", table: "数据库设计" };

export const catalog: CatalogEntry[] = [
  ...standardCatalog,
  entry("requirements.extract", ["需求建模", "规则抽取"], REQUIREMENT_EXTRACTION_INSTRUCTION, "model-prompts.ts"),
  ...(["context", "function", "usecase", "class", "activity", "deployment", "prototype"] as const).map((kind) =>
    entry(`requirements.model.${kind}`, ["需求建模", "模型生成", requirementLabels[kind]], requirementModelInstruction([kind]), "model-prompts.ts")),
  entry("requirements.analysis", ["需求建模", "需求分析顺序图"], REQUIREMENT_ANALYSIS_INSTRUCTION, "model-prompts.ts"),
  entry("requirements.activity-compact", ["需求建模", "超时重试", "总体业务流程"], "请只生成需求阶段总体业务流程 activity 模型，使用与可行性分析一致的竖向泳道结构。每个 activity 的 actorOrLane 引用真实泳道，关系仅使用 control_flow；分支用 decision/merge，并行用 fork/join，循环用明确判断和回路。", "requirements-pipeline.ts"),
  entry("requirements.analysis-compact", ["需求建模", "超时重试", "需求分析"], "请只为单个用例生成需求分析顺序图 analysis 模型。", "requirements-pipeline.ts"),
  entry("feasibility.context", ["可行性分析", "系统环境图"], FEASIBILITY_CONTEXT_INSTRUCTION, "feasibility-prompts.ts"),
  entry("feasibility.business-flow", ["可行性分析", "业务流程图"], FEASIBILITY_BUSINESS_FLOW_INSTRUCTION, "feasibility-business-flow-prompt.ts"),
  entry("feasibility.implementation", ["可行性分析", "实现方案"], FEASIBILITY_IMPLEMENTATION_INSTRUCTION, "feasibility-prompts.ts"),
  entry("design.sequence", ["设计建模", "用例实现设计"], DESIGN_SEQUENCE_INSTRUCTION, "model-prompts.ts"),
  ...(["architecture", "class", "navigation", "component", "deployment", "table"] as const).map((kind) =>
    entry(`design.model.${kind}`, ["设计建模", "模型生成", designLabels[kind]], designModelInstruction([kind]), "model-prompts.ts")),


  entry("documents.generate", ["文档与渲染", "文档正文生成"], "请根据平台当前产物生成", "document-prompts.ts"),
  entry("shared.model-repair", ["共用约束", "模型完整输出修复"], "请基于本对话中上一版完整模型修正以下校验错误，并返回修正后的完整 JSON。", "model-repair-prompts.ts"),
  entry("shared.field-repair", ["共用约束", "方案与文档字段修复"], "修复当前产物已定位的问题，保留所有未授权业务内容。只返回 JSON。", "generation-repair-prompts.ts"),
  { id: "shared.json", mode: "professional", description: "工程建模的固定系统约束。", path: ["共用约束", "JSON 系统指令"], instruction: "你是一个严谨的软件需求与 UML 建模助手。你必须只返回 JSON，不要输出 Markdown、解释或代码围栏。", match: "", source: "model-prompts.ts", kind: "locked" },
  { id: "shared.schema", mode: "professional", description: "响应字段与安全边界由代码维护。", path: ["共用约束", "结构化输出契约"], instruction: "由代码中的 JSON Schema、输入数据和安全约束生成，不开放编辑。", match: "", source: "response-formats", kind: "locked" },

];

export const catalogById = new Map(catalog.map((item) => [item.id, item]));

export function findPromptForMessage(content: string): CatalogEntry | null {
  // Only instruction positions may select a version; quoted project facts must not do so.
  const instruction = content.startsWith("只返回一个 JSON 对象，不要 Markdown、代码围栏或解释文字。\n")
    ? content.slice(content.indexOf("\n") + 1) : content;
  return catalog.find((item) => item.mode === "professional" && item.kind !== "locked" && item.match && instruction.startsWith(item.match)) ?? null;
}
