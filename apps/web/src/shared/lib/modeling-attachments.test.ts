// Verifies model changes can recover image attachments without bypassing file limits.
import { describe, expect, it } from "vitest";
import { createConversationAttachments, toProjectAttachment } from "./modeling-attachments";

describe("modeling attachments", () => {
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
    await expect(createConversationAttachments(true).send(pending)).rejects.toThrow();
  });
});
