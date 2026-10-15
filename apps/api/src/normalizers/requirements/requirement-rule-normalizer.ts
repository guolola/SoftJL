// Normalizes extracted requirement rules before validating the public contract.
import {
  extractProtectedRequirementFacts,
  requirementRulesResultSchema,
  type DiagramKind,
  type RequirementRule,
  type RequirementRulesResult,
  type RuleCategory,
} from "@uml-platform/contracts";
import {
  isPlainRecord,
  normalizeStringArray,
} from "../json/parse-json.js";

const RULE_CATEGORIES: readonly RuleCategory[] = [
  "业务规则",
  "功能需求",
  "外部接口",
  "界面需求",
  "数据需求",
  "非功能需求",
  "部署需求",
  "异常处理",
];

const DIAGRAM_KINDS: readonly DiagramKind[] = [
  "function",
  "activity",
  "usecase",
  "class",
  "prototype",
  "deployment",
  "analysis",
];

const RULE_CATEGORY_SET = new Set<string>(RULE_CATEGORIES);
const DIAGRAM_KIND_SET = new Set<string>(DIAGRAM_KINDS);

function normalizeLabel(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-（）()【】[\]{}:：/\\|,，.。;；]+/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function categoryFromAlias(value: unknown): RuleCategory | null {
  const text = normalizeText(value);
  if (RULE_CATEGORY_SET.has(text)) return text as RuleCategory;

  const label = normalizeLabel(text);
  if (!label) return null;
  if (
    [
      "安全需求",
      "性能需求",
      "可用性需求",
      "可靠性需求",
      "并发需求",
      "响应需求",
      "响应时间需求",
      "稳定性需求",
      "缓存需求",
      "加密需求",
      "非功能",
      "nonfunctional",
      "nfr",
    ].includes(label)
  ) {
    return "非功能需求";
  }
  if (["接口需求", "外部系统", "外部服务", "第三方接口", "api接口"].includes(label)) {
    return "外部接口";
  }
  if (["页面需求", "ui需求", "交互需求", "用户界面"].includes(label)) {
    return "界面需求";
  }
  if (["数据模型", "数据结构", "存储需求", "数据库需求"].includes(label)) {
    return "数据需求";
  }
  if (["部署", "运维需求", "运行环境", "环境需求"].includes(label)) {
    return "部署需求";
  }
  if (["异常", "错误处理", "异常需求", "容错需求"].includes(label)) {
    return "异常处理";
  }
  if (["业务", "业务约束", "业务规则"].includes(label)) {
    return "业务规则";
  }
  if (["功能", "功能点", "functional"].includes(label)) {
    return "功能需求";
  }
  return null;
}

function inferCategory(ruleText: string): RuleCategory {
  if (/接口|api|第三方|微信授权|OAuth|openid/i.test(ruleText)) return "外部接口";
  if (/页面|界面|按钮|颜色|网格|展示|布局|交互/.test(ruleText)) return "界面需求";
  if (/数据|记录|状态|缓存|存储|同步|座位|预约/.test(ruleText)) return "数据需求";
  if (/部署|服务器|环境|定时任务|加密|传输|安全|性能|并发|可用性|可靠性|稳定|响应|加载|缓存/.test(ruleText)) {
    return "非功能需求";
  }
  if (/异常|失败|违约|超时|取消|释放|非法|恶意/.test(ruleText)) return "异常处理";
  return "功能需求";
}

function diagramFromAlias(value: unknown): DiagramKind | null {
  const text = normalizeText(value);
  if (DIAGRAM_KIND_SET.has(text)) return text as DiagramKind;

  const label = normalizeLabel(text);
  if (["function", "wbs", "mindmap", "思维导图", "脑图", "功能", "功能结构", "功能结构图", "功能分解", "功能分解图"].includes(label)) {
    return "function";
  }
  if (["usecase", "usecases", "用例", "用例图"].includes(label)) return "usecase";
  if (["class", "classes", "类", "类图", "领域模型", "数据模型"].includes(label)) return "class";
  if (["activity", "activities", "活动", "活动图", "流程", "流程图", "业务流程", "总体业务流程"].includes(label)) {
    return "activity";
  }
  if (["deployment", "deploy", "部署", "部署图", "架构图", "运行环境"].includes(label)) {
    return "deployment";
  }
  if (["prototype", "原型", "界面关系", "原型界面关系", "页面关系", "ui关系"].includes(label)) {
    return "prototype";
  }
  if (["analysis", "需求分析", "需求分析模型", "分析模型", "分析顺序图"].includes(label)) {
    return "analysis";
  }
  return null;
}

