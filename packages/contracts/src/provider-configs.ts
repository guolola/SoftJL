// Defines provider setting references, provider config DTOs, risk states, and config test response schemas.
import { z } from "zod";

export const providerModelCategorySchema = z.enum(["text_chat", "vision_chat"]);
export type ProviderModelCategory = z.infer<typeof providerModelCategorySchema>;

export const providerModelStrictJsonSchema = z.union([
  z.boolean(),
  z.literal("unknown"),
]);
export type ProviderModelStrictJson = z.infer<
  typeof providerModelStrictJsonSchema
>;

export const providerStructuredOutputModeSchema = z.enum([
  "strict_json",
  "json_object",
  "compatible",
]);
export type ProviderStructuredOutputMode = z.infer<
  typeof providerStructuredOutputModeSchema
>;

export const providerModelProbeStatusSchema = z.enum([
  "strict",
  "json_object",
  "compatible",
  "failed",
  "unknown",
]);
export type ProviderModelProbeStatus = z.infer<
  typeof providerModelProbeStatusSchema
>;

export const providerModelCapabilitySchema = z
  .object({
    id: z.string().trim().min(1),
    category: providerModelCategorySchema,
    structuredOutputMode: providerStructuredOutputModeSchema,
    supportsJsonSchema: z.boolean(),
    supportsJsonObject: z.boolean(),
    strictJson: providerModelStrictJsonSchema,
    modeLabel: z.string().trim().min(1),
    warning: z.string().trim().min(1).optional(),
    probeStatus: providerModelProbeStatusSchema,
    probeReason: z.string().trim().min(1).nullable().optional(),
    probedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type ProviderModelCapability = z.infer<
  typeof providerModelCapabilitySchema
>;

export const providerModelCapabilityMapSchema = z.record(
  z.string().trim().min(1),
  providerModelCapabilitySchema,
);
export type ProviderModelCapabilityMap = z.infer<
  typeof providerModelCapabilityMapSchema
>;

export const resolvedProviderSettingsSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  modelCapability: providerModelCapabilitySchema.optional(),
});
export type ProviderSettings = z.infer<typeof resolvedProviderSettingsSchema>;

export const managedProviderSettingsSchema = z.object({
  providerConfigId: z.string().min(1),
  model: z.string().min(1),
});
export type ManagedProviderSettings = z.infer<
  typeof managedProviderSettingsSchema
>;

export const providerSettingsSchema = managedProviderSettingsSchema;
export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;

export const imageProviderSettingsSchema = resolvedProviderSettingsSchema.extend({
  model: z.enum([
    "gpt-image-2",
    "gemini-3.1-flash-image-preview-2k",
    "nano-banana-pro",
  ]),
});
export type ImageProviderSettings = z.infer<
  typeof imageProviderSettingsSchema
>;

const isoTimestampSchema = z.string().datetime({ offset: true });
const optionalNullableTimestampSchema = isoTimestampSchema.nullable();

export const providerConfigStatusSchema = z.enum([
  "active",
  "disabled",
  "revoked",
]);
export type ProviderConfigStatus = z.infer<typeof providerConfigStatusSchema>;

export const providerRiskStateSchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type ProviderRiskState = z.infer<typeof providerRiskStateSchema>;

export const providerBreakerStateSchema = z.enum(["closed", "open"]);
export type ProviderBreakerState = z.infer<typeof providerBreakerStateSchema>;

export const providerConfigScopeTypeSchema = z.enum([
  "system",
  "user",
  "project",
]);
export type ProviderConfigScopeType = z.infer<
  typeof providerConfigScopeTypeSchema
>;

export const providerConfigDtoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    baseUrl: z.string().url(),
    defaultModel: z.string().trim().min(1),
    allowedModels: z.array(z.string().trim().min(1)),
    modelCapabilities: providerModelCapabilityMapSchema.default({}),
    maskedKey: z.string().trim().min(1),
    status: providerConfigStatusSchema,
    riskState: providerRiskStateSchema,
    quota: z.string().trim().min(1),
    lastUsedAt: optionalNullableTimestampSchema,
    scopeType: providerConfigScopeTypeSchema,
    scopeId: z.string().min(1).nullable(),
    breakerState: providerBreakerStateSchema,
  })
  .strict();
export type ProviderConfigDto = z.infer<typeof providerConfigDtoSchema>;

export const providerConfigListResponseSchema = z
  .object({
    providerConfigs: z.array(providerConfigDtoSchema),
  })
  .strict();
export type ProviderConfigListResponse = z.infer<
  typeof providerConfigListResponseSchema
>;

