// Saves a complete versioned baseline with every manual rule mutation.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { createRequirementBaselineSnapshot, type RequirementBaseline, type RequirementQualityReport } from "@uml-platform/contracts";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { RequirementRuleCommitInput } from "../slices/requirements-slice";

interface RequirementRuleCreateInput {
  text: string;
  type: RequirementRule["type"];
}
interface RequirementRuleActionsInput {
  clearRequirementRulesBase: (metadata?: RequirementRuleCommitInput) => void;
  createRequirementRuleBase: (input: RequirementRuleCreateInput, metadata?: RequirementRuleCommitInput) => void;
  deleteRequirementRuleBase: (id: string, metadata?: RequirementRuleCommitInput) => void;
  requirementBaseline: RequirementBaseline | null;
  requirementText: string;
  rules: RequirementRule[];
  setRequirementBaseline: Dispatch<SetStateAction<RequirementBaseline | null>>;
  setRequirementQualityReport: Dispatch<SetStateAction<RequirementQualityReport | null>>;
  updateRequirementRuleBase: (id: string, patch: Partial<RequirementRule>, metadata?: RequirementRuleCommitInput) => void;
}
export function useRequirementRuleActions({
  clearRequirementRulesBase, createRequirementRuleBase, deleteRequirementRuleBase,
  requirementBaseline, requirementText, rules: previousRules, setRequirementBaseline, setRequirementQualityReport,
  updateRequirementRuleBase,
}: RequirementRuleActionsInput) {
  // Resolve after the slice assigns IDs and normalizes the actual saved rules.
  const snapshotRules = useCallback((rules: RequirementRule[]) => {
    const baseline = createRequirementBaselineSnapshot({
      runId: requirementBaseline?.runId ?? "manual-rules",
      requirementText,
      rules,
      previousBaseline: requirementBaseline,
      previousRules,
      origin: "manual",
    });
    setRequirementBaseline(baseline);
    setRequirementQualityReport(baseline.qualityReport);
    return { requirementBaseline: baseline, requirementQualityReport: baseline.qualityReport,  };
  }, [requirementBaseline, requirementText, previousRules, setRequirementBaseline, setRequirementQualityReport]);

  const createRequirementRule = useCallback((input: RequirementRuleCreateInput) => {
    createRequirementRuleBase(input, snapshotRules);
  }, [createRequirementRuleBase, snapshotRules]);
  const updateRequirementRule = useCallback((id: string, patch: Partial<RequirementRule>) => {
    updateRequirementRuleBase(id, patch, snapshotRules);
  }, [updateRequirementRuleBase, snapshotRules]);
  const deleteRequirementRule = useCallback((id: string) => {
    deleteRequirementRuleBase(id, snapshotRules);
  }, [deleteRequirementRuleBase, snapshotRules]);
  const clearRequirementRules = useCallback(() => {
    clearRequirementRulesBase(snapshotRules);
  }, [clearRequirementRulesBase, snapshotRules]);
  return { clearRequirementRules, createRequirementRule, deleteRequirementRule, updateRequirementRule };
}
