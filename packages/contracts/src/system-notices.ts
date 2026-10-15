// Defines system notice content, list, create, update, and read request schemas shared by admin routes and clients.
import { z } from "zod";

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();

export const systemNoticeTypeSchema = z.enum([
  "model_update",
  "feature_update",
  "important",
  "maintenance",
]);
export type SystemNoticeType = z.infer<typeof systemNoticeTypeSchema>;

export const systemNoticeStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);
export type SystemNoticeStatus = z.infer<typeof systemNoticeStatusSchema>;

export const systemNoticeContentBlockSchema = z
  .object({
    kind: z.enum(["paragraph", "list_item"]),
    text: z.string().trim().min(1).max(2000),
  })
  .strict();
export type SystemNoticeContentBlock = z.infer<
  typeof systemNoticeContentBlockSchema
>;

export const systemNoticeDtoSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(240),
    type: systemNoticeTypeSchema,
    icon: z.string().trim().min(1).max(8).nullable(),
    contentBlocks: z.array(systemNoticeContentBlockSchema).default([]),
    status: systemNoticeStatusSchema,
    publishedAt: optionalNullableTimestampSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    unread: z.boolean().optional(),
  })
  .strict();
export type SystemNoticeDto = z.infer<typeof systemNoticeDtoSchema>;

export const systemNoticeListResponseSchema = z
  .object({
    generatedAt: z.string().min(1),
    notices: z.array(systemNoticeDtoSchema),
    unreadCount: z.number().int().min(0).default(0),
  })
  .strict();
export type SystemNoticeListResponse = z.infer<
  typeof systemNoticeListResponseSchema
>;

export const systemNoticeCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    type: systemNoticeTypeSchema,
    icon: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? null : value,
        z.string().trim().min(1).max(8).nullable().optional(),
      )
      .default(null),
    contentBlocks: z.array(systemNoticeContentBlockSchema).default([]),
    status: systemNoticeStatusSchema.default("draft"),
    publishedAt: optionalNullableTimestampSchema.default(null),
  })
  .strict();
export type SystemNoticeCreateRequest = z.infer<
  typeof systemNoticeCreateRequestSchema
>;

export const systemNoticeUpdateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    type: systemNoticeTypeSchema.optional(),
    icon: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim() === "" ? null : value,
        z.string().trim().min(1).max(8).nullable().optional(),
      )
      .optional(),
    contentBlocks: z.array(systemNoticeContentBlockSchema).optional(),
    status: systemNoticeStatusSchema.optional(),
    publishedAt: optionalNullableTimestampSchema.optional(),
  })
  .strict();
export type SystemNoticeUpdateRequest = z.infer<
  typeof systemNoticeUpdateRequestSchema
>;

export const systemNoticeReadRequestSchema = z
  .object({
    noticeIds: z.array(z.string().min(1)).optional(),
  })
  .strict()
  .default({});
export type SystemNoticeReadRequest = z.infer<
  typeof systemNoticeReadRequestSchema
>;
