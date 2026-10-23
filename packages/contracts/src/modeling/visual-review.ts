// Defines structured findings and outcomes produced by the current diagram checks.
import { MAX_GENERATION_REPAIR_ATTEMPTS } from "../runs/generation-policy.js";
import { z } from "zod";

// Saved judgments retain the rule version so historical success never implies a fresh verification.
export const CURRENT_DIAGRAM_REVIEW_VERSION = "program-validation-v4";

export const diagramReviewCategorySchema = z.enum(["model_structure", "business_content", "business_constraint", "render_mismatch", "check_execution", "other"]);
export type DiagramReviewCategory = z.infer<typeof diagramReviewCategorySchema>;

// Unreadable input is an evidence limit; layout preferences never authorize a structural finding.
export function isUnverifiableReviewText(text: string): boolean {
  return /不可读|不可辨|无法辨|无法核实|无法识别|看不清|unreadable|illegible|cannot (?:verify|identify|read)/i.test(text);
}
export function isExcludedDiagramReviewIssue(text: string): boolean {
  if (isUnverifiableReviewText(text)) return false;
  const layout = /布局|位置|间距|交叉|绕线|绕行|遮挡|重叠|字体|字号|可读性|放在|放到|位于|置于|居中|偏移|拥挤|layout|position|alignment|spacing|crossing|routing|overlap|font|readability/i.test(text);
  // Merely naming an endpoint or business condition does not turn its spacing into a defect.
  // Avoid a greedy .* scan from every repeated field name in long historical diagnostics.
  const concern = /端点|归属|主键|外键|条件|约束|比较符|方向|类型|标签|符号/.exec(text);
  const concernError = concern && /错误|有误|不一致|不符|相反|颠倒|不满足|违反/.test(text.slice(concern.index + concern[0].length));
  const structure = Boolean(concernError) || /缺少|缺失|遗漏|多出|未知|非法|missing|extra|unknown|invalid|mismatch|wrong (?:node|endpoint|owner|type|direction|label|symbol)|constraint (?:violation|error)/i.test(text);
  return layout && !structure;
}
export function classifyDiagramReviewIssue(text: string, layer?: "model" | "render" | "image", code = ""): DiagramReviewCategory {
  // Service diagnostic codes take precedence over provider observation text.
  if (/^(?:constraint-marker|constraint-relationship|explicit-owner|actor-participation|isolated-actor|disconnected-usecase|missing-actor-association)$/i.test(code)) return "model_structure";
  if (/^(?:missing-svg-element|missing-svg-relationship|render-mismatch)$/i.test(code)) return "render_mismatch";
  const value = `${code} ${text}`;
  if (isUnverifiableReviewText(value) || /未完成|超时|非法.*(?:JSON|输出)|获取.*失败|PNG.*(?:失败|不可用)|timeout|invalid-json|provider-error/i.test(value)) return "check_execution";
  if (/(?:角色|参与者).*(?:没有|未|无).*(?:关联线|关联关系|连接到|参与关系)|没有关联线/i.test(value)) return layer === "image" || layer === "render" ? "render_mismatch" : "model_structure";
  if (/constraint|comparator|complementary-branch|主键|外键|比较符|分支.*条件|业务规则|业务约束|业务条件/i.test(value)) return "business_constraint";
  if (/missing-svg|stale-label|render-mismatch|图形.*不一致|标签.*(?:错|不一致|不符)|连线.*(?:缺|方向|归属)|方向.*(?:错|相反|不符|颠倒)|UML.*(?:错|不符)|wrong-(?:direction|symbol)/i.test(value)) return layer === "model" ? "model_structure" : "render_mismatch";
  if (/missing-node|extra-node|unknown-shape|wrong-(?:endpoint|type|owner)|explicit-owner|缺少|缺失|遗漏|多出|未知|非法引用|端点|关系类型|归属/i.test(value)) return layer === "image" || layer === "render" ? "render_mismatch" : "model_structure";
  return "other";
}

export const diagramReviewFindingSchema = z.object({
  id: z.string().min(1),
  layer: z.enum(["model", "render", "image"]),
  code: z.string().min(1),
  category: diagramReviewCategorySchema,
  modelId: z.string().min(1),
  elementId: z.string().optional(),
  relationshipId: z.string().optional(),
  path: z.string().optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  evidence: z.array(z.object({ source: z.string(), reference: z.string(), detail: z.string() })).default([]),
  observation: z.string().min(1),
  verification: z.enum(["verified", "unverified", "inconclusive"]),
  repairable: z.boolean().default(false),
});
export type DiagramReviewFinding = z.infer<typeof diagramReviewFindingSchema>;

export const diagramRepairRecordSchema = z.object({
  round: z.number().int().min(1).max(MAX_GENERATION_REPAIR_ATTEMPTS),
  target: z.enum(["model", "render"]),
  method: z.enum(["hard_rule", "llm"]).optional(),
  issueIds: z.array(z.string()),
  callId: z.string().optional(),
  beforeFingerprint: z.string(),
  afterFingerprint: z.string().optional(),
  status: z.enum(["accepted", "rejected", "failed"]),
  changes: z.array(z.string()),
  reason: z.string(),
});

export const diagramVisualReviewSchema = z.object({
  status: z.enum(["passed", "skipped", "pending_review", "failed", "not_completed"]),
  issues: z.array(z.string()),
  reason: z.string(),
  attempts: z.number().int().min(0),
  repairAttempts: z.number().int().min(0).optional(),
  checkedAt: z.string(),
  // Human acceptance is distinct from the automated visual verdict.
  confirmedAt: z.string().optional(),
  findings: z.array(diagramReviewFindingSchema),
  repairHistory: z.array(diagramRepairRecordSchema).optional(),
  checkOutcome: z.enum(["verified", "differences", "inconclusive", "not_completed", "skipped"]).optional(),
  structureAttempts: z.number().int().min(0).optional(),
  structureStatus: z.enum(["passed", "failed", "not_completed", "skipped"]).optional(),
  renderStatus: z.enum(["passed", "failed", "not_completed", "skipped"]).optional(),
  imageStatus: z.enum(["passed", "failed", "not_completed", "skipped"]).optional(),
  profileId: z.string().min(1).optional(),
  reviewVersion: z.string().min(1).optional(),
  inputFingerprint: z.string().optional(),
  stopReason: z.string().optional(),
});
export type DiagramVisualReview = z.infer<typeof diagramVisualReviewSchema>;
