// Shares bounded modeling input attachments without coupling project modes to run contracts.
import { z } from "zod";

export const modelingAttachmentSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(100), name: z.string().min(1).max(255), type: z.literal("image"), contentType: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(1400000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }),
  z.object({ id: z.string().max(100), name: z.string().min(1).max(255), type: z.literal("document"), contentType: z.enum(["text/plain", "text/markdown"]), text: z.string().min(1).max(60000) }),
]);
export type ModelingAttachment = z.infer<typeof modelingAttachmentSchema>;