function inferRelatedDiagrams(ruleText: string, category: RuleCategory): DiagramKind[] {
  const inferred: DiagramKind[] = [];
  const add = (kind: DiagramKind) => {
    if (!inferred.includes(kind)) inferred.push(kind);
  };

  if (
    category === "功能需求" ||
    /功能|流程|登录|授权|预约|签到|查询|管理|查看|选择|提交|取消|刷新/.test(ruleText)
  ) {
    add("function");
    add("usecase");
    add("activity");
    add("analysis");
  }
  if (
    category === "数据需求" ||
    /座位状态|预约记录|用户身份|用户信息|缓存|数据|记录|状态|时间段/.test(ruleText)
  ) {
    add("class");
  }
  if (
    category === "非功能需求" ||
    category === "部署需求" ||
    /性能|安全|可靠|可用|并发|定时任务|加密|部署|服务器|响应|加载|缓存|同步/.test(ruleText)
  ) {
    add("deployment");
  }
  if (category === "外部接口") {
    add("usecase");
    add("deployment");
  }
  if (category === "界面需求") {
    add("usecase");
    add("prototype");
  }
  if (category === "异常处理") {
    add("activity");
    add("analysis");
    add("usecase");
  }

  return inferred.length > 0 ? inferred : ["usecase"];
}

function diagramAllowedForCategory(diagram: DiagramKind, category: RuleCategory) {
  if (diagram !== "function") return true;
  return category === "功能需求" || category === "业务规则";
}

function normalizeRelatedDiagrams(value: unknown, ruleText: string, category: RuleCategory) {
  const diagrams = normalizeStringArray(value).flatMap((item) => {
    const normalized = diagramFromAlias(item);
    return normalized ? [normalized] : [];
  });
  const unique = diagrams
    .filter((item, index) => diagrams.indexOf(item) === index)
    .filter((diagram) => diagramAllowedForCategory(diagram, category));
  if (unique.length > 0) return unique;
  return inferRelatedDiagrams(ruleText, category).filter((diagram) =>
    diagramAllowedForCategory(diagram, category),
  );
}

function normalizeRule(rawRule: unknown, index: number): RequirementRule | null {
  if (!isPlainRecord(rawRule)) return null;

  const text = normalizeText(rawRule.text ?? rawRule.requirement ?? rawRule.description);
  if (!text) return null;
  const rawSourceFragment = normalizeText(
    rawRule.sourceFragment ?? rawRule.source ?? rawRule.fragment,
  );
  const labeledSourceText = rawSourceFragment.match(
    /^\s*\[(?:R|AC|CONFIRMED)-[A-Z0-9_-]+\]\s*(.+)$/iu,
  )?.[1];
  const sourceFragment =
    rawSourceFragment &&
    (!labeledSourceText || ruleTextCoversSourceText(text, labeledSourceText))
      ? rawSourceFragment
      : "";

  const category = categoryFromAlias(rawRule.category) ?? inferCategory(text);
  return {
    id: normalizeText(rawRule.id) || `r${index + 1}`,
    category,
    text,
    ...(sourceFragment ? { sourceFragment } : {}),
    relatedDiagrams: normalizeRelatedDiagrams(rawRule.relatedDiagrams, text, category),
  };
}

function uniqueRequirementRuleId(id: string, usedIds: Set<string>) {
  const baseId = id || "r";
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate.toLowerCase())) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate.toLowerCase());
  return candidate;
}

function semanticFactKeys(text: string) {
  return new Set(
    extractProtectedRequirementFacts({
      actor: null,
      subject: null,
      action: text,
      object: null,
      condition: null,
      outcome: null,
    }).map((fact) => fact.key),
  );
}

