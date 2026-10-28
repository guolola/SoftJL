// Verifies model changes can recover image attachments without bypassing file limits.
import { beforeEach, describe, expect, it } from "vitest";
import { createConversationAttachments, modelingSubmissionError, toAssistantAttachment, toProjectAttachment } from "./modeling-attachments";
import { i18n } from "../i18n/index";

describe("modeling attachments", () => {
  beforeEach(async () => { await i18n.changeLanguage("zh-CN"); });
  it("retries an image rejected before vision metadata was available", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "requirements.png", { type: "image/png" });
    const textOnly = createConversationAttachments(false);
    const pending = await textOnly.add({ file });
    if (!("status" in pending)) throw new Error("Expected the bounded adapter to resolve one attachment");
    expect(pending.status.type).toBe("incomplete");
    await expect(textOnly.send(pending)).rejects.toThrow();
    const result = await createConversationAttachments(true).send(pending);
    expect(toProjectAttachment(result)).toMatchObject({ type: "image", name: "requirements.png", contentType: "image/png" });
  });

  it("does not let a model switch bypass the image size limit", async () => {
    const pending = await createConversationAttachments(false).add({ file: new File([new Uint8Array(1_000_001)], "large.png", { type: "image/png" }) });
    if (!("status" in pending)) throw new Error("Expected the bounded adapter to resolve one attachment");
    await expect(createConversationAttachments(true).send(pending)).rejects.toThrow("这张图片超过 1 MB，请压缩后重试。");
  });

  it.each([
    ["large.png", "image/png", 1_000_001, "这张图片超过 1 MB，请压缩后重试。"],
    ["large.md", "text/markdown", 240_001, "这个文本文件超过 240 KB，请缩小后重试。"],
    ["empty.txt", "text/plain", 0, "这个文件没有可读取的文本。"],
  ])("reports only the failed rule for %s", async (name, type, size, message) => {
    const pending = await createConversationAttachments(true).add({ file: new File([new Uint8Array(size)], name, { type }) });
    expect(pending).toMatchObject({ status: { type: "incomplete", message } });
  });

  it("distinguishes count, combined text length and empty text failures", () => {
    const doc = { id: "doc", name: "source.txt", type: "document" as const, contentType: "text/plain" as const, text: "x" };
    expect(modelingSubmissionError("", Array(5).fill(doc))).toBe("附件超过 4 个，请移除多余附件。");
    expect(modelingSubmissionError("x".repeat(59999), [doc])).toBeUndefined();
    expect(modelingSubmissionError("x".repeat(59999), [doc], "q")).toBe("消息、引用与文本附件合计超过 60,000 字符，请缩短内容。");
    expect(() => toProjectAttachment(toAssistantAttachment({ ...doc, text: " " }))).toThrow("这个文件没有可读取的文本。");
    expect(() => toProjectAttachment(toAssistantAttachment({ ...doc, text: "x".repeat(60001) }))).toThrow("消息、引用与文本附件合计超过 60,000 字符，请缩短内容。");
  });
});
