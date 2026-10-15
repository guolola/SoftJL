// Extracts deterministic business facts so requirement repairs cannot silently weaken accepted semantics.
import type { AtomicRequirement } from "./requirements.js";

export type RequirementSemanticFactKind =
  | "actor"
  | "object"
  | "boundary"
  | "logic"
  | "modality"
  | "event"
  | "temporal"
  | "status";

export interface RequirementSemanticFact {
  kind: RequirementSemanticFactKind;
  key: string;
  label: string;
}

export interface RequirementSemanticDiff {
  lostFacts: RequirementSemanticFact[];
  addedFacts: RequirementSemanticFact[];
}

type RequirementSemanticInput = Pick<
  AtomicRequirement,
  "actor" | "subject" | "action" | "object" | "condition" | "outcome"
>;

const NUMBER_UNIT_PATTERN =
  "(?:百分比|%|毫秒|秒|分钟|小时|天|日|周|个月|月|年|次|个|人|元|级|条|页|MB|GB)?";

const COMPARATOR_ALIASES: Record<string, string> = {
  不超过: "<=",
  最多: "<=",
  至多: "<=",
  小于等于: "<=",
  以内: "<=",
  以下: "<=",
  不低于: ">=",
  不少于: ">=",
  大于等于: ">=",
  至少: ">=",
  以上: ">=",
  达到: ">=",
  达: ">=",
  ">=": ">=",
  超过: ">",
  大于: ">",
  晚于: ">",
  ">": ">",
  低于: "<",
  少于: "<",
  小于: "<",
  早于: "<",
  "<": "<",
  "<=": "<=",
  等于: "=",
  恰好: "=",
  正好: "=",
  "=": "=",
};

function compactSemanticText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[“”"'`]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
}

function addFact(
  facts: Map<string, RequirementSemanticFact>,
  kind: RequirementSemanticFactKind,
  value: string,
  label = value,
) {
  const normalized = compactSemanticText(value);
  if (!normalized) return;
  const key = `${kind}:${normalized}`;
  if (!facts.has(key)) {
    facts.set(key, { kind, key, label: compactSemanticText(label) });
  }
}

function comparatorKey(prefix: string | undefined, suffix: string | undefined) {
  return COMPARATOR_ALIASES[prefix ?? ""] ?? COMPARATOR_ALIASES[suffix ?? ""] ?? "";
}

function extractBoundaryFacts(
  text: string,
  facts: Map<string, RequirementSemanticFact>,
) {
  // Model labels may be English even when the confirmed requirement is Chinese.
  // Normalize common comparator phrases before extracting boundary facts so
  // downstream UML cannot silently weaken inclusive thresholds.
  const normalizedText = text
    .replace(/greater\s+than\s+or\s+equal\s+to|at\s+least/giu, ">=")
    .replace(/less\s+than\s+or\s+equal\s+to|at\s+most|no\s+more\s+than/giu, "<=")
    .replace(/greater\s+than|exceeds?|more\s+than/giu, ">")
    .replace(/less\s+than/giu, "<")
    .replace(/equal\s+to|exactly/giu, "=");
  const timePattern = /(不晚于|不早于|晚于|早于)\s*(\d{1,2}:\d{2})/gu;
  for (const match of normalizedText.matchAll(timePattern)) {
    const comparator =
      match[1] === "不晚于"
        ? "<="
        : match[1] === "不早于"
          ? ">="
          : comparatorKey(match[1], undefined);
    addFact(
      facts,
      "boundary",
      `${comparator}:${match[2]}:time`,
      `${match[1]}${match[2]}`,
    );
  }

  const numberPattern = new RegExp(
    `(不超过|最多|至多|小于等于|大于等于|不低于|不少于|至少|达到|超过|大于|低于|少于|小于|等于|恰好|正好|>=|<=|>|<|=)?\\s*(\\d+(?:\\.\\d+)?)\\s*(${NUMBER_UNIT_PATTERN})\\s*(以上|以内|以下)?`,
    "gu",
  );
  for (const match of normalizedText.matchAll(numberPattern)) {
    const comparator = comparatorKey(match[1], match[4]);
    const unit = compactSemanticText(match[3] ?? "");
    addFact(
      facts,
      "boundary",
      `${comparator}:${match[2]}:${unit}`,
      `${match[1] ?? ""}${match[2]}${unit}${match[4] ?? ""}`,
    );
  }
}

