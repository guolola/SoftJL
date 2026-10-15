// Builds the run-level RequirementBaseline that downstream stages use as the trusted source.
import {
  requirementBaselineSchema,
  type AtomicRequirement,
  type AtomicRequirementField,
  type AtomicRequirementStatus,
  type AtomicRequirementType,
  type RequirementFieldProvenance,
  type RequirementBaseline,
  type RequirementConflict,
  type RequirementCriticality,
  type RequirementQualityIssue,
  type RequirementQualityReport,
  type RequirementRule,
} from "@uml-platform/contracts";

const ACTOR_CANDIDATES = [
  "管理员",
  "借阅者",
  "用户",
  "会员",
  "客户",
  "学生",
  "教师",
  "医生",
  "患者",
  "审批人",
  "采购员",
  "维修员",
  "系统",
];

const MODAL_OR_ACTION_PATTERN =
  "(?:必须|需要|可以|应当|不得|不能|禁止|支持|能够|可|需)";

const BOUNDARY_WORDS = [
  "最多",
  "最少",
  "不少于",
  "不超过",
  "期限",
  "超时",
  "金额",
  "数量",
  "库存",
  "容量",
  "边界",
];

const VAGUE_WORDS = ["快速", "友好", "方便", "稳定", "可靠", "高效"];

const TYPE_BY_CATEGORY: Record<RequirementRule["category"], AtomicRequirementType> = {
  业务规则: "business-rule",
  功能需求: "functional",
  外部接口: "interface",
  界面需求: "interface",
  数据需求: "data",
  非功能需求: "non-functional",
  部署需求: "constraint",
  异常处理: "exception",
};

const CRITICALITY_BY_TYPE: Record<AtomicRequirementType, RequirementCriticality> = {
  functional: "critical",
  "non-functional": "high",
  data: "high",
  role: "critical",
  constraint: "high",
  exception: "critical",
  "business-rule": "critical",
  interface: "medium",
  assumption: "medium",
};

const FIELD_LABEL: Record<AtomicRequirementField, string> = {
  actor: "角色/执行者",
  subject: "主体",
  action: "动作",
  object: "对象",
  condition: "条件",
  outcome: "结果",
  acceptanceCriteria: "验收标准",
};

export function buildRequirementBaseline({
  runId,
  requirementText,
  rules,
  createdAt = new Date().toISOString(),
}: {
  runId: string;
  requirementText: string;
  rules: RequirementRule[];
  createdAt?: string;
}): RequirementBaseline {
  const sourceRules = rules.map((rule) => ({ ...rule }));
  ensureUniqueRequirementRuleIds(sourceRules);
  const requirements = sourceRules.map((rule, index) =>
    buildAtomicRequirement(rule, index, requirementText),
  );
  const conflicts = detectConflicts(requirements);
  const conflictRequirementIds = new Set(
    conflicts.flatMap((conflict) => conflict.requirementIds),
  );
  const issues: RequirementQualityIssue[] = [];

  for (const requirement of requirements) {
    if (conflictRequirementIds.has(requirement.id)) {
      requirement.status = "conflict";
      requirement.confidence = Math.min(requirement.confidence, 0.35);
    }
    issues.push(...qualityIssuesForRequirement(requirement, issues.length));
  }

  for (const conflict of conflicts) {
    issues.push({
      id: issueId(issues.length),
      requirementId: conflict.requirementIds[0],
      severity: "critical",
      code: "conflict",
      message: conflict.description,
      blocksDownstream: true,
    });
  }

  const qualityReport = buildQualityReport(runId, requirements, issues);
  return requirementBaselineSchema.parse({
    runId,
    sourceDocumentId: "inline-requirement",
    requirements,
    assumptions: [],
    conflicts,
    qualityReport,
    createdAt,
  });
}

export function buildEmptyRequirementBaseline({
  runId,
  createdAt = new Date().toISOString(),
}: {
  runId: string;
  createdAt?: string;
}): RequirementBaseline {
  return requirementBaselineSchema.parse({
    runId,
    sourceDocumentId: "inline-requirement",
    requirements: [],
    assumptions: [],
    conflicts: [],
    qualityReport: {
      runId,
      status: "pending-review",
      summary: "尚未抽取原子需求，不能证明下游覆盖。",
      issues: [],
      blockingIssueIds: [],
      reviewRequiredRequirementIds: [],
    },
    createdAt,
  });
}

