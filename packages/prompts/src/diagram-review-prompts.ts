// Builds distinct structural, visual and repair instructions from the stage-specific model review profile.
import { getModelReviewProfile, getStageModelSchema, generationResponseSchema, type AnyDiagramModel, type ModelingStage, type ModelRenderMapping } from "@uml-platform/contracts";

const response = '只返回 JSON {"passed":boolean,"issues":string[],"findings":[{"id":string,"modelId":string,"layer":"model"或"image","code":string,"category":"model_structure"或"business_content"或"render_mismatch"或"check_execution","elementId"?:string,"relationshipId"?:string,"path"?:string,"expected"?:任意值,"actual"?:任意值,"observation":string,"evidence":[{"source":string,"reference":string,"detail":string}],"verification":"unverified","repairable":false}]}。仅报告问题，不把核对通过的项目列为问题。';
const boundaries = 'UML规范或模型内部一致性错误归为 model_structure；角色选择、功能划分、业务关系和约束含义疑问归为 business_content；模型有元素或关系但图面缺失／符号错误归为 render_mismatch；输入不完整、无法辨认或检查失败归为 check_execution。系统执行业务动作不意味着系统应当成为外部参与者。\n不检查或报告位置、间距、交叉、绕线、绕行、遮挡、字体大小及可读性建议。无法辨认结构时只报告检查未完成，不推断缺失。';

export function buildDiagramStructureReviewPrompt(input: { stage: ModelingStage; model: AnyDiagramModel; basis?: unknown; diagnostics?: unknown }) {
  const profile = getModelReviewProfile(input.stage, input.model.diagramKind);
  return [`核对 ${profile.id} 的结构与业务内容。`, `检查类型：${profile.label}；规则来源：${profile.source}，只适用平台支持的建模子集。`,
    "结构检查规则：", ...profile.structure, "业务内容核对：", ...profile.content, boundaries, response,
    `本模型契约：${JSON.stringify(generationResponseSchema(getStageModelSchema(input.stage, input.model.diagramKind)!))}`,
    `程序诊断：${JSON.stringify(input.diagnostics ?? [])}`, `依据：${JSON.stringify(input.basis ?? {})}`, `本轮完整模型：${JSON.stringify(input.model)}`].join("\n");
}

export function buildDiagramImageReviewPrompt(input: { stage: ModelingStage; model: AnyDiagramModel; source: string; mapping?: ModelRenderMapping }) {
  const profile = getModelReviewProfile(input.stage, input.model.diagramKind);
  return [`核对 ${profile.id} 的图片与模型。`, `检查类型：${profile.label}；先独立观察图片中的节点与连线，再逐项对照模型和绘图映射。`,
    "此模型图面检查重点：", ...profile.image, "此模型结构依据：", ...profile.structure, boundaries, response,
    `模型 ID：${input.model.modelId ?? input.model.diagramKind}`, `结构化模型：${JSON.stringify(input.model)}`, `PlantUML 源码：${input.source}`, `绘图映射：${JSON.stringify(input.mapping)}`].join("\n");
}

export function buildDiagramStructuralRepairPrompt(input: { stage: ModelingStage; model: AnyDiagramModel; basis?: unknown; diagnostics: unknown }) {
  const profile = getModelReviewProfile(input.stage, input.model.diagramKind);
  return [`修复 ${profile.id} 的已核实结构错误。`, '只返回 {"model":完整模型}。只修改已核实规则涉及的结构字段；保留业务元素标识、名称、职责、条件、事件流及消息次序，禁止自由增删业务内容。',
    "本模型结构规则：", ...profile.structure, `本模型契约：${JSON.stringify(generationResponseSchema(getStageModelSchema(input.stage, input.model.diagramKind)!))}`,
    `已核实错误：${JSON.stringify(input.diagnostics)}`, `来源依据：${JSON.stringify(input.basis ?? {})}`, `当前完整模型：${JSON.stringify(input.model)}`].join("\n");
}
