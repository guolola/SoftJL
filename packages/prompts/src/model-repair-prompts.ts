// Appends validation feedback to a model conversation without constraining changes to diagnostic paths.
export function buildModelRepairPrompt(input: { error: string; diagnostics: unknown[] }) {
  return [
    "请基于本对话中上一版完整模型修正以下校验错误，并返回修正后的完整 JSON。",
    "输出必须与首次生成的顶层结构和契约一致，包含当前任务的完整模型及契约要求的全部来源映射；不要返回字段补丁、changes、patch、Markdown 或解释。",
    "错误路径仅用于定位问题。可以联动修改当前模型中的节点、关系、引用和来源映射；不得通过删除需求要求的业务内容、虚构来源或改动其他模型来规避校验。",
    "需求依据、上游模型和任务范围沿用本对话的首次请求。保持已正确的业务语义，修正后重新检查所有引用及来源映射。",
    "来源映射诊断中，actual 是收到的引用及实际模型身份，expected.legalSources 是本次范围内的合法模型、元素 id 或适用规则，expected.legalRuleSources 按模型列出适用规则。按实际模型的 diagramKind 和真实元素 id 修正引用；需求分析模型为 analysis，用例实现设计为 sequence，不能因图形相似混用。",
    "合法来源仅用于核对引用身份和范围，不代表候选元素之间存在业务来源关系；必须结合首次请求中的事实选择有依据的来源，禁止按名称相似、数组位置或轮流分配来源，禁止把当前输出作为自己的直接上游。",
    `解析或校验错误：${input.error}`,
    ...(input.diagnostics.length ? [`完整校验诊断：${JSON.stringify(input.diagnostics)}`] : []),
  ].join("\n");
}
