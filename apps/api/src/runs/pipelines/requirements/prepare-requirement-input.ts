// Binds text sources and original images to stable evidence units without a separate transcription call.
import type { RunSnapshot } from "@uml-platform/contracts";
import type { ChatMessage } from "../../../adapters/llm/llm-transport.js";
import { splitRequirementInput, type RequirementSourceUnit } from "../../../normalizers/requirements/requirement-source-units.js";

export interface RequirementInputImage {
  unitId: string;
  sourceLabel: string;
  url: string;
}
export interface PreparedRequirementInput {
  sourceText: string;
  sourceUnits: RequirementSourceUnit[];
  images: RequirementInputImage[];
}

export function requirementMultimodalContent(text: string, images: RequirementInputImage[]): ChatMessage["content"] {
  return images.length ? [{ type: "text", text }, ...images.flatMap((image): Exclude<ChatMessage["content"], string> => [
    { type: "text", text: `来源 ${image.unitId}：${image.sourceLabel}` },
    { type: "image_url", image_url: { url: image.url } },
  ])] : text;
}

export function prepareRequirementInput(snapshot: RunSnapshot): PreparedRequirementInput {
  let sourceText = snapshot.submittedRequirementText ?? snapshot.requirementText;
  const sourceUnits = splitRequirementInput(sourceText);
  const images: RequirementInputImage[] = [];
  for (const [index, attachment] of (snapshot.attachments ?? []).entries()) {
    const separator = sourceText.length ? "\n\n" : "";
    if (attachment.type === "document") {
      const block = `【文本附件：${JSON.stringify(attachment.name)}】\n${attachment.text}`;
      const offset = sourceText.length + separator.length;
      for (const unit of splitRequirementInput(block)) sourceUnits.push({ ...unit, id: `u${sourceUnits.length + 1}`,
        startOffset: unit.startOffset + offset, endOffset: unit.endOffset + offset });
      sourceText += separator + block;
    } else {
      // Position distinguishes repeated names/IDs. The marker cites the actual retained image, never invented OCR text.
      const sourceLabel = `【图片附件 ${index + 1}：${JSON.stringify(attachment.name)}】`;
      const startOffset = sourceText.length + separator.length;
      const unitId = `u${sourceUnits.length + 1}`;
      sourceUnits.push({ id: unitId, text: sourceLabel, startOffset, endOffset: startOffset + sourceLabel.length, imageAttachmentIndex: index });
      images.push({ unitId, sourceLabel, url: `data:${attachment.contentType};base64,${attachment.data}` });
      sourceText += separator + sourceLabel;
    }
  }
  if (sourceText.length > 60000) throw new Error("附件来源标题与需求文本合计不能超过 60,000 字符");
  return { sourceText, sourceUnits, images };
}