export const providerDiscoveredModelSchema = z
  .object({
    id: z.string().trim().min(1),
    object: z.string().trim().min(1).optional(),
    created: z.number().int().min(0).nullable().optional(),
    ownedBy: z.string().trim().min(1).nullable().optional(),
    category: providerModelCategorySchema.optional(),
    structuredOutputMode: providerStructuredOutputModeSchema.optional(),
    supportsJsonSchema: z.boolean().optional(),
    supportsJsonObject: z.boolean().optional(),
    strictJson: providerModelStrictJsonSchema.optional(),
    modeLabel: z.string().trim().min(1).optional(),
    warning: z.string().trim().min(1).optional(),
    probeStatus: providerModelProbeStatusSchema.optional(),
    probeReason: z.string().trim().min(1).nullable().optional(),
    probedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type ProviderDiscoveredModel = z.infer<
  typeof providerDiscoveredModelSchema
>;

export const providerModelDiscoveryResponseSchema = z
  .object({
    models: z.array(providerDiscoveredModelSchema),
    fetchedAt: isoTimestampSchema,
    sourceBaseUrl: z.string().url(),
    summary: z
      .object({
        rawCount: z.number().int().min(0),
        excludedByNameCount: z.number().int().min(0),
        chatProbeFailedCount: z.number().int().min(0),
        chatProbeUnknownCount: z.number().int().min(0),
        strictCount: z.number().int().min(0),
        jsonObjectCount: z.number().int().min(0),
        compatibleCount: z.number().int().min(0),
        unknownStrictCount: z.number().int().min(0),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ProviderModelDiscoveryResponse = z.infer<
  typeof providerModelDiscoveryResponseSchema
>;

export const providerModelDiscoveryProbeStageSchema = z.enum([
  "strict_json",
  "json_object",
  "chat",
]);
export type ProviderModelDiscoveryProbeStage = z.infer<
  typeof providerModelDiscoveryProbeStageSchema
>;

export const providerModelDiscoveryProgressEventSchema = z.discriminatedUnion(
  "type",
  [
    z
      .object({
        type: z.literal("started"),
        sourceBaseUrl: z.string().url(),
      })
      .strict(),
    z
      .object({
        type: z.literal("models_listed"),
        rawCount: z.number().int().min(0),
      })
      .strict(),
    z
      .object({
        type: z.literal("name_filtered"),
        rawCount: z.number().int().min(0),
        candidateCount: z.number().int().min(0),
        excludedByNameCount: z.number().int().min(0),
      })
      .strict(),
    z
      .object({
        type: z.literal("probe_started"),
        modelId: z.string().trim().min(1),
        index: z.number().int().min(1),
        total: z.number().int().min(0),
        stage: providerModelDiscoveryProbeStageSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("probe_completed"),
        modelId: z.string().trim().min(1),
        index: z.number().int().min(1),
        total: z.number().int().min(0),
        probeStatus: providerModelProbeStatusSchema,
        structuredOutputMode: providerStructuredOutputModeSchema.optional(),
        strictJson: providerModelStrictJsonSchema.optional(),
        supportsJsonSchema: z.boolean().optional(),
        supportsJsonObject: z.boolean().optional(),
        reason: z.string().trim().min(1).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("completed"),
        result: providerModelDiscoveryResponseSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("error"),
        code: z.string().regex(/^[A-Z][A-Z0-9_]*$/u).optional(),
        message: z.string().trim().min(1),
        retryable: z.boolean().optional(),
        status: z.number().int().min(100).max(599).optional(),
      })
      .strict(),
  ],
);
export type ProviderModelDiscoveryProgressEvent = z.infer<
  typeof providerModelDiscoveryProgressEventSchema
>;

export const providerModelDiscoveryRequestSchema = z
  .object({
    baseUrl: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
  })
  .strict();
export type ProviderModelDiscoveryRequest = z.infer<
  typeof providerModelDiscoveryRequestSchema
>;

export const providerConfigTestRequestSchema = z
  .object({
    model: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProviderConfigTestRequest = z.infer<
  typeof providerConfigTestRequestSchema
>;

export const providerConfigTestResponseSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().min(1),
    capability: z.unknown().optional(),
    breaker: z
      .object({
        state: providerBreakerStateSchema,
        failureCount: z.number().int().min(0),
        openedAt: optionalNullableTimestampSchema,
        lastFailureAt: optionalNullableTimestampSchema,
      })
      .optional(),
  })
  .strict();
export type ProviderConfigTestResponse = z.infer<
  typeof providerConfigTestResponseSchema
>;

export const providerConfigSelfServiceCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1),
    provider: z.string().trim().min(1).optional(),
    baseUrl: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
    defaultModel: z.string().trim().min(1),
    allowedModels: z.array(z.string().trim().min(1)).min(1),
    modelCapabilities: providerModelCapabilityMapSchema.optional(),
    keyPurpose: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProviderConfigSelfServiceCreateRequest = z.infer<
  typeof providerConfigSelfServiceCreateRequestSchema
>;

export const providerConfigSelfServiceUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    baseUrl: z.string().trim().min(1).optional(),
    apiKey: z.string().trim().min(1).optional(),
    defaultModel: z.string().trim().min(1).optional(),
    allowedModels: z.array(z.string().trim().min(1)).min(1).optional(),
    modelCapabilities: providerModelCapabilityMapSchema.optional(),
    keyPurpose: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProviderConfigSelfServiceUpdateRequest = z.infer<
  typeof providerConfigSelfServiceUpdateRequestSchema
>;

export const providerConfigSelfServiceRotateRequestSchema = z
  .object({
    apiKey: z.string().trim().min(1),
    model: z.string().trim().min(1).optional(),
  })
  .strict();
export type ProviderConfigSelfServiceRotateRequest = z.infer<
  typeof providerConfigSelfServiceRotateRequestSchema
>;
