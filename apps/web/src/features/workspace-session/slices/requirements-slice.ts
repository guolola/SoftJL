// Owns requirement text, rule editing, and rule version bookkeeping.
import {
  useCallback,
  useState,
  type SetStateAction,
} from "react";
import type { RequirementInputScreening } from "@uml-platform/contracts";
import { snapshotInputFingerprint } from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type {
  RequirementRulesUpdateMetadata,
  WorkspaceRepository,
} from "../../../services/workspace-repository/index";
import { requirementInputFingerprintFor } from "../lib/workspace-context";

type RequirementRuleCommitMetadata = Pick<
  RequirementRulesUpdateMetadata,
  | "requirementBaseline"
  | "requirementModelTraceability"
>;

export type RequirementRuleCommitInput = Partial<RequirementRuleCommitMetadata> |
  ((rules: RequirementRule[]) => Partial<RequirementRuleCommitMetadata>);

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

  const commitRequirementRules = useCallback(
    (
      nextRules: RequirementRule[],
      metadata: RequirementRuleCommitInput = {},
    ) => {
      const uniqueRules = ensureUniqueRequirementRuleIds(nextRules);
      if (snapshotInputFingerprint(uniqueRules) === snapshotInputFingerprint(rules)) return;
      const resolvedMetadata = typeof metadata === "function" ? metadata(uniqueRules) : metadata;
      const nextRulesVersion = rulesVersion + 1;
      const nextRequirementInputFingerprint = requirementInputFingerprintFor(
        committedRequirementText,
        uniqueRules,
      );
      setRules(uniqueRules);
      setRulesVersion(nextRulesVersion);
      setRulesBasedOnTextVersion(textVersion);
      setRequirementInputFingerprint(nextRequirementInputFingerprint);
      void repository.updateRequirementRules?.(uniqueRules, {
        requirementInputFingerprint: nextRequirementInputFingerprint,
        ...resolvedMetadata,
        rulesBasedOnTextVersion: textVersion,
        rulesVersion: nextRulesVersion,
      });
    },
    [rules, rulesVersion, committedRequirementText, setRules, textVersion, repository],
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
      text: string;
      type: RequirementRule["type"];
    },
    metadata?: RequirementRuleCommitInput) => {
      commitRequirementRules([
        ...rules,
        {
          id: getNextRequirementRuleId(),
          type: input.type,
          text: input.text.trim() || "待填写需求项",
        },
      ], metadata);
    },
    [commitRequirementRules, getNextRequirementRuleId, rules],
  );

  const addRequirementRule = useCallback((metadata?: RequirementRuleCommitInput) => {
    createRequirementRule({
      type: "functional",
      text: "待填写需求项",

    }, metadata);
  }, [createRequirementRule]);

  const updateRequirementRule = useCallback(
    (
      id: string,
      patch: Partial<RequirementRule>,
      metadata?: RequirementRuleCommitInput,
    ) => {
      commitRequirementRules(
        rules.map((rule) =>
          rule.id === id
            ? {
                ...rule,
                ...patch,
              }
            : rule,
        ),
        metadata,
      );
    },
    [commitRequirementRules, rules],
  );

  const deleteRequirementRule = useCallback(
    (id: string, metadata?: RequirementRuleCommitInput) => {
      commitRequirementRules(
        rules.filter((rule) => rule.id !== id),
        metadata,
      );
    },
    [commitRequirementRules, rules],
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
    commitRequirementRules,
    addRequirementRule,
    createRequirementRule,
    updateRequirementRule,
    deleteRequirementRule,
  };
}
