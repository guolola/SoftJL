// Keeps business verification inside the original generation turn instead of a separate reviewer request.
import { getModelReviewProfile, type ModelingStage } from "@uml-platform/contracts";

export const GENERATION_BUSINESS_SELF_CHECK = "生成阶段业务自检：在返回最终 JSON 前，对照本次权威输入核对业务覆盖、职责与来源一致性，保留明确的条件、阈值、顺序、备选和异常路径；发现遗漏或矛盾先在本次生成中修正。不得虚构业务事实，不确定内容只按既定输出字段记录。只输出最终产物，不输出自检过程、检查清单或额外复核报告。";

export function modelGenerationSelfCheck(stage: ModelingStage, kinds: string[]) {
  return [GENERATION_BUSINESS_SELF_CHECK, ...[...new Set(kinds)].map(kind => {
    const profile = getModelReviewProfile(stage, kind);
    return `${profile.id} 业务重点：${profile.content.join("；")}`;
  })].join("\n");
}