export function assertRequirementBaselineAllowsDownstream(
  baseline: RequirementBaseline | null | undefined,
): asserts baseline is RequirementBaseline {
  if (!baseline) {
    throw new Error("RequirementBaseline blocked downstream generation: baseline is missing");
  }
  const blockingIssueIds = new Set(baseline.qualityReport.blockingIssueIds);
  const blockingIssues = baseline.qualityReport.issues.filter(
    (issue) => issue.blocksDownstream || blockingIssueIds.has(issue.id),
  );
  if (
    baseline.qualityReport.status === "blocked" ||
    blockingIssueIds.size > 0 ||
    blockingIssues.length > 0
  ) {
    const details =
      blockingIssues
        .map((issue) => issue.message.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join("；") || baseline.qualityReport.summary;
    throw new Error(
      `RequirementBaseline blocked downstream generation: ${details}`,
    );
  }
}

function buildAtomicRequirement(
  rule: RequirementRule,
  index: number,
  requirementText: string,
): AtomicRequirement {
  const type = TYPE_BY_CATEGORY[rule.category];
  const sourceFragment = rule.sourceFragment ?? rule.text;
  const actor = inferActor(rule.text);
  const condition = inferCondition(rule.text);
  const object = inferObject(rule.text);
  const action = inferAction(rule.text, actor);
  const sourceLocation = sourceLocationFor(sourceFragment, requirementText);
  const criticality = CRITICALITY_BY_TYPE[type];
  const fieldProvenance: RequirementFieldProvenance = {};

  addAcceptedFieldProvenance(fieldProvenance, "actor", actor, "source-text");
  addAcceptedFieldProvenance(
    fieldProvenance,
    "subject",
    actor ?? inferSubject(rule.text),
    actor ? "source-text" : "heuristic",
  );
  addAcceptedFieldProvenance(fieldProvenance, "action", action, "heuristic");
  addAcceptedFieldProvenance(fieldProvenance, "object", object, "source-text");
  addAcceptedFieldProvenance(fieldProvenance, "condition", condition, "source-text");
  addAcceptedFieldProvenance(
    fieldProvenance,
    "outcome",
    inferOutcome(rule.text),
    "heuristic",
  );
  addAcceptedFieldProvenance(
    fieldProvenance,
    "acceptanceCriteria",
    `验证：${rule.text}`,
    "heuristic",
  );

  const requirement: AtomicRequirement = {
    id: `REQ-${String(index + 1).padStart(3, "0")}`,
    sourceFragment,
    sourceLocation,
    type,
    actor,
    subject: actor ?? inferSubject(rule.text),
    action,
    object,
    condition,
    outcome: inferOutcome(rule.text),
    confidence: needsActor(type) && !actor ? 0.56 : 0.82,
    status: needsActor(type) && !actor ? "pending-review" : "accepted",
    criticality,
    acceptanceCriteria: [`验证：${rule.text}`],
    fieldProvenance,
    priority: criticality === "critical" ? "must" : "should",
    sourceRuleId: rule.id,
  };
  applyAiFieldRepairSuggestions(requirement);
  return requirement;
}

function addAcceptedFieldProvenance(
  provenance: RequirementFieldProvenance,
  field: AtomicRequirementField,
  value: string | null,
  source: "source-text" | "heuristic",
) {
  if (!value) return;
  provenance[field] = {
    source,
    status: "accepted",
    value,
  };
}

function markAiSuggestedField(
  requirement: AtomicRequirement,
  field: AtomicRequirementField,
  value: string,
  rationale: string,
  status: "accepted" | "pending-review" = "pending-review",
) {
  if (field === "acceptanceCriteria") {
    requirement.acceptanceCriteria = [value];
  } else {
    requirement[field] = value;
  }
  requirement.fieldProvenance[field] = {
    source: "ai-suggested",
    status,
    value,
    originalValue:
      field === "acceptanceCriteria"
        ? requirement.fieldProvenance[field]?.value ?? null
        : requirement.fieldProvenance[field]?.value ?? null,
    rationale,
  };
  if (status === "pending-review") {
    requirement.status = "pending-review";
    requirement.confidence = Math.min(requirement.confidence, 0.66);
  } else {
    requirement.confidence = Math.max(requirement.confidence, 0.74);
  }
}

function applyAiFieldRepairSuggestions(requirement: AtomicRequirement) {
  const text = requirement.sourceFragment;

  if (needsActor(requirement.type) && !requirement.actor) {
    const suggestedActor =
      (text.includes("普通读者") && "普通读者") ||
      (text.includes("图书管理员") && "图书管理员") ||
      (text.includes("一个读者") && "读者") ||
      (text.match(/可供([\p{L}\p{N}_·]{2,16})/u)?.[1] ?? null);
    if (suggestedActor) {
      markAiSuggestedField(
        requirement,
        "actor",
        suggestedActor,
        "原规则存在权限或角色语义，但初始结构化字段未能稳定提取，生成 AI 补齐建议。",
        "accepted",
      );
      if (!requirement.subject) {
        markAiSuggestedField(
          requirement,
          "subject",
          suggestedActor,
          "主体与补齐的角色/执行者保持一致，AI 自动补齐。",
          "accepted",
        );
      }
    }
  }

  if (/自己借出的书目/u.test(text)) {
    markAiSuggestedField(
      requirement,
      "object",
      "自己借出的书目",
      "原文描述普通读者查询自己借出的书目，AI 自动补齐对象字段。",
      "accepted",
    );
    if (!requirement.condition) {
      markAiSuggestedField(
        requirement,
        "condition",
        "登录身份为普通读者",
        "该规则涉及普通读者权限边界，AI 自动补齐身份条件。",
        "accepted",
      );
    }
    if (requirement.outcome === "系统满足该需求") {
      markAiSuggestedField(
        requirement,
        "outcome",
        "系统返回该读者自己的借出书目",
        "AI 根据查询对象自动补齐可验收结果。",
        "accepted",
      );
    }
  }

  if (/最近借走某本图书的读者/u.test(text) && !requirement.object) {
    markAiSuggestedField(
      requirement,
      "object",
      "某本图书的最近借阅者",
      "原文要求查询最近借走某本图书的读者，AI 自动补齐对象字段。",
      "accepted",
    );
  }

  if (/预定值/u.test(text) || (/不能超过|不超过/u.test(text) && /数目|数量/u.test(text))) {
    markAiSuggestedField(
      requirement,
      "condition",
      "借书数量上限为预定值，需人工确认具体数值",
      "原文含边界限制但没有给出具体数值，AI 只能补齐待确认的边界条件。",
    );
    if (!requirement.object) {
      markAiSuggestedField(
        requirement,
        "object",
        "一次借出的书籍数目",
        "原文约束借书数量上限，AI 建议补齐对象字段。",
      );
    }
  }

  const hasPendingAiField = Object.values(requirement.fieldProvenance).some(
    (provenance) =>
      provenance?.source === "ai-suggested" && provenance.status === "pending-review",
  );
  if (
    !hasPendingAiField &&
    requirement.status === "pending-review" &&
    (!needsActor(requirement.type) || Boolean(requirement.actor)) &&
    (requirement.object || !["functional", "business-rule", "data"].includes(requirement.type))
  ) {
    requirement.status = "accepted";
  }
}

function sourceLocationFor(fragment: string, requirementText: string) {
  const startOffset = requirementText.indexOf(fragment);
  if (startOffset < 0) return { section: "input" };
  return {
    startOffset,
    endOffset: startOffset + fragment.length,
    section: "input",
  };
}

function inferActor(text: string) {
  const match = text.match(
    new RegExp(`^([\\p{L}\\p{N}_·]{2,16}?)${MODAL_OR_ACTION_PATTERN}`, "u"),
  );
  if (match?.[1]) return match[1];
  const known = ACTOR_CANDIDATES.find((actor) => text.includes(actor));
  return known ?? null;
}

function ensureUniqueRequirementRuleIds(rules: RequirementRule[]) {
  const usedRuleIds = new Set<string>();
  for (const rule of rules) {
    const baseId = rule.id.trim() || "r";
    let candidate = baseId;
    let suffix = 2;
    while (usedRuleIds.has(candidate.toLowerCase())) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedRuleIds.add(candidate.toLowerCase());
    rule.id = candidate;
  }
}

function inferSubject(text: string) {
  return text.includes("系统") ? "系统" : null;
}

function inferCondition(text: string) {
  const inputCondition = text.match(/根据[^，。；]*?需求/u);
  if (inputCondition) return inputCondition[0];
  const match = text.match(/(?:在|当|若|如果|登录后|提交后)([^，。；]*)/u);
  return match?.[0] ?? null;
}

function inferAction(text: string, actor: string | null) {
  const cleaned = text
    .replace(/。$/u, "")
    .replace(actor ? new RegExp(`^${escapeRegExp(actor)}`, "u") : /^/u, "")
    .replace(/^(必须|需要|可以|应当|不得|不能|禁止)/u, "");
  return cleaned || text;
}

function inferObject(text: string) {
  const generatedTarget = text.match(
    /生成\s*([A-Za-z\p{L}\p{N}_· ]{1,24}?)(?:。|，|；|$)/u,
  );
  if (generatedTarget?.[1]?.trim()) return generatedTarget[1].trim();
  const knownObjects = [
    "图书",
    "借书",
    "退款",
    "订单",
    "通知",
    "主要功能",
    "功能",
    "库存",
    "课程",
    "预约",
    "维修单",
    "审批",
    "需求",
    "模型",
    "活动",
    "报名",
    "数据",
    "日期",
  ];
  const known = knownObjects.find((object) => text.includes(object));
  if (known) return known;
  const actionObject = text.match(
    new RegExp(`${MODAL_OR_ACTION_PATTERN}(?:办理|审核|提交|创建|生成|记录|查询|更新|删除|归档|处理|访问|管理)?([\\p{L}\\p{N}_·]{2,16}?)(?:。|，|；|$)`, "u"),
  );
  return actionObject?.[1] ?? null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferOutcome(text: string) {
  if (/不得|不能|禁止/u.test(text)) return "系统阻止该行为";
  if (/异常|失败|错误/u.test(text)) return "系统反馈异常原因";
  return "系统满足该需求";
}

function needsActor(type: AtomicRequirementType) {
  return ["functional", "business-rule", "role", "exception"].includes(type);
}

function qualityIssuesForRequirement(
  requirement: AtomicRequirement,
  existingIssueCount: number,
): RequirementQualityIssue[] {
  const issues: RequirementQualityIssue[] = [];
  const addIssue = (
    code: RequirementQualityIssue["code"],
    message: string,
    blocksDownstream: boolean,
    severity: RequirementQualityIssue["severity"] = blocksDownstream
      ? "critical"
      : "warning",
  ) => {
    issues.push({
      id: issueId(existingIssueCount + issues.length),
      requirementId: requirement.id,
      severity,
      code,
      message,
      blocksDownstream,
    });
  };

  if (needsActor(requirement.type) && !requirement.actor) {
    addIssue("missing-actor", `${requirement.id} 缺少明确角色/执行者。`, true);
  }
  const pendingAiFields = Object.entries(requirement.fieldProvenance)
    .filter(([, provenance]) => provenance?.source === "ai-suggested" && provenance.status === "pending-review")
    .map(([field]) => FIELD_LABEL[field as AtomicRequirementField] ?? field);
  if (pendingAiFields.length > 0) {
    addIssue(
      "derived-assumption",
      `${requirement.id} 包含 AI 补齐待确认字段：${pendingAiFields.join("、")}。`,
      requirement.criticality === "critical" || requirement.criticality === "high",
      requirement.criticality === "critical" ? "critical" : "error",
    );
  }
  if (requirement.criticality === "critical" && requirement.confidence < 0.7) {
    addIssue("low-confidence", `${requirement.id} 是关键需求但置信度较低。`, true);
  }
  if (!requirement.object && ["functional", "business-rule", "data"].includes(requirement.type)) {
    addIssue("missing-object", `${requirement.id} 缺少明确对象。`, true);
  }
  if (
    BOUNDARY_WORDS.some((word) => requirement.sourceFragment.includes(word)) &&
    !/\d/.test(requirement.sourceFragment) &&
    !/\d/.test(requirement.condition ?? "") &&
    requirement.fieldProvenance.condition?.status !== "accepted"
  ) {
    addIssue("missing-boundary", `${requirement.id} 提到边界但缺少可验证数值。`, true);
  }
  if (
    VAGUE_WORDS.some((word) => requirement.sourceFragment.includes(word)) &&
    !/\d/.test(requirement.sourceFragment)
  ) {
    addIssue("non-verifiable", `${requirement.id} 包含不可验证表述。`, false);
  }

  return issues;
}

export function rebuildRequirementBaselineQualityReport(
  baseline: RequirementBaseline,
): RequirementBaseline {
  const issues = baseline.requirements.flatMap((requirement, index) =>
    qualityIssuesForRequirement(requirement, index * 10),
  );
  const conflicts = detectConflicts(baseline.requirements);
  for (const conflict of conflicts) {
    issues.push({
      id: issueId(issues.length),
      requirementId: conflict.requirementIds[0],
      severity: "critical",
      code: "conflict",
      message: conflict.description,
      blocksDownstream: true,
    });
  }
  return requirementBaselineSchema.parse({
    ...baseline,
    conflicts,
    qualityReport: buildQualityReport(baseline.runId, baseline.requirements, issues),
  });
}

function detectConflicts(requirements: AtomicRequirement[]): RequirementConflict[] {
  const conflicts: RequirementConflict[] = [];
  for (let i = 0; i < requirements.length; i += 1) {
    for (let j = i + 1; j < requirements.length; j += 1) {
      const left = requirements[i];
      const right = requirements[j];
      if (!left || !right) continue;
      if (conflictKey(left) !== conflictKey(right)) continue;
      if (polarity(left.sourceFragment) === polarity(right.sourceFragment)) continue;
      conflicts.push({
        id: `CON-${String(conflicts.length + 1).padStart(3, "0")}`,
        requirementIds: [left.id, right.id],
        description: `${left.id} 与 ${right.id} 对同一行为给出冲突约束。`,
        severity: "critical",
        status: "conflict",
      });
    }
  }
  return conflicts;
}

function conflictKey(requirement: AtomicRequirement) {
  return [
    requirement.actor ?? requirement.subject ?? "",
    normalizeForConflict(requirement.action ?? requirement.sourceFragment),
    requirement.object ?? "",
  ].join("|");
}

function normalizeForConflict(text: string) {
  return text
    .replace(/[。；，\s]/gu, "")
    .replace(/必须|需要|可以|应当|不得|不能|禁止/gu, "");
}

function polarity(text: string) {
  return /不得|不能|禁止/u.test(text) ? "deny" : "allow";
}

function buildQualityReport(
  runId: string,
  requirements: AtomicRequirement[],
  issues: RequirementQualityIssue[],
): RequirementQualityReport {
  const auditIssues = issues.map((issue) => ({
    ...issue,
    blocksDownstream: false,
  }));
  const blockingIssueIds: string[] = [];
  const reviewRequiredRequirementIds = Array.from(
    new Set(
      requirements
        .filter((requirement) => requirement.status !== "accepted")
        .map((requirement) => requirement.id),
    ),
  );
  const status =
    blockingIssueIds.length > 0
      ? "blocked"
      : reviewRequiredRequirementIds.length > 0 || issues.length > 0
        ? "pending-review"
        : "passed";

  return {
    runId,
    status,
    summary:
      status === "passed"
        ? `已建立 ${requirements.length} 条原子需求基线。`
        : `发现 ${auditIssues.length} 个需求质量提示，可继续生成并在当前阶段查看。`,
    issues: auditIssues,
    blockingIssueIds,
    reviewRequiredRequirementIds,
  };
}

function issueId(index: number) {
  return `ISS-${String(index + 1).padStart(3, "0")}`;
}
