// Defines capacity metadata shared by the catalog, admin console and project context display.
import { z } from "zod";

export const modelCapacityOverrideSchema = z.object({
  context: z.number().int().min(1024).max(100_000_000).optional(),
  output: z.number().int().positive().max(10_000_000).optional(),
  capabilities: z.object({ reasoning: z.boolean().optional(), vision: z.boolean().optional() }).strict().optional(),
}).strict();
export const modelCapacityInputSchema = z.object({
  context: modelCapacityOverrideSchema.shape.context.unwrap().nullable().optional(),
  output: modelCapacityOverrideSchema.shape.output.unwrap().nullable().optional(),
  capabilities: z.object({ reasoning: z.boolean().nullable().optional(), vision: z.boolean().nullable().optional() }).strict().optional(),
}).strict().refine(value => value.context !== undefined || value.output !== undefined
  || value.capabilities?.reasoning !== undefined || value.capabilities?.vision !== undefined, "请至少更新一项模型资料")
  .refine(value => !value.context || !value.output || value.output <= value.context, "输出容量不能超过上下文容量");
export type ModelCapacityInput = z.infer<typeof modelCapacityInputSchema>;
export const providerModelCapacityUpdateSchema = z.object({ modelId: z.string().trim().min(1).max(400), capacity: modelCapacityInputSchema }).strict();
export type ModelCapacityOverride = z.infer<typeof modelCapacityOverrideSchema>;
export const modelCapacitySchema = z.object({
  context: z.number().int().positive().nullable(), output: z.number().int().positive().nullable(),
  source: z.enum(["models.dev", "admin", "user", "unknown"]),
  matchedId: z.string().nullable(), updatedAt: z.string().nullable(),
  name: z.string().optional(), status: z.enum(["active", "deprecated", "preview"]).optional(),
  capabilities: z.object({
    vision: z.boolean().nullable(), reasoning: z.boolean().nullable(), toolCall: z.boolean().nullable(),
  }).optional(),
});
export type ModelCapacity = z.infer<typeof modelCapacitySchema>;
const tokenCount = z.number().finite().nonnegative();
// Shared usage shape preserves provider-reported counts and explicitly represents unavailable call usage.
export const modelTokenUsageSchema = z.object({
  capacity: modelCapacitySchema.optional(),
  model: z.string(), contextBudget: tokenCount.positive(), contextTokens: tokenCount.nullable(),
  lastCall: z.object({ input: tokenCount, output: tokenCount, cacheRead: tokenCount.nullable(), cacheWrite: tokenCount.nullable(), total: tokenCount }).nullable(),
  cumulative: z.object({ total: tokenCount, calls: tokenCount, unreportedCalls: tokenCount }),
});
export type ModelTokenUsage = z.infer<typeof modelTokenUsageSchema>;
export const modelContextSettingsSchema = z.object({ model: z.string(), capacity: modelCapacitySchema, contextBudget: z.number().int().positive() });
export const providerModelContextsSchema = z.object({ models: z.array(modelContextSettingsSchema) });
export type ModelContextSettings = z.infer<typeof modelContextSettingsSchema>;
export const providerCapacityResponseSchema = z.object({
  syncedAt: z.string().nullable(), stale: z.boolean(), error: z.string().nullable(),
  models: z.array(modelCapacitySchema.extend({ modelId: z.string(), reference: modelCapacitySchema, overrides: modelCapacityOverrideSchema })),
});
export type ProviderCapacities = z.infer<typeof providerCapacityResponseSchema>;
