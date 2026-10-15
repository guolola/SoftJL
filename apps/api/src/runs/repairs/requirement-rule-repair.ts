// Builds and applies requirement rule repair prompts without owning route concerns.
import type { ChatMessage } from "../../llm.js";
import { parseJson } from "../../normalizers/json/parse-json.js";
import { rebuildRequirementBaselineQualityReport } from "../baselines/requirement-baseline.js";
import {
  repairRequirementRulesResponseSchema,
  repairRequirementRuleResponseSchema,
  requirementRuleBatchRepairSuggestionSchema,
  requirementRuleRepairSuggestionSchema,
  compareRequirementSemantics,
  unsupportedRequirementFacts,
  type AtomicRequirement,
  type AtomicRequirementField,
  type RepairRequirementRuleRequest,
  type RepairRequirementRuleResponse,
  type RepairRequirementRulesRequest,
  type RequirementFieldProvenance,
  type RequirementQualityIssue,
  type RequirementRuleRepairSuggestion,
} from "@uml-platform/contracts";

const REPAIRABLE_REQUIREMENT_FIELDS: AtomicRequirementField[] = [
  "actor",
  "subject",
  "action",
  "object",
  "condition",
  "outcome",
  "acceptanceCriteria",
];

const REQUIREMENT_FIELD_LABELS: Record<AtomicRequirementField, string> = {
  actor: "角色/执行者",
  subject: "主体",
  action: "动作",
  object: "对象",
  condition: "条件",
  outcome: "结果",
  acceptanceCriteria: "验收标准",
};

function currentRequirementFieldValue(
  requirement: AtomicRequirement,
  field: AtomicRequirementField,
) {
  if (field === "acceptanceCriteria") {
    return requirement.acceptanceCriteria.join("；");
  }
  return requirement[field] ?? "";
}

function nonEmptyOrNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readableFieldText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => readableFieldText(item))
      .filter((item): item is string => typeof item === "string" && item.length > 0)
      .join("；");
    return text || null;
  }
  return null;
}

function readableConfidence(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 && value <= 1 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  const percentMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*%$/u);
  const parsed = percentMatch
    ? Number(percentMatch[1]) / 100
    : Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return undefined;
  }
  return parsed;
}

function normalizeRequirementRepairSuggestionOutput(raw: unknown) {
  if (!isPlainRecord(raw)) {
    return raw;
  }
  const normalized: Record<string, unknown> = { ...raw };
  const confidence = readableConfidence(raw.confidence);
  if (confidence === undefined) {
    delete normalized.confidence;
  } else {
    normalized.confidence = confidence;
  }
  if (isPlainRecord(raw.fields)) {
    const fields = { ...raw.fields };
    for (const field of REPAIRABLE_REQUIREMENT_FIELDS) {
      const entry = fields[field];
      if (entry === null) {
        delete fields[field];
        continue;
      }
      if (!isPlainRecord(entry)) continue;
      const normalizedEntry: Record<string, unknown> = {
        ...entry,
        value: readableFieldText(entry.value),
        originalValue: readableFieldText(entry.originalValue),
      };
      // Some OpenAI-compatible providers emit nullable optional fields despite
      // the response schema; absence and null both mean there is no issue link.
      if (entry.issueIds === null) delete normalizedEntry.issueIds;
      if (entry.rationale === null) delete normalizedEntry.rationale;
      fields[field] = normalizedEntry;
    }
    normalized.fields = fields;
  }
  if (raw.status === null) delete normalized.status;
  if (raw.rationale === null) delete normalized.rationale;
  return normalized;
}

