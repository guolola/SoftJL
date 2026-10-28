// Shared contracts for the ordinary graduation-project workflow, independent of professional baselines.
import { z } from "zod";
import { modelingAttachmentSchema } from "../modeling/modeling-attachments.js";
import { modelTokenUsageSchema } from "../modeling/model-catalog.js";
import { documentStyleSettingsSchema, type DocumentStyleSettings } from "../documents.js";

import { functionStructureDiagramSpecSchema, useCaseDiagramSpecSchema, activityDiagramSpecSchema, architectureDiagramSpecSchema,
  classDiagramSpecSchema, sequenceDiagramSpecSchema, tableDiagramSpecSchema } from "../modeling/models.js";
import { assertValidModel, deriveTableModel, getModelGraphElements } from "../modeling/model-semantics.js";
import { unknownContractFields } from "../modeling/model-json-schema.js";

const text = z.string().trim().min(1).max(4000);
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).max(100);
export const standardDiagramKinds = ["function", "usecase", "activity", "architecture", "er", "class", "sequence", "table"] as const;
export const standardDiagramKindSchema = z.enum(standardDiagramKinds);
export type StandardDiagramKind = z.infer<typeof standardDiagramKindSchema>;
export const standardDiagramLabels: Record<StandardDiagramKind, string> = {
  function: "功能结构图", usecase: "用例图", activity: "业务流程图", architecture: "总体架构图",
  er: "概念 E-R 图", class: "设计类图", sequence: "时序图", table: "数据库表关系图",
};

