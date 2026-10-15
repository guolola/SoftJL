// Defines stack-neutral external-agent inputs, source versions, and connection management contracts.
import { z } from "zod";

const id = z.string().min(1).max(512);
export const mcpScopeSchema = z
  .object({
    requirementIds: z.array(id).max(200).default([]),
    artifactIds: z.array(id).max(200).default([]),
  })
  .strict();
export type McpScope = z.infer<typeof mcpScopeSchema>;
export const mcpSourceVersionSchema = z.object({
  artifactId: id,
  contentHash: z.string().min(1),
  inputFingerprint: z.string().nullable(),
  freshness: z.enum(["current", "stale", "unknown"]),
});
export type McpSourceVersion = z.infer<typeof mcpSourceVersionSchema>;
export const mcpManifestSchema = z.array(mcpSourceVersionSchema).max(10000);
export const mcpListProjectsInputSchema = z
  .object({
    search: z.string().max(200).default(""),
    cursor: z.string().max(4096).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const mcpContextInputSchema = z
  .object({
    projectId: id,
    scope: mcpScopeSchema.default({}),
    expectedContextVersion: z.string().max(128).optional(),
    cursor: z.string().max(4096).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const mcpArtifactInputSchema = z
  .object({
    projectId: id,
    scope: mcpScopeSchema,
    expectedContextVersion: z.string().min(1).max(128),
    artifactId: id,
    expectedVersion: z.string().min(1).max(128),
    offset: z.number().int().min(0).default(0),
    length: z.number().int().min(256).max(24000).default(12000),
  })
  .strict();
export const mcpUpdatesInputSchema = z
  .object({
    projectId: id,
    scope: mcpScopeSchema,
    manifest: mcpManifestSchema,
    cursor: z.string().max(4096).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const mcpToolResultSchema = z.object({
  status: z.enum(["ok", "refresh_required", "selection_required", "error"]),
  summary: z.string(),
  data: z.record(z.unknown()),
});
export type McpToolResult = z.infer<typeof mcpToolResultSchema>;
// An empty selection never implies account-wide permission.
const projectAccessShape = {
  projectScope: z.enum(["selected", "account"]).default("selected"),
  projectIds: z.array(id).max(100).default([]),
};
function validateProjectAccess(value: { projectScope: "selected" | "account"; projectIds: string[] }, ctx: z.RefinementCtx) {
  if (value.projectScope === "selected" && !value.projectIds.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["projectIds"], message: "Select at least one project" });
  if (value.projectScope === "account" && value.projectIds.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["projectIds"], message: "Account scope must not contain a project selection" });
}
export const mcpProjectAccessSchema = z.object(projectAccessShape).strict().superRefine(validateProjectAccess);
export type McpProjectAccess = z.infer<typeof mcpProjectAccessSchema>;
export const mcpTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  ...projectAccessShape,
  expiresInDays: z.number().int().min(1).max(90).default(30),
}).strict().superRefine(validateProjectAccess);
export const mcpConsentSchema = z.object({
  csrf: z.string().min(1).max(256),
  ...projectAccessShape,
}).strict().superRefine(validateProjectAccess);
export const mcpAssociationSchema = z
  .object({
    version: z.literal(1),
    serverUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password && !url.search && !url.hash;
      }, "Server URL must not contain credentials or query parameters"),
    projectId: id,
    scope: mcpScopeSchema,
    appliedManifest: mcpManifestSchema,
  })
  .strict();
export type McpAssociation = z.infer<typeof mcpAssociationSchema>;