function applyParsedRequirementRepairSuggestion(
  input: RepairRequirementRuleRequest,
  suggestion: RequirementRuleRepairSuggestion,
) {
  const baseline = structuredClone(input.baseline) as RepairRequirementRuleRequest["baseline"];
  const requirement = baseline.requirements.find(
    (item) => item.sourceRuleId === input.rule.id,
  );
  if (!requirement) {
    throw new Error("当前规则没有对应的需求基线，无法单项修复");
  }
  const beforeRequirement = structuredClone(requirement) as AtomicRequirement;

  const existingProvenance = requirement.fieldProvenance ?? {};
  const nextProvenance: RequirementFieldProvenance = { ...existingProvenance };
  for (const field of REPAIRABLE_REQUIREMENT_FIELDS) {
    const repaired = suggestion.fields[field];
    if (!repaired) continue;
    const value = repaired.value?.trim() ?? "";
    nextProvenance[field] = {
      ...repaired,
      value: value || repaired.value,
      originalValue: nonEmptyOrNull(
        repaired.originalValue ??
          existingProvenance[field]?.originalValue ??
          currentRequirementFieldValue(requirement, field),
      ),
    };
    if (!value) continue;
    if (field === "acceptanceCriteria") {
      requirement.acceptanceCriteria = value
        .split(/[；;\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    } else {
      requirement[field] = value;
    }
  }
  requirement.fieldProvenance = nextProvenance;
  if (typeof suggestion.confidence === "number") {
    requirement.confidence = suggestion.confidence;
  }
  if (suggestion.status) {
    requirement.status = suggestion.status;
  } else if (
    Object.values(nextProvenance).some(
      (item) => item?.source === "ai-suggested" && item.status === "pending-review",
    )
  ) {
    requirement.status = "pending-review";
  }

  const semanticDiff = compareRequirementSemantics(
    beforeRequirement,
    requirement,
  );
  const unsupportedFacts = unsupportedRequirementFacts(
    requirement.sourceFragment,
    requirement,
  );
  if (semanticDiff.lostFacts.length > 0 || unsupportedFacts.length > 0) {
    // Repairs are candidates, not authority to delete or invent confirmed business facts.
    requirement.status = "pending-review";
    requirement.confidence = Math.min(requirement.confidence, 0.69);
  }

  const rebuiltBaseline = rebuildRequirementBaselineQualityReport(baseline);
  const repairedRequirement =
    rebuiltBaseline.requirements.find((item) => item.id === requirement.id) ??
    requirement;
  const semanticIssues: RequirementQualityIssue[] = [];
  if (semanticDiff.lostFacts.length > 0) {
    semanticIssues.push({
      id: `SEM-${repairedRequirement.id}-LOSS`,
      requirementId: repairedRequirement.id,
      severity: "critical",
      code: "semantic-loss",
      message: `智能修复删除了原始语义：${semanticDiff.lostFacts
        .map((fact) => fact.label)
        .join("、")}。`,
      blocksDownstream: true,
    });
  }
  if (unsupportedFacts.length > 0) {
    semanticIssues.push({
      id: `SEM-${repairedRequirement.id}-ADDED`,
      requirementId: repairedRequirement.id,
      severity: "error",
      code: "derived-assumption",
      message: `智能修复新增了原文无法确认的事实：${unsupportedFacts
        .map((fact) => fact.label)
        .join("、")}。`,
      blocksDownstream: false,
    });
  }
  const qualityIssues = [
    ...rebuiltBaseline.qualityReport.issues,
    ...semanticIssues,
  ];
  const blockingIssueIds = qualityIssues
    .filter((issue) => issue.blocksDownstream)
    .map((issue) => issue.id);
  const reviewRequiredRequirementIds = Array.from(
    new Set([
      ...rebuiltBaseline.qualityReport.reviewRequiredRequirementIds,
      ...(semanticIssues.length > 0 ? [repairedRequirement.id] : []),
    ]),
  );
  const qualityReport = {
    ...rebuiltBaseline.qualityReport,
    status:
      blockingIssueIds.length > 0
        ? ("blocked" as const)
        : reviewRequiredRequirementIds.length > 0 || qualityIssues.length > 0
          ? ("pending-review" as const)
          : ("passed" as const),
    summary:
      semanticIssues.length > 0
        ? `发现 ${qualityIssues.length} 个需求质量提示，智能修复结果需要人工复核。`
        : rebuiltBaseline.qualityReport.summary,
    issues: qualityIssues,
    blockingIssueIds,
    reviewRequiredRequirementIds,
  };
  const blockingReasons = qualityReport.issues
    .filter(
      (issue): issue is RequirementQualityIssue & { requirementId: string } =>
        issue.requirementId === repairedRequirement.id && issue.blocksDownstream,
    )
    .map((issue) => issue.message);

  return repairRequirementRuleResponseSchema.parse({
    requirement: repairedRequirement,
    qualityReport,
    repairRationale:
      suggestion.rationale ??
      "已仅针对当前需求规则补齐结构化字段，并重新运行需求质量检查。",
    blockingReasons,
  });
}

export function applyRequirementRepairSuggestion(
  input: RepairRequirementRuleRequest,
  rawOutput: string,
) {
  const suggestion = requirementRuleRepairSuggestionSchema.parse(
    normalizeRequirementRepairSuggestionOutput(parseJson(rawOutput)),
  );
  return applyParsedRequirementRepairSuggestion(input, suggestion);
}

export function buildRequirementRuleRepairMessages(
  input: RepairRequirementRuleRequest,
): ChatMessage[] {
  const requirement = input.baseline.requirements.find(
    (item) => item.sourceRuleId === input.rule.id,
  );
  const issues = input.baseline.qualityReport.issues.filter(
    (issue) => !requirement || issue.requirementId === requirement.id,
  );
  return [
    {
      role: "system",
      content:
        "你是需求规则字段级修复助手。只修复当前一条需求规则的结构化字段，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task:
            "根据原始需求文本、当前规则和质量问题，为当前 AtomicRequirement 生成字段级补齐建议。能从原文明确推出的字段可以 accepted；原文没有给出关键业务事实（例如预定值具体是多少）只能 pending-review，不能伪装为已确认。",
          outputRules: [
            "所有字段值必须是中文字符串或 null，不能返回数组或对象。",
            "originalValue 必须是字符串或 null；验收标准有多条时合并为一段中文文本。",
            "acceptanceCriteria.value 如需表达多条验收标准，请用中文分号分隔成一个字符串。",
            "只能补齐或澄清字段，不得删除原规则中的数字、单位、比较符、否定、逻辑关系、角色、状态、异常分支或事件/时间触发条件。",
            "原文没有明确给出的阈值、预算、周期、角色、状态或外部依赖必须标记 pending-review，不能标记 accepted。",
          ],
          outputShape: {
            fields: Object.fromEntries(
              REPAIRABLE_REQUIREMENT_FIELDS.map((field) => [
                field,
                {
                  source: "ai-suggested",
                  status: "accepted 或 pending-review",
                  value: `${REQUIREMENT_FIELD_LABELS[field]}的中文建议值`,
                  originalValue: "原始值；没有提取到则为 null",
                  rationale: "中文修复原因",
                },
              ]),
            ),
            confidence: "0 到 1",
            status: "accepted 或 pending-review 或 conflict",
            rationale: "中文总体修复原因",
          },
          originalRequirementText: input.requirementText,
          currentRule: input.rule,
          currentRequirement: requirement,
          qualityIssues: issues,
        },
        null,
        2,
      ),
    },
  ];
}

