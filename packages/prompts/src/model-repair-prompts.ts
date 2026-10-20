// Appends validation feedback to a model conversation without constraining changes to diagnostic paths.
export function buildModelRepairPrompt(input: { error: string; diagnostics: unknown[] }) {
  return [
    "请基于本对话中上一版完整模型修正以下校验错误，并返回修正后的完整 JSON。",
    "输出必须与首次生成的顶层结构和契约一致，包含当前任务的完整模型及契约要求的全部来源映射；不要返回字段补丁、changes、patch、Markdown 或解释。",
    "错误路径仅用于定位问题。可以联动修改当前模型中的节点、关系、引用和来源映射；不得通过删除需求要求的业务内容、虚构来源或改动其他模型来规避校验。",
    "需求依据、上游模型和任务范围沿用本对话的首次请求。保持已正确的业务语义，修正后重新检查所有引用及来源映射。",
    `解析或校验错误：${input.error}`,
    ...(input.diagnostics.length ? [`完整校验诊断：${JSON.stringify(input.diagnostics)}`] : []),
  ].join("\n");
}
