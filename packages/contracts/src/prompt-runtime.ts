// Defines the admin contract for independently versioned quick and engineering modeling resources.
import { z } from "zod";

export const promptRuntimeModeSchema = z.enum(["standard", "professional"]);
export type PromptRuntimeMode = z.infer<typeof promptRuntimeModeSchema>;
export const promptRuntimeKindSchema = z.enum(["prompt", "skill", "reference", "rules", "locked"]);
export const promptRuntimeVersionSchema = z.object({
  id: z.string(), promptId: z.string(), content: z.string(),
  status: z.enum(["draft", "pending", "published", "superseded"]),
  revision: z.number().int().positive(), author: z.string(), approver: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});
export const promptRuntimeItemSchema = z.object({
  id: z.string(), name: z.string(), path: z.array(z.string()).min(1),
  mode: promptRuntimeModeSchema, kind: promptRuntimeKindSchema,
  editable: z.boolean(), source: z.string(), description: z.string(),
  maxContentLength: z.number().int().positive(),
  activeVersionId: z.string().nullable(), activeStatus: z.enum(["published", "default", "read-only"]),
});
export const promptRuntimeListResponseSchema = z.object({
  generatedAt: z.string(), promptRuntimeItems: z.array(promptRuntimeItemSchema),
});
export const promptRuntimeDetailSchema = promptRuntimeItemSchema.extend({
  instruction: z.string(), defaultInstruction: z.string(), activeInstruction: z.string(), match: z.string(),
  versions: z.array(promptRuntimeVersionSchema), variables: z.array(z.string()),
  readOnlyConstraints: z.array(z.string()), preview: z.string(),
});
export type PromptRuntimeItem = z.infer<typeof promptRuntimeItemSchema>;
export type PromptRuntimeDetail = z.infer<typeof promptRuntimeDetailSchema>;
