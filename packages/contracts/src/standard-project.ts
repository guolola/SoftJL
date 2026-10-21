// Shared contracts for the ordinary graduation-project workflow, independent of professional baselines.
import { z } from "zod";
import { modelingAttachmentSchema } from "./modeling-attachments.js";
import { modelTokenUsageSchema } from "./model-catalog.js";
import { documentStyleSettingsSchema, type DocumentStyleSettings } from "./documents.js";

const text = z.string().trim().min(1).max(4000);
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).max(100);
export const standardDiagramKinds = ["function", "usecase", "activity", "architecture", "er", "class", "sequence", "table"] as const;
export const standardDiagramKindSchema = z.enum(standardDiagramKinds);
export type StandardDiagramKind = z.infer<typeof standardDiagramKindSchema>;
export const standardDiagramLabels: Record<StandardDiagramKind, string> = {
  function: "功能结构图", usecase: "用例图", activity: "业务流程图", architecture: "总体架构图",
  er: "概念 E-R 图", class: "设计类图", sequence: "时序图", table: "数据库表关系图",
};
const standardSwimlaneSchema = z.object({ id, name: text });
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
export const standardAnalysisSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("questions"), questions: z.array(standardQuestionSchema).min(1).max(3) }),
  z.object({ kind: z.literal("ready"), outline: standardOutlineSchema }),
]);
export const standardModelSchema = z.object({
  nodes: z.array(z.object({
    id, label: text,
    type: z.enum(["system", "module", "actor", "usecase", "start", "end", "action", "decision", "component", "entity", "class", "table", "participant"]),
    actorOrLane: id.optional(),
    fields: z.array(text).default([]), methods: z.array(text).default([]),
  })).min(1),
  swimlanes: z.array(standardSwimlaneSchema).optional(),
  edges: z.array(z.object({
    id, from: id, to: id, label: z.string().max(4000).default(""),
    fromCardinality: z.enum(["1", "0..1", "*", "1..*", "0..*"]).optional(),
    toCardinality: z.enum(["1", "0..1", "*", "1..*", "0..*"]).optional(),
    relation: z.enum(["association", "include", "extend", "inheritance", "composition", "aggregation", "return"]).default("association"),
  })),
});
export type StandardModel = z.infer<typeof standardModelSchema>;
export const standardModelNodeTypes = {
  function: ["system", "module"], usecase: ["actor", "usecase"],
  activity: ["start", "end", "action", "decision"], architecture: ["component", "module"],
  er: ["entity"], class: ["class"], sequence: ["participant"], table: ["table"],
} as const;
export const standardModelRelationTypes = {
  function: ["association"], activity: ["association"], architecture: ["association", "composition", "aggregation"],
  usecase: ["association", "include", "extend", "inheritance"], er: ["association"], table: ["association"],
  class: ["association", "inheritance", "composition", "aggregation"], sequence: ["association", "return"],
} as const;

// Provider schemas and local validation share the same per-diagram vocabulary.
export function standardModelSchemaForKind(kind: StandardDiagramKind) {
  const scoped = standardModelSchema.extend({
    nodes: z.array(standardModelSchema.shape.nodes.element.extend({ type: z.enum(standardModelNodeTypes[kind]) })).min(1),
    edges: z.array(standardModelSchema.shape.edges.element.extend({ relation: z.enum(standardModelRelationTypes[kind]).default("association") })),
  });
  return kind === "activity"
    ? scoped.extend({ swimlanes: z.array(standardSwimlaneSchema).min(2) })
    : scoped;
}
const standardGenerationScopeSchema = z.object({
  status: z.enum(["awaiting_selection", "confirmed"]), kinds: z.array(standardDiagramKindSchema).max(8),
});
const standardUnsupportedDiagramRequestSchema = z.object({
  models: z.array(text).min(1).max(8), messageId: z.string().min(1), questionId: id.optional(),
});
export type StandardQuestion = z.infer<typeof standardQuestionSchema>;
export type StandardAnswer = z.infer<typeof standardAnswerSchema>;
export type StandardDiagram = {
  id: string; kind: StandardDiagramKind; title: string; businessId?: string;
  status: "pending" | "running" | "completed" | "failed";
  phase?: "generating" | "checking" | "repairing" | "rendering";
  model?: StandardModel; source?: string; svg?: string; error?: string;
};
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
  reasoning: z.string().optional(), durationMs: z.number().nonnegative().optional(),
  timing: z.object({
    streamStartTime: z.number().nonnegative(), firstTokenTime: z.number().nonnegative().optional(),
    totalStreamTime: z.number().nonnegative(), tokenCount: z.number().nonnegative().optional(),
    tokensPerSecond: z.number().nonnegative().optional(), totalChunks: z.number().int().nonnegative(), toolCallCount: z.number().int().nonnegative(),
  }).optional(),
  suggestions: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
  feedback: z.enum(["positive", "negative"]).optional(),
  tools: z.array(z.object({ id: z.string(), name: z.string(), status: z.enum(["running", "completed", "failed"]) })).optional(),
});
export type StandardConversationMessage = z.infer<typeof standardConversationMessageSchema>;
export const standardTokenUsageSchema = modelTokenUsageSchema;
export type StandardTokenUsage = z.infer<typeof standardTokenUsageSchema>;
const standardRunSchema = z.object({
  id: z.string(), operation: z.string(), status: z.enum(["running", "completed", "failed", "stopped"]),
  interruptionReason: z.literal("server_restart").optional(),
  startedAt: z.string(), finishedAt: z.string().optional(), error: z.string().optional(),
  requestId: z.string().optional(), continuedFrom: z.string().optional(),
  documentStyle: documentStyleSettingsSchema.optional(),
  resumeOperation: z.enum(["chat", "prepare", "tests", "requirementsSpec", "softwareDesignSpec"]).optional(),
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
});
export const standardProjectStateSchema = z.object({
  generationScope: standardGenerationScopeSchema.optional(),
  unsupportedDiagramRequest: standardUnsupportedDiagramRequestSchema.optional(),
  tokenUsage: standardTokenUsageSchema.optional(),
  conversation: z.array(standardConversationMessageSchema).optional(), memory: z.array(text).optional(),
  contextStatus: z.enum(["ready", "compacting"]).optional(), compactionCount: z.number().int().nonnegative().optional(),
  description: z.string(), rounds: z.array(z.object({ questions: z.array(standardQuestionSchema), answers: z.array(standardAnswerSchema), purpose: z.enum(["generation_scope", "business"]).optional() })),
  outline: standardOutlineSchema.optional(), diagrams: z.record(standardDiagramSchema), tests: standardTestsSchema.optional(),
  documents: z.object({
    requirementsSpec: z.object({ title: text, markdown: z.string(), generatedAt: z.string(), documentId: z.string().optional(), documentStyle: documentStyleSettingsSchema.optional(), diagrams: z.array(standardDiagramSchema).optional() }).optional(),
    softwareDesignSpec: z.object({ title: text, markdown: z.string(), generatedAt: z.string(), documentId: z.string().optional(), documentStyle: documentStyleSettingsSchema.optional(), diagrams: z.array(standardDiagramSchema).optional() }).optional(),
  }).optional(),
  run: standardRunSchema.optional(),
});