export function buildRequirementRulesRepairMessages(
  input: RepairRequirementRulesRequest,
): ChatMessage[] {
  const targetRuleIds = new Set(input.targetRuleIds);
  const targetRules = input.rules.filter((rule) => targetRuleIds.has(rule.id));
  const targetRequirements = input.baseline.requirements.filter(
    (requirement) =>
      requirement.sourceRuleId && targetRuleIds.has(requirement.sourceRuleId),
  );
  const targetRequirementIds = new Set(targetRequirements.map((item) => item.id));
  const issues = input.baseline.qualityReport.issues.filter(
    (issue) => !issue.requirementId || targetRequirementIds.has(issue.requirementId),
  );
  return [
    {
      role: "system",
      content:
        "你是需求规则批量字段级修复助手。一次性为多条需求规则生成结构化字段修复候选，不改写原始需求文本，不重新生成全部规则。输出必须是 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task:
            "根据原始需求文本、当前规则、当前 AtomicRequirement 和质量问题，为所有 targetRuleIds 生成字段级补齐建议。每条 repairs 必须带 ruleId。能从原文明确推出的字段可以 accepted；原文没有给出关键业务事实只能 pending-review，不能伪装为已确认。",
          outputRules: [
            "只返回 targetRuleIds 中的规则，不要返回未知 ruleId。",
            "所有字段值必须是中文字符串或 null，不能返回数组或对象。",
            "originalValue 必须是字符串或 null；验收标准有多条时合并为一段中文文本。",
            "acceptanceCriteria.value 如需表达多条验收标准，请用中文分号分隔成一个字符串。",
            "confidence 必须是 0 到 1 的数字。",
            "只能补齐或澄清字段，不得删除原规则中的数字、单位、比较符、否定、逻辑关系、角色、状态、异常分支或事件/时间触发条件。",
            "原文没有明确给出的阈值、预算、周期、角色、状态或外部依赖必须标记 pending-review，不能标记 accepted。",
          ],
          outputShape: {
            repairs: [
              {
                ruleId: "规则 id",
                fields: Object.fromEntries(
                  REPAIRABLE_REQUIREMENT_FIELDS.map((field) => [
                    field,
                    {
                      source: "ai-suggested",
                      status: "accepted 或 pending-review",
                      value: `${REQUIREMENT_FIELD_LABELS[field]}的中文建议值`,
                      originalValue: "原始值；没有提取到则为 null",
                      rationale: "中文修复原因",
                    },
                  ]),
                ),
                confidence: "0 到 1 的数字",
                status: "accepted 或 pending-review 或 conflict",
                rationale: "中文总体修复原因",
              },
            ],
          },
          originalRequirementText: input.requirementText,
          targetRuleIds: input.targetRuleIds,
          currentRules: targetRules,
          currentRequirements: targetRequirements,
          qualityIssues: issues,
        },
        null,
        2,
      ),
    },
  ];
}

