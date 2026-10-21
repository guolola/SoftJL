// Records unsupported diagram requests and blocks substitutions until the matching Ask is answered.
import { standardDiagramLabels, type StandardProjectState, type StandardQuestion } from "@uml-platform/contracts";
import { resolveStandardGenerationSelection } from "./standard-generation-scope.js";

const unsupportedNames: Array<[string, RegExp]> = [
  ["UML 状态图", /状态(?:机)?图|state(?:\s*machine)?\s+diagram/i],
  ["UML 对象图", /对象图|object\s+diagram/i],
  ["UML 包图", /包图|package\s+diagram/i],
  ["UML 组件图", /组件图|构件图|component\s+diagram/i],
  ["UML 部署图", /部署图|deployment\s+diagram/i],
  ["UML 通信图", /通信图|协作图|(?:communication|collaboration)\s+diagram/i],
  ["UML 定时图", /定时图|计时图|timing\s+diagram/i],
  ["UML 交互概览图", /交互(?:概览|总览)图|interaction\s+overview\s+diagram/i],
  ["数据流图", /数据流图|data\s+flow\s+diagram/i],
  ["思维导图", /思维导图|mind\s*map/i],
  ["甘特图", /甘特图|gantt\s+chart/i],
];

export function detectUnsupportedStandardDiagrams(text: string): string[] {
  const requested = new Set<string>();
  for (const part of text.split(/[，,。；;\n]/u)) {
    const value = part.trim();
    let recognized = false;
    for (const [name, pattern] of unsupportedNames) {
      const match = pattern.exec(value);
      if (!match) continue;
      const before = value.slice(0, match.index);
      const after = value.slice(match.index + match[0].length);
      if (/不要|不用|无需|不生成|不画|不修改|暂不|do not|don't/i.test(before) || /^\s*(?:不生成|不画|不修改)/u.test(after)) continue;
      const bareName = /^(?:UML\s*)?$/i.test(before) && /^[。！？!?\s]*$/u.test(after);
      if (bareName || /生成|绘制|画|制作|新增|补充|修改|重试|需要|generate|draw|create|add|update/i.test(before + after)) { requested.add(name); recognized = true; }
    }
    // Direct requests for unfamiliar names fail closed instead of being mapped to a nearby supported kind.
    if (!recognized) {
      const candidate = /^(?:(?:请|帮我|再|继续|能否|可以|想要|我要)\s*)*(?:生成|绘制|画|制作|新增|补充)\s*(?:一张|一个|一幅|UML\s*)*([^，,。；;！？?：:\s]{1,40}?图)/iu.exec(value)?.[1]
        ?? /^(?:please\s+)?(?:generate|draw|create|add)\s+(?:an?\s+)?([a-z][a-z -]{0,50}?(?:diagram|chart))\b/i.exec(value)?.[1];
      if (candidate && !resolveStandardGenerationSelection(`生成${candidate}`, true)?.length) requested.add(candidate);
    }
  }
  return [...requested];
}

export function unsupportedDiagramNotice(models: string[], language?: "zh-CN" | "en") {
  return language === "en"
    ? `This platform does not support ${models.join(", ")}. No other diagram will be substituted automatically. Any supported alternative requires your confirmation in the Ask choices before generation.`
    : `当前平台不支持生成${models.map(name => `「${name}」`).join("、")}，不会擅自替换成其他图。如果需要其他受支持的图，必须先通过询问组件选择并确认后再生成。`;
}

export function recordUnsupportedDiagramRequest(state: StandardProjectState, models: string[], messageId: string, language?: "zh-CN" | "en") {
  const previous = state.unsupportedDiagramRequest;
  const names = [...new Set([...(previous?.models ?? []), ...models])];
  if (!names.length || names.length > 8) throw new Error("请一次说明最多八种不支持的模型");
  state.unsupportedDiagramRequest = { models: names, messageId };
  // Earlier supported types are not consent to substitute for this request.
  state.generationScope = { status: "confirmed", kinds: [] };
  state.conversation ??= [];
  const id = `unsupported:${messageId}`;
  const notice = { id, role: "assistant" as const, text: unsupportedDiagramNotice(names, language), status: "completed" as const, createdAt: new Date().toISOString() };
  const existing = state.conversation.find(message => message.id === id);
  if (existing) existing.text = notice.text; else state.conversation.push(notice);
}

export function assertStandardDiagramSubstitutionAllowed(state: StandardProjectState) {
  if (state.unsupportedDiagramRequest) throw new Error("请求的模型不受支持；替代图必须先通过 ask_questions 询问组件确认，不能沿用旧范围、文字同意或推荐快捷操作直接生成");
}

export function prepareStandardAlternativeQuestion(question: StandardQuestion, models: string[], language?: "zh-CN" | "en") {
  if (!question.scopeChoices?.some(choice => !choice.kinds.length) || !question.scopeChoices.some(choice => choice.kinds.length)) {
    throw new Error("替代方案必须同时提供受支持的模型选项和不生成选项");
  }
  // Canonical labels disclose the actual output type even if the Agent supplied a misleading label.
  for (const choice of question.scopeChoices) choice.label = choice.kinds.length
    ? (language === "en" ? "Generate instead: " : "改为生成：") + choice.kinds.map(kind => standardDiagramLabels[kind]).join("、")
    : language === "en" ? "Do not generate an alternative" : "不生成替代图";
  question.title = language === "en"
    ? `${models.join(", ")} is not supported. Choose whether to generate a different supported diagram.`
    : `当前不支持${models.map(name => `「${name}」`).join("、")}。是否改为生成其他受支持的图？`;
  question.options = question.scopeChoices.map(choice => choice.label);
  question.recommendation = (language === "en"
    ? "These choices generate different diagram types, not equivalent versions of the requested model. "
    : "以下选项会生成不同类型的图，不是原模型的等价替代。") + question.recommendation;
}