function extractLogicAndModalityFacts(
  text: string,
  facts: Map<string, RequirementSemanticFact>,
) {
  if (/或者|任一|或/u.test(text)) addFact(facts, "logic", "or", "或");
  if (/并且|同时|且/u.test(text)) addFact(facts, "logic", "and", "且");

  const modalityMatches = text.match(
    /不得|不能|禁止|只能|必须|应当|需要|不得回滚|不回滚/gu,
  );
  for (const modality of modalityMatches ?? []) {
    const normalized =
      modality === "不得回滚" || modality === "不回滚" ? "no-rollback" : modality;
    addFact(facts, "modality", normalized, modality);
  }
}

function extractEventFacts(
  text: string,
  facts: Map<string, RequirementSemanticFact>,
) {
  const segments = text
    .split(/[、，；。]|以及|并且|或者|和|或/gu)
    .map((item) => compactSemanticText(item))
    .filter(Boolean);
  for (const segment of segments) {
    const event =
      segment.match(
        /^(.{0,14}?(?:成功|失败|完成|审批|支付|发布|驳回)|取消)(?:时|后|前|则|$)/u,
      ) ??
      segment.match(/^(.{0,14}?提交)(?:时|后|前|则)/u);
    if (event?.[1]) addFact(facts, "event", event[1], event[1]);
  }
}

function extractTemporalFacts(
  text: string,
  facts: Map<string, RequirementSemanticFact>,
) {
  const temporalPattern =
    /(开始|结束|提交|取消|预约|审批|支付|发生|状态改变)(?:时间)?(前|后)\s*(\d+(?:\.\d+)?)\s*(毫秒|秒|分钟|小时|天|日|周|个月|月|年)/gu;
  for (const match of text.matchAll(temporalPattern)) {
    addFact(
      facts,
      "temporal",
      `${match[1]}:${match[2]}:${match[3]}:${match[4]}`,
      match[0],
    );
  }
}

function extractStatusFacts(
  text: string,
  facts: Map<string, RequirementSemanticFact>,
) {
  const statusPaths = text.match(
    /[\p{Script=Han}A-Za-z0-9_-]{1,16}(?:→|->)[\p{Script=Han}A-Za-z0-9_-]{1,16}/gu,
  );
  for (const statusPath of statusPaths ?? []) {
    addFact(facts, "status", statusPath.replace(/->/gu, "→"), statusPath);
  }
}

export function requirementSemanticCoreText(input: RequirementSemanticInput) {
  return [
    input.actor,
    input.subject,
    input.action,
    input.object,
    input.condition,
    input.outcome,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("；");
}

export function extractProtectedRequirementFacts(
  input: RequirementSemanticInput,
): RequirementSemanticFact[] {
  const text = requirementSemanticCoreText(input);
  const facts = new Map<string, RequirementSemanticFact>();
  if (input.actor) addFact(facts, "actor", input.actor, input.actor);
  if (input.object) addFact(facts, "object", input.object, input.object);
  extractBoundaryFacts(text, facts);
  extractLogicAndModalityFacts(text, facts);
  extractEventFacts(text, facts);
  extractTemporalFacts(text, facts);
  extractStatusFacts(text, facts);
  return Array.from(facts.values());
}

export function compareRequirementSemantics(
  before: RequirementSemanticInput,
  after: RequirementSemanticInput,
): RequirementSemanticDiff {
  const beforeFacts = extractProtectedRequirementFacts(before);
  const afterFacts = extractProtectedRequirementFacts(after);
  const beforeKeys = new Set(beforeFacts.map((fact) => fact.key));
  const afterKeys = new Set(afterFacts.map((fact) => fact.key));
  return {
    lostFacts: beforeFacts.filter((fact) => !afterKeys.has(fact.key)),
    addedFacts: afterFacts.filter((fact) => !beforeKeys.has(fact.key)),
  };
}

export function unsupportedRequirementFacts(
  sourceText: string,
  candidate: RequirementSemanticInput,
) {
  const sourceCarrier: RequirementSemanticInput = {
    actor: null,
    subject: null,
    action: sourceText,
    object: null,
    condition: null,
    outcome: null,
  };
  const sourceKeys = new Set(
    extractProtectedRequirementFacts(sourceCarrier).map((fact) => fact.key),
  );
  return extractProtectedRequirementFacts(candidate).filter(
    (fact) =>
      ["boundary", "logic", "modality", "event", "temporal", "status"].includes(
        fact.kind,
      ) && !sourceKeys.has(fact.key),
  );
}