export function applyBatchRequirementRepairSuggestions(
  input: RepairRequirementRulesRequest,
  rawOutput: string,
) {
  const rawParsed = requirementRuleBatchRepairSuggestionSchema.parse(
    parseJson(rawOutput),
  );
  const repairsByRuleId = new Map<string, unknown>();
  for (const repair of rawParsed.repairs) {
    if (!repairsByRuleId.has(repair.ruleId)) {
      repairsByRuleId.set(repair.ruleId, repair);
    }
  }
  const candidates: Array<{
    ruleId: string;
    requirement: AtomicRequirement;
    qualityReport: RepairRequirementRuleResponse["qualityReport"];
    repairRationale: string;
    blockingReasons: string[];
  }> = [];
  const failures: Array<{ ruleId: string; errorMessage: string }> = [];

  for (const ruleId of input.targetRuleIds) {
    const rule = input.rules.find((item) => item.id === ruleId);
    const requirement = input.baseline.requirements.find(
      (item) => item.sourceRuleId === ruleId,
    );
    if (!rule || !requirement) {
      failures.push({
        ruleId,
        errorMessage: "当前规则没有对应的需求基线，无法批量修复",
      });
      continue;
    }
    const rawRepair = repairsByRuleId.get(ruleId);
    if (!rawRepair) {
      failures.push({
        ruleId,
        errorMessage: "模型未返回当前规则的修复候选",
      });
      continue;
    }
    try {
      const suggestion = requirementRuleRepairSuggestionSchema.parse(
        normalizeRequirementRepairSuggestionOutput(rawRepair),
      );
      const result = applyParsedRequirementRepairSuggestion(
        {
          projectId: input.projectId,
          requirementText: input.requirementText,
          rule,
          baseline: input.baseline,
          providerSettings: input.providerSettings,
        },
        suggestion,
      );
      candidates.push({ ruleId, ...result });
    } catch {
      failures.push({
        ruleId,
        errorMessage: "模型返回的修复结果格式无效，请重新修复。",
      });
    }
  }

  return repairRequirementRulesResponseSchema.parse({
    candidates,
    failures,
  });
}