// Display copy never determines model consent; choices carry explicit, server-validated kinds.
export const standardScopeChoiceSchema = z.object({
  id, label: text, kinds: z.array(standardDiagramKindSchema).max(8), recommended: z.boolean(),
}).strict();
export const standardQuestionSchema = z.object({
  id, title: text, multiple: z.boolean().default(false),
  options: z.array(text).min(2).max(8), recommendation: text,
  scopeChoices: z.array(standardScopeChoiceSchema).min(2).max(8).optional(),
});
export const standardAnswerSchema = z.object({
  questionId: id, answer: text, selectedOptionIds: z.array(id).min(1).max(8).optional(),
});
export const standardOutlineSchema = z.object({
  title: text, summary: text,
  roles: z.array(z.object({ id, name: text, description: text })).min(1),
  businesses: z.array(z.object({
    id, name: text, roleIds: z.array(id).min(1), description: text,
    steps: z.array(text).min(1), exceptions: z.array(text),
  })).min(1),
  entities: z.array(z.object({ id, name: text, attributes: z.array(text).min(1) })).min(1),
  relationships: z.array(text), modules: z.array(text).min(1), assumptions: z.array(text),
});
export type StandardOutline = z.infer<typeof standardOutlineSchema>;
// The discriminator is the current format boundary; obsolete generic nodes/edges models are rejected.
export const standardErModelSchema = z.object({
  diagramKind: z.literal("er"), title: text, summary: text, notes: z.array(text),
  entities: z.array(z.object({ id, name: text, attributes: z.array(z.object({ id, name: text, isKey: z.boolean().default(false) })) })).min(1),
  relationships: z.array(z.object({ id, name: text, sourceId: id, targetId: id,
    sourceMultiplicity: text, targetMultiplicity: text })),
});
// One variant registry drives both tool payloads and per-kind generation schemas.
const standardModelStructureSchema = z.discriminatedUnion("diagramKind", [
  functionStructureDiagramSpecSchema, useCaseDiagramSpecSchema, activityDiagramSpecSchema,
  architectureDiagramSpecSchema, standardErModelSchema, classDiagramSpecSchema, sequenceDiagramSpecSchema, tableDiagramSpecSchema,
]);
export type StandardModel = z.infer<typeof standardModelStructureSchema>;
function currentModelSchema(schema: z.ZodType<StandardModel, unknown>) {
  return z.preprocess((value, ctx) => {
    for (const path of unknownContractFields(schema, value)) ctx.addIssue({ code: "custom", path: path.split("."), message: "不支持的模型字段，不能静默丢弃" });
    return value;
  }, schema).transform((model, ctx) => {
    try { return normalizeStandardModel(model); }
    catch (cause) {
      ctx.addIssue({ code: "custom", message: cause instanceof Error ? cause.message : "模型结构不合法" });
      return z.NEVER;
    }
  });
}
export const standardModelSchema = currentModelSchema(standardModelStructureSchema);
export function standardModelSchemaForKind(kind: StandardDiagramKind) {
  const schema = standardModelStructureSchema.options.find(schema => schema.shape.diagramKind.value === kind);
  if (!schema) throw new Error("不支持的模型类型");
  return currentModelSchema(schema);
}
export function standardModelStage(kind: Exclude<StandardDiagramKind, "er">) {
  return kind === "function" || kind === "usecase" || kind === "activity" ? "requirements" as const : "design" as const;
}
const standardGenerationScopeSchema = z.object({
  status: z.enum(["awaiting_selection", "confirmed"]), kinds: z.array(standardDiagramKindSchema).max(8),
});
const standardUnsupportedDiagramRequestSchema = z.object({
  models: z.array(text).min(1).max(8), messageId: z.string().min(1), questionId: id.optional(),
});
export type StandardQuestion = z.infer<typeof standardQuestionSchema>;
export type StandardAnswer = z.infer<typeof standardAnswerSchema>;
export type StandardDiagram = z.infer<typeof standardDiagramSchema>;
export const standardTestsSchema = z.array(z.object({
  id, businessId: id, title: text, preconditions: z.array(text), steps: z.array(text).min(1), expected: text,
  scenarioType: z.enum(["normal", "alternative", "exception", "boundary", "decision-table"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
})).min(1);
export const standardAttachmentSchema = modelingAttachmentSchema;
export type StandardAttachment = z.infer<typeof standardAttachmentSchema>;
export const standardQuoteSchema = z.object({ text: z.string().min(1).max(12000), messageId: z.string().optional() });
export const standardConversationMessageSchema = z.object({
  id: z.string(), role: z.enum(["user", "assistant"]), text: z.string(), createdAt: z.string(),
  answers: z.array(standardAnswerSchema).max(3).optional(),
  status: z.enum(["streaming", "completed", "failed"]).default("completed"),
  attachments: z.array(standardAttachmentSchema).max(4).optional(), quote: standardQuoteSchema.optional(),
  reasoning: z.string().optional(),
  timing: z.object({
    streamStartTime: z.number().nonnegative(), firstTokenTime: z.number().nonnegative().optional(),
    totalStreamTime: z.number().nonnegative(), tokenCount: z.number().nonnegative().optional(),
    tokensPerSecond: z.number().nonnegative().optional(), totalChunks: z.number().int().nonnegative(), toolCallCount: z.number().int().nonnegative(),
  }).optional(),
  suggestions: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
  feedback: z.enum(["positive", "negative"]).optional(),
  tools: z.array(z.object({ id: z.string(), name: z.string(), status: z.enum(["running", "completed", "failed"]) })).optional(),
}).strict();
export type StandardConversationMessage = z.infer<typeof standardConversationMessageSchema>;
export const standardTokenUsageSchema = modelTokenUsageSchema;
export type StandardTokenUsage = z.infer<typeof standardTokenUsageSchema>;
export const standardOperationSchema = z.enum(["chat", "edit", "regenerate", "generate", "retry", "resume", "tests", "requirementsSpec", "softwareDesignSpec"]);
export type StandardOperation = z.infer<typeof standardOperationSchema>;
const standardRunSchema = z.object({
  id: z.string(), operation: standardOperationSchema, status: z.enum(["running", "completed", "failed", "stopped"]),
  interruptionReason: z.literal("server_restart").optional(),
  startedAt: z.string(), finishedAt: z.string().optional(), error: z.string().optional(),
  requestId: z.string().optional(), continuedFrom: z.string().optional(),
  documentStyle: documentStyleSettingsSchema.optional(),
  resumeOperation: z.enum(["chat", "tests", "requirementsSpec", "softwareDesignSpec"]).optional(),
  work: z.object({ ids: z.array(z.string()), instruction: z.string().optional() }).optional(),
});
export type StandardProjectState = {
  generationScope?: z.infer<typeof standardGenerationScopeSchema>;
  /** Unsupported requests cannot reuse earlier consent; alternatives require their own Ask answer. */
  unsupportedDiagramRequest?: z.infer<typeof standardUnsupportedDiagramRequestSchema>;
  tokenUsage?: StandardTokenUsage;
  /** Idempotency receipts contain identifiers only, never provider credentials. */
  acceptedCommands?: string[];
  conversation?: StandardConversationMessage[];
  memory?: string[];
  contextStatus?: "ready" | "compacting";
  compactionCount?: number;
  /** Server-owned Pi entries. Excluded from public, admin and MCP projections. */
  piSession?: { entries: unknown[]; leafId: string | null };

  description: string;
    rounds: Array<{ questions: StandardQuestion[]; answers: StandardAnswer[]; purpose?: "generation_scope" | "business" }>;
  outline?: StandardOutline;
  diagrams: Record<string, StandardDiagram>;
  tests?: z.infer<typeof standardTestsSchema>;
  documents?: Partial<Record<"requirementsSpec" | "softwareDesignSpec", { title: string; markdown: string; generatedAt: string; documentId?: string; documentStyle?: DocumentStyleSettings; diagrams?: StandardDiagram[] }>>;
  run?: z.infer<typeof standardRunSchema>;
};

export const standardDiagramSchema = z.object({
  id: text, kind: standardDiagramKindSchema, title: text, businessId: id.optional(),
  status: z.enum(["pending", "running", "completed", "failed"]), model: standardModelSchema.optional(),
  phase: z.enum(["generating", "checking", "repairing", "rendering"]).optional(),
  source: z.string().optional(), svg: z.string().optional(), error: z.string().optional(),
}).strict().refine((diagram) => diagram.kind !== "usecase" || diagram.id === "usecase", {
  message: "The use-case overview must use the current usecase identity.", path: ["id"],
}).refine((diagram) => !diagram.model || diagram.model.diagramKind === diagram.kind, {
  message: "模型类型与目标图不匹配", path: ["model", "diagramKind"],
});
export const standardProjectStateSchema = z.object({
  generationScope: standardGenerationScopeSchema.optional(),
  unsupportedDiagramRequest: standardUnsupportedDiagramRequestSchema.optional(),
  tokenUsage: standardTokenUsageSchema.optional(),
  conversation: z.array(standardConversationMessageSchema).optional(), memory: z.array(text).optional(),
  contextStatus: z.enum(["ready", "compacting"]).optional(), compactionCount: z.number().int().nonnegative().optional(),
  description: z.string(), rounds: z.array(z.object({ questions: z.array(standardQuestionSchema), answers: z.array(standardAnswerSchema), purpose: z.enum(["generation_scope", "business"]).optional() })),
  outline: standardOutlineSchema.optional(), diagrams: z.record(z.string(), standardDiagramSchema), tests: standardTestsSchema.optional(),
  documents: z.object({
    requirementsSpec: z.object({ title: text, markdown: z.string(), generatedAt: z.string(), documentId: z.string().optional(), documentStyle: documentStyleSettingsSchema.optional(), diagrams: z.array(standardDiagramSchema).optional() }).optional(),
    softwareDesignSpec: z.object({ title: text, markdown: z.string(), generatedAt: z.string(), documentId: z.string().optional(), documentStyle: documentStyleSettingsSchema.optional(), diagrams: z.array(standardDiagramSchema).optional() }).optional(),
  }).optional(),
  run: standardRunSchema.optional(),
});

// Workspace persistence validates the same model tree while retaining server-owned execution context.
export const storedStandardProjectStateSchema = standardProjectStateSchema.extend({
  acceptedCommands: z.array(z.string()).optional(),
  piSession: z.object({ entries: z.array(z.unknown()), leafId: z.string().nullable() }).strict().optional(),
}).strict();

export function createStandardProjectState(description = ""): StandardProjectState {
  return { description, rounds: [], diagrams: {} };
}

// All model boundaries share structural semantics; no review, freshness or lineage gates.
export function validateStandardModel(kind: StandardDiagramKind, input: unknown): StandardModel {
  const model = standardModelSchema.parse(input);
  if (model.diagramKind !== kind) throw new Error("模型类型与目标图不匹配");
  return model;
}

function normalizeStandardModel(model: StandardModel): StandardModel {
  if (model.diagramKind !== "er") {
    // Reuse pure model semantics, without pipeline reviews, baselines or traceability gates.
    if (!getModelGraphElements(model).length) throw new Error("模型至少需要一个元素");
    if (model.diagramKind === "usecase" && (!model.actors.length || !model.useCases.length)) throw new Error("用例图缺少参与者或用例");
    assertValidModel(model, standardModelStage(model.diagramKind), "standard");
    return model.diagramKind === "table" ? deriveTableModel(model) : model;
  }
  const ids = new Set(model.entities.map(item => item.id));
  if (ids.size !== model.entities.length || new Set(model.relationships.map(item => item.id)).size !== model.relationships.length) throw new Error("实体或关系 ID 重复");
  for (const entity of model.entities) if (new Set(entity.attributes.map(item => item.id)).size !== entity.attributes.length) throw new Error("属性 ID 重复");
  for (const edge of model.relationships) {
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) throw new Error("关系引用了不存在的实体");
    for (const value of [edge.sourceMultiplicity, edge.targetMultiplicity]) {
      const range = /^(\d+)\.\.(\d+|\*)$/.exec(value);
      if (!/^(\d+|\*)$/.test(value) && !(range && (range[2] === "*" || BigInt(range[1]) <= BigInt(range[2])))) throw new Error("实体关系基数无效");
    }
  }
  return model;
}

export function standardDiagramTasks(outline: StandardOutline): StandardDiagram[] {
  const overview = (["function", "usecase", "architecture", "er", "class", "table"] as const).map(kind => ({
    id: kind, kind, title: standardDiagramLabels[kind], status: "pending" as const,
  }));
  return [...overview, ...outline.businesses.flatMap(business => (["activity", "sequence"] as const).map(kind => ({
    id: `${kind}_${business.id}`, kind, businessId: business.id,
    title: `${business.name} · ${standardDiagramLabels[kind]}`, status: "pending" as const,
  })))];
}
