// Defines capacity metadata shared by the catalog, admin console and project context display.
import { z } from "zod";

export const modelCapacityInputSchema = z.object({
  context: z.number().int().min(1024).max(100_000_000),
  output: z.number().int().positive().max(10_000_000),
}).refine(value => value.output <= value.context, "输出容量不能超过上下文容量");
export const modelCapacitySchema = z.object({
  context: z.number().int().positive().nullable(), output: z.number().int().positive().nullable(),
  // Historical usage remains readable after retiring the previous catalog source.
  source: z.preprocess(value => value === "models.dev" ? "unknown" : value, z.enum(["modelpedia", "admin", "unknown"])),
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
export type ModelContextSettings = z.infer<typeof modelContextSettingsSchema>;
export const providerCapacityResponseSchema = z.object({
  syncedAt: z.string().nullable(), stale: z.boolean(), error: z.string().nullable(),
  models: z.array(modelCapacitySchema.extend({ modelId: z.string() })),
});