function compactRuleText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function distinctiveHanBigrams(text: string) {
  const stop = new Set(["必须", "系统", "可以", "不得", "不能", "需求", "满足", "验证"]);
  const grams = new Set<string>();
  for (const match of text.matchAll(/\p{Script=Han}{2,}/gu)) {
    for (let index = 0; index < match[0].length - 1; index += 1) {
      const gram = match[0].slice(index, index + 2);
      if (!stop.has(gram)) grams.add(gram);
    }
  }
  return grams;
}

function extractedRuleCoversSource(
  rule: RequirementRule,
  sourceText: string,
) {
  return ruleTextCoversSourceText(rule.text, sourceText);
}

function ruleTextCoversSourceText(ruleText: string, sourceText: string) {
  const expectedFacts = semanticFactKeys(sourceText);
  const actualFacts = semanticFactKeys(ruleText);
  const expectedBigrams = distinctiveHanBigrams(sourceText);
  const actualBigrams = distinctiveHanBigrams(ruleText);
  const lexicalOverlap = Array.from(expectedBigrams).filter((gram) =>
    actualBigrams.has(gram),
  ).length;
  if (
    expectedFacts.size > 0 &&
    Array.from(expectedFacts).every((fact) => actualFacts.has(fact)) &&
    lexicalOverlap >= 2
  ) {
    return true;
  }
  const expectedText = compactRuleText(sourceText);
  const actualText = compactRuleText(ruleText);
  return Boolean(
    expectedText &&
      actualText &&
      actualText.includes(expectedText),
  );
}

function preferredRuleIdFromSourceLabel(sourceLabel: string) {
  const match = sourceLabel.match(/^(?:R|CONFIRMED)-[A-Z_-]*?0*(\d+)$/iu);
  return match ? `r${Number(match[1])}` : sourceLabel.toLowerCase();
}

export function mergeConfirmedLabeledRequirementRules(
  rules: RequirementRule[],
  requirementText: string,
) {
  const usedIds = new Set(rules.map((rule) => rule.id.toLowerCase()));
  const merged = [...rules];
  const labeledLine =
    /^\s*\[((?:R|AC|CONFIRMED)-[A-Z0-9_-]+)\]\s*(.+?)\s*$/gimu;

  for (const match of requirementText.matchAll(labeledLine)) {
    const sourceLabel = match[1];
    const text = match[2]?.trim();
    if (!text) {
      continue;
    }
    const coveredIndex = merged.findIndex((rule) =>
      extractedRuleCoversSource(rule, text),
    );
    if (coveredIndex >= 0) {
      const covered = merged[coveredIndex]!;
      merged[coveredIndex] = {
        ...covered,
        sourceFragment: `[${sourceLabel}] ${text}`,
      };
      continue;
    }
    const category = inferCategory(text);
    merged.push({
      id: uniqueRequirementRuleId(
        preferredRuleIdFromSourceLabel(sourceLabel),
        usedIds,
      ),
      category,
      text,
      sourceFragment: `[${sourceLabel}] ${text}`,
      relatedDiagrams: inferRelatedDiagrams(text, category).filter((diagram) =>
        diagramAllowedForCategory(diagram, category),
      ),
    });
  }

  return merged;
}

export function normalizeRequirementRulesResult(
  raw: unknown,
  requirementText = "",
): RequirementRulesResult {
  const sourceRules = Array.isArray(raw)
    ? raw
    : isPlainRecord(raw) && Array.isArray(raw.rules)
      ? raw.rules
      : null;
  if (!sourceRules) {
    return requirementRulesResultSchema.parse(raw);
  }
  const usedRuleIds = new Set<string>();
  const rules = sourceRules.flatMap((rule, index) => {
    const normalized = normalizeRule(rule, index);
    return normalized
      ? [{ ...normalized, id: uniqueRequirementRuleId(normalized.id, usedRuleIds) }]
      : [];
  });
  return requirementRulesResultSchema.parse({
    rules: requirementText
      ? mergeConfirmedLabeledRequirementRules(rules, requirementText)
      : rules,
  });
}
