// Defines language-neutral API failures shared by HTTP clients and server routes.
import { z } from "zod";

export const apiErrorCategorySchema = z.enum([
  "validation",
  "authentication",
  "authorization",
  "not_found",
  "conflict",
  "rate_limit",
  "provider",
  "billing",
  "internal",
]);
export type ApiErrorCategory = z.infer<typeof apiErrorCategorySchema>;

export const apiErrorParameterSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const apiErrorSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/u),
  category: apiErrorCategorySchema,
  retryable: z.boolean(),
  params: z.record(z.string().min(1), apiErrorParameterSchema).optional(),
  details: z.record(z.string().min(1), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
  requestId: z.string().min(1).optional(),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
