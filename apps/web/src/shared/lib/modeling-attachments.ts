// Shares bounded text/image attachment conversion across both modeling workflows.
import { SimpleImageAttachmentAdapter, SimpleTextAttachmentAdapter, type AttachmentAdapter, type CompleteAttachment } from "@assistant-ui/react";
import { standardAttachmentSchema, type StandardAttachment } from "@uml-platform/contracts";
import { i18n } from "../i18n";

const image = new SimpleImageAttachmentAdapter();
const text = new SimpleTextAttachmentAdapter();
const isImage = (file: File) => ["image/png", "image/jpeg", "image/webp"].includes(file.type);
const isText = (file: File) => ["text/plain", "text/markdown"].includes(file.type) || /\.(txt|md|markdown)$/i.test(file.name);
export function createConversationAttachments(vision: boolean): AttachmentAdapter {
  return {
    accept: ".txt,.md,.markdown,text/plain,text/markdown,image/png,image/jpeg,image/webp",
    async add({ file }) {
      const error = !isText(file) && !isImage(file) ? i18n.t("standardProject.chat.attachmentTypes")
        : isImage(file) && !vision ? i18n.t("standardProject.chat.visionRequired")
        : file.size > (isImage(file) ? 1_000_000 : 240_000) ? i18n.t("standardProject.chat.attachmentSize") : "";
      if (error) return { id: crypto.randomUUID(), type: isImage(file) ? "image" : "document", name: file.name, file, contentType: file.type,
        status: { type: "incomplete", reason: "error", message: error } };
      return (isImage(file) ? image : text).add({ file });
    },
    remove: async () => {},
    async send(attachment, options) {
      const picture = isImage(attachment.file);
      if (picture && !vision) throw new Error(i18n.t("standardProject.chat.visionRequired"));
      if (picture && attachment.file.size > 1_000_000) throw new Error(i18n.t("standardProject.chat.attachmentSize"));
      // An image rejected while metadata was loading may be retried after selecting a visual model.
      // Revalidate its size here as capability errors take precedence during the initial add.
      const retryVision = attachment.status.type === "incomplete" && picture && vision
        && attachment.file.size <= 1_000_000;
      if (attachment.status.type === "incomplete" && !retryVision) throw new Error(attachment.status.message);
      const ready = retryVision ? await image.add({ file: attachment.file }) : attachment;
      const complete = await (picture ? image : text).send(ready, options);
      // Validate text length before the runtime clears the composer, preserving failed attachments.
      toProjectAttachment(complete);
      return complete;
    },
  };
}
export function toProjectAttachment(attachment: CompleteAttachment): StandardAttachment {
  const content = attachment.content;
  const picture = content.find(part => part.type === "image");
  if (picture?.type === "image") {
    const url = String(picture.image); const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    return standardAttachmentSchema.parse({ id: attachment.id, name: attachment.name, type: "image", contentType: match?.[1], data: match?.[2] });
  }
  const value = content.filter(part => part.type === "text").map(part => part.text).join("\n");
  const body = value.replace(/^<attachment[^>]*>\n/, "").replace(/\n<\/attachment>$/, "");
  return standardAttachmentSchema.parse({ id: attachment.id, name: attachment.name, type: "document", contentType: /\.(md|markdown)$/i.test(attachment.name) ? "text/markdown" : "text/plain", text: body });
}
export function toAssistantAttachment(attachment: StandardAttachment): CompleteAttachment {
  return { id: attachment.id, name: attachment.name, type: attachment.type, contentType: attachment.contentType, status: { type: "complete" },
    content: attachment.type === "image" ? [{ type: "image", image: `data:${attachment.contentType};base64,${attachment.data}` }] : [{ type: "text", text: attachment.text }] };
}
