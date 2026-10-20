// Defines one repair wire format for models, feasibility candidates and document chapters.
export function buildFocusedRepairPrompt(input: {
  targetId: string; mode: string; baseFingerprint: string; paths: string[]; round: number; reason?: string;
  error: string; instruction?: string; current: unknown; references: unknown; sourceFacts?: unknown; replaceScope?: boolean; sourceLabel?: string;
  diagnostics?: unknown;
}) {
  return [
    "修复当前产物已定位的问题，保留所有未授权业务内容。只返回 JSON。",
    PROMPT_DATA_FORMAT,
    `修复上下文：${JSON.stringify({ targetId: input.targetId, mode: input.mode, baseFingerprint: input.baseFingerprint, paths: input.paths, round: input.round, reason: input.reason })}`,
    input.mode === "syntax" ? "仅修复下面 JSON 的语法；保留全部业务字段、字符串和数组次序，不得补造缺失业务内容。返回完整合法 JSON。" : input.replaceScope ?
      "原输出不含可修复的结构化结果。本次明确重新生成此产物，依据下方原始任务返回完整 JSON；不得扩展到其他产物。" :
      `返回 {"targetId":${JSON.stringify(input.targetId)},"baseFingerprint":${JSON.stringify(input.baseFingerprint)},"changes":[{"path":"允许范围内的点分路径","value":修复值}]}。禁止返回整份模型、方案或说明书；禁止修改其他候选或章节。`,
    input.instruction ?? "字段类型、枚举和引用必须与当前模型相容。无法从给定事实确认修改时，不得编造业务事实。",
    "按完整点分路径定位对象；models.N 是数组中的准确位置，不能修改同名字段所在的其他模型。expectedSchema 给出字段类型、数组元素类型、枚举和必填字段；missing 表示缺失，必须按契约补齐，不能凭字段名猜类型。",
    "duplicate-id 的 relatedPaths 是该标识在本模型内的关联引用；改名时同步更新对应引用，保留其原有指向和业务含义，不得把同名但不同类别的对象引用一起替换。",
    `解析或校验错误：${input.error}`,
    ...(input.diagnostics === undefined ? [] : [`完整校验诊断：${JSON.stringify(input.diagnostics)}`]),
    `允许修改路径：${JSON.stringify(input.paths)}`,
    `当前模型修复范围：${JSON.stringify(input.current)}`,
    `可用标识索引：${JSON.stringify(input.references)}`,
    ...(input.sourceFacts === undefined || input.mode === "syntax" ? [] : [`${input.sourceLabel ?? "必要来源事实"}：\n${typeof input.sourceFacts === "string" ? input.sourceFacts : JSON.stringify(input.sourceLabel === "当前产物上下文" ? input.sourceFacts : compactPromptData(input.sourceFacts))}`]),
  ].join("\n");
}
import { compactPromptData, PROMPT_DATA_FORMAT } from "./prompt-data.js";