export function createStandardProjectState(description = ""): StandardProjectState {
  return { description, rounds: [], diagrams: {} };
}

// Only structural constraints are enforced here; no business, visual, freshness or lineage review.
export function validateStandardModel(kind: StandardDiagramKind, input: unknown): StandardModel {
  const model = standardModelSchema.parse(input);
  const ids = new Set(model.nodes.map(node => node.id));
  if (ids.size !== model.nodes.length) throw new Error("节点 ID 重复");
  if (new Set(model.edges.map(edge => edge.id)).size !== model.edges.length) throw new Error("关系 ID 重复");
  if (model.nodes.some(node => !(standardModelNodeTypes[kind] as readonly string[]).includes(node.type))) throw new Error("节点类型不适用于当前图");
  if (model.edges.some(edge => !ids.has(edge.from) || !ids.has(edge.to))) throw new Error("关系引用了不存在的节点");
  if (model.edges.some(edge => !(standardModelRelationTypes[kind] as readonly string[]).includes(edge.relation))) throw new Error("关系类型不适用于当前图");
  if (kind === "activity" && model.swimlanes) {
    if (model.swimlanes.length < 2) throw new Error("业务流程图至少需要两条泳道");
    const laneIds = new Set(model.swimlanes.map(lane => lane.id));
    if (laneIds.size !== model.swimlanes.length) throw new Error("泳道编号重复");
    for (const node of model.nodes) {
      if (node.actorOrLane && !laneIds.has(node.actorOrLane)) throw new Error(`流程元素引用了不存在的泳道：${node.id}`);
      if (node.type === "action" && (!node.actorOrLane || !laneIds.has(node.actorOrLane))) throw new Error(`业务动作必须归属有效泳道：${node.id}`);
    }
    const assignedLanes = new Set(model.nodes.filter(node => node.type === "action").map(node => node.actorOrLane));
    if (model.swimlanes.some(lane => !assignedLanes.has(lane.id))) throw new Error("每条泳道都必须包含至少一个业务动作");
  }
  if (kind === "activity" && (!model.nodes.some(node => node.type === "start") || !model.nodes.some(node => node.type === "end"))) throw new Error("流程图缺少开始或结束节点");
  if (kind === "usecase" && (!model.nodes.some(node => node.type === "actor") || !model.nodes.some(node => node.type === "usecase"))) throw new Error("用例图缺少参与者或用例");
  if (kind === "usecase" && model.edges.some(edge => {
    const from = model.nodes.find(node => node.id === edge.from)!;
    const to = model.nodes.find(node => node.id === edge.to)!;
    if (["include", "extend"].includes(edge.relation)) return from.type !== "usecase" || to.type !== "usecase";
    if (edge.relation === "inheritance") return from.type !== to.type;
    return edge.relation === "association" && from.type === to.type;
  })) throw new Error("用例关系端点类型不匹配");
  if (kind === "activity") {
    if (model.nodes.some(node => node.type === "start" && model.edges.some(edge => edge.to === node.id) || node.type === "end" && model.edges.some(edge => edge.from === node.id))) throw new Error("开始节点不能有入边，结束节点不能有出边");
    if (model.nodes.some(node => node.type === "decision" && model.edges.filter(edge => edge.from === node.id).length < 2)) throw new Error("判断节点至少需要两条分支");
    const reachable = new Set(model.nodes.filter(node => node.type === "start").map(node => node.id));
    let changed = true;
    while (changed) { changed = false; for (const edge of model.edges) if (reachable.has(edge.from) && !reachable.has(edge.to)) { reachable.add(edge.to); changed = true; } }
    if (model.nodes.some(node => !reachable.has(node.id))) throw new Error("流程存在无法从开始到达的节点");
    const terminating = new Set(model.nodes.filter(node => node.type === "end").map(node => node.id));
    changed = true;
    while (changed) { changed = false; for (const edge of model.edges) if (terminating.has(edge.to) && !terminating.has(edge.from)) { terminating.add(edge.from); changed = true; } }
    if (model.nodes.some(node => !terminating.has(node.id))) throw new Error("流程存在无法到达结束的分支");
  }
  if (["er", "table"].includes(kind) && model.edges.some(edge => !edge.fromCardinality || !edge.toCardinality)) throw new Error("实体关系缺少基数");
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
