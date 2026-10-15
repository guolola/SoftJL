// Owns requirement text, rule editing, and rule version bookkeeping.
import {
  useCallback,
  useState,
  type SetStateAction,
} from "react";
import type { DiagramType } from "../../../entities/diagram/model";
import type { RequirementInputScreening } from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type {
  RequirementRulesUpdateMetadata,
  WorkspaceRepository,
} from "../../../services/workspace-repository";
import { requirementInputFingerprintFor } from "../lib/workspace-context";

type RequirementRuleCommitMetadata = Pick<
  RequirementRulesUpdateMetadata,
  | "requirementBaseline"
  | "requirementModelTraceability"
  | "requirementQualityReport"
  | "requirementReviewCandidates"
>;

export function ensureUniqueRequirementRuleIds(
  rules: RequirementRule[],
): RequirementRule[] {
  const usedRuleIds = new Set<string>();
  return rules.map((rule) => {
    const baseId = rule.id.trim() || "r";
    let candidate = baseId;
    let suffix = 2;
    while (usedRuleIds.has(candidate.toLowerCase())) {
      candidate = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedRuleIds.add(candidate.toLowerCase());
    return candidate === rule.id ? rule : { ...rule, id: candidate };
  });
}

export function useRequirementsSlice(repository: WorkspaceRepository) {
  const [requirementText, setRequirementTextRaw] = useState("");
  const [committedRequirementText, setCommittedRequirementText] = useState("");
  const [inputScreening, setInputScreening] = useState<RequirementInputScreening | null>(null);
  const [inputScreeningError, setInputScreeningError] = useState<string | null>(null);
  const [rules, setRulesRaw] = useState<RequirementRule[]>([]);
  const [textVersion, setTextVersion] = useState(0);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [rulesBasedOnTextVersion, setRulesBasedOnTextVersion] = useState<
    number | null
  >(null);
  const [requirementInputFingerprint, setRequirementInputFingerprint] = useState<
    string | null
  >(null);

  const setRules = useCallback(
    (value: SetStateAction<RequirementRule[]>) => {
      setRulesRaw((current) => {
        const nextRules = typeof value === "function" ? value(current) : value;
        return ensureUniqueRequirementRuleIds(nextRules);
      });
    },
    [],
  );

  const setRequirementText = useCallback(
    (value: string) => {
      setInputScreening(null);
      setInputScreeningError(null);
      setRequirementTextRaw((prev) => {
        if (prev !== value) {
          setTextVersion((current) => current + 1);
        }
        return value;
      });
    },
    [],
  );

  // The textarea is a draft; a successful rules run commits it with the rules.
  const flushRequirementTextSave = useCallback(async () => {}, []);

  const commitRequirementRules = useCallback(
    (
      nextRules: RequirementRule[],
      metadata: Partial<RequirementRuleCommitMetadata> = {},
    ) => {
      const uniqueRules = ensureUniqueRequirementRuleIds(nextRules);
      const nextRulesVersion = rulesVersion + 1;
      const nextRequirementInputFingerprint = requirementInputFingerprintFor(
        requirementText,
        uniqueRules,
      );
      setRules(uniqueRules);
      setRulesVersion(nextRulesVersion);
      setRulesBasedOnTextVersion(textVersion);
      setRequirementInputFingerprint(nextRequirementInputFingerprint);
      void repository.updateRequirementRules?.(uniqueRules, {
        requirementInputFingerprint: nextRequirementInputFingerprint,
        ...metadata,
        rulesBasedOnTextVersion: textVersion,
        rulesVersion: nextRulesVersion,
      });
    },
    [repository, requirementText, rulesVersion, textVersion],
  );

  const getNextRequirementRuleId = useCallback(() => {
    const used = new Set(rules.map((rule) => rule.id.toLowerCase()));
    const maxIndex = rules.reduce((max, rule) => {
      const match = /^r(\d+)$/i.exec(rule.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    let nextIndex = maxIndex + 1;
    while (used.has(`r${nextIndex}`)) {
      nextIndex += 1;
    }
    return `r${nextIndex}`;
  }, [rules]);

  const createRequirementRule = useCallback(
    (input: {
      category: RequirementRule["category"];
      text: string;
      relatedDiagrams: DiagramType[];
    },
    metadata?: Partial<RequirementRuleCommitMetadata>) => {
      const relatedDiagrams =
        input.relatedDiagrams.length > 0
          ? input.relatedDiagrams
          : (["usecase"] as DiagramType[]);
      commitRequirementRules([
        ...rules,
        {
          id: getNextRequirementRuleId(),
          category: input.category,
          text: input.text.trim() || "待填写需求项",
          relatedDiagrams,
        },
      ], metadata);
    },
    [commitRequirementRules, getNextRequirementRuleId, rules],
  );

  const addRequirementRule = useCallback((metadata?: Partial<RequirementRuleCommitMetadata>) => {
    createRequirementRule({
      category: "功能需求",
      text: "待填写需求项",
      relatedDiagrams: ["usecase", "activity"],
    }, metadata);
  }, [createRequirementRule]);

  const updateRequirementRule = useCallback(
    (
      id: string,
      patch: Partial<RequirementRule>,
      metadata?: Partial<RequirementRuleCommitMetadata>,
    ) => {
      commitRequirementRules(
        rules.map((rule) =>
          rule.id === id
            ? {
                ...rule,
                ...patch,
                relatedDiagrams:
                  patch.relatedDiagrams && patch.relatedDiagrams.length > 0
                    ? patch.relatedDiagrams
                    : (patch.relatedDiagrams ?? rule.relatedDiagrams),
              }
            : rule,
        ),
        metadata,
      );
    },
    [commitRequirementRules, rules],
  );

  const deleteRequirementRule = useCallback(
    (id: string, metadata?: Partial<RequirementRuleCommitMetadata>) => {
      commitRequirementRules(
        rules.filter((rule) => rule.id !== id),
        metadata,
      );
    },
    [commitRequirementRules, rules],
  );

  const clearRequirementRules = useCallback((metadata?: Partial<RequirementRuleCommitMetadata>) => {
    commitRequirementRules([], metadata);
  }, [commitRequirementRules]);

  const rulesForDiagram = useCallback(
    (diagram: DiagramType) =>
      rules.filter((rule) => rule.relatedDiagrams.includes(diagram)),
    [rules],
  );

  return {
    requirementText,
    committedRequirementText,
    setCommittedRequirementText,
    hasUncommittedRequirementDraft: requirementText !== committedRequirementText,
    inputScreening,
    setInputScreening,
    inputScreeningError,
    setInputScreeningError,
    setRequirementText,
    setRequirementTextRaw,
    rules,
    setRules,
    textVersion,
    setTextVersion,
    rulesVersion,
    setRulesVersion,
    rulesBasedOnTextVersion,
    setRulesBasedOnTextVersion,
    requirementInputFingerprint,
    setRequirementInputFingerprint,
    flushRequirementTextSave,
    commitRequirementRules,
    addRequirementRule,
    createRequirementRule,
    updateRequirementRule,
    deleteRequirementRule,
    clearRequirementRules,
    rulesForDiagram,
  };
}
