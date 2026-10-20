// Measures prompt sections without persisting source text, credentials, image bytes, or guessed provider tokens.
import type { RunInputMetrics } from "@uml-platform/contracts";
import type { ChatMessage, ChatCompletionResponseFormat } from "../../../llm.js";

export function promptInputMetrics(messages: ChatMessage[], responseFormat?: ChatCompletionResponseFormat | null): RunInputMetrics {
  const sections: Record<string, number> = {};
  let total = 0;
  let repair: RunInputMetrics["repair"];
  const add = (key: string, text: string) => { sections[key] = (sections[key] ?? 0) + text.length; };
  for (const message of messages) {
    const texts = typeof message.content === "string" ? [message.content] : message.content.flatMap(part => part.type === "text" ? [part.text] : []);
    for (const text of texts) {
      total += text.length;
      let section = message.role === "assistant" ? "currentModel" : "instructions";
      for (const line of text.split(/(?<=\n)/)) {
        if (line.startsWith("修复上下文：")) {
          try { repair = JSON.parse(line.slice("修复上下文：".length)); } catch { /* Counts still cover malformed diagnostics. */ }
        }
        if (/^(?:本模型契约|.*JSON Schema:)/.test(line)) section = "contract";
        else if (/^(?:RequirementBaseline|已确认需求项|需求规则|来源事实)/.test(line)) section = "rules";
        else if (/^(?:需求阶段来源模型|全部用例实现设计|已生成设计阶段上下文模型|单用例需求阶段用例模型|需求阶段用例模型|需求分析模型)/.test(line)) section = "upstreamModels";
        else if (/^(?:本轮完整模型|当前完整模型|已生成设计模型)/.test(line)) section = "currentModel";
        else if (/^(?:上一次|待修复输出|当前候选章节|当前模型修复范围|解析或校验错误|已核实错误)/.test(line)) section = "repair";
        if (line.startsWith("依据：") || line.startsWith("来源依据：")) {
          try {
            const source = JSON.parse(line.slice(line.indexOf("：") + 1));
            let accounted = 0;
            for (const [key, value] of Object.entries(source)) {
              const property = JSON.stringify({ [key]: value }).slice(1, -1);
              accounted += property.length;
              add(["baseline", "rules"].includes(key) ? "rules" : /traceability/i.test(key) ? "traceability" : key === "upstreamModels" ? "upstreamModels" : "instructions", property);
            }
            sections.instructions = (sections.instructions ?? 0) + line.length - accounted;
            continue;
          } catch { /* Unstructured prompts still receive a complete total. */ }
        }
        add(section, line);
      }
    }
  }
  return { unit: "utf16-characters", messages: total, responseFormat: responseFormat ? JSON.stringify(responseFormat).length : 0, sections, ...(repair ? { repair } : {}) };
}
