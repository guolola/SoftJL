// Validates modeling sources against provider capabilities before charging or queuing a run.
import type { ModelingAttachment, ModelCapacity } from "@uml-platform/contracts";

export function validModelingImage(mime: string, data: string) {
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > 1_000_000) return false;
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return mime === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export function modelingInputError(input: { text: string; attachments?: ModelingAttachment[]; reasoning?: boolean }, capacity?: ModelCapacity) {
  if (input.reasoning && capacity?.capabilities?.reasoning !== true) return "当前模型未确认支持推理，请关闭推理或切换模型";
  if (input.attachments?.some(item => item.type === "image") && capacity?.capabilities?.vision !== true) return "当前模型未确认支持图片，请移除图片或切换视觉模型";
  if (input.attachments?.some(item => item.type === "image" && Buffer.from(item.data, "base64").length > 1_000_000)) return "这张图片超过 1 MB，请压缩后重试";
  if (input.attachments?.some(item => item.type === "image" && !validModelingImage(item.contentType, item.data))) return "图片格式与内容不匹配";
  if (input.text.length + (input.attachments ?? []).reduce((sum, item) => sum + (item.type === "document" ? item.text.length : 0), 0) > 60000) return "消息和文本附件合计不能超过 60,000 字符";
  return null;
}
