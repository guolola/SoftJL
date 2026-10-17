// Saves a complete versioned baseline with every manual rule mutation.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { createRequirementBaselineSnapshot, type RequirementBaseline, type RequirementQualityReport } from "@uml-platform/contracts";
import type { DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRecord } from "../../../entities/workspace/model";
import type { RequirementRuleCommitInput } from "../slices/requirements-slice";

interface RequirementRuleCreateInput {
  category: RequirementRule["category"];
  relatedDiagrams: DiagramType[];
  text: string;
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
  setRequirementReviewCandidates: Dispatch<SetStateAction<WorkspaceRecord["requirementReviewCandidates"]>>;
  updateRequirementRuleBase: (id: string, patch: Partial<RequirementRule>, metadata?: RequirementRuleCommitInput) => void;
}
export function useRequirementRuleActions({
  clearRequirementRulesBase, createRequirementRuleBase, deleteRequirementRuleBase,
  requirementBaseline, requirementText, rules: previousRules, setRequirementBaseline, setRequirementQualityReport,
  setRequirementReviewCandidates, updateRequirementRuleBase,
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
    setRequirementReviewCandidates({});
    return { requirementBaseline: baseline, requirementQualityReport: baseline.qualityReport, requirementReviewCandidates: {} };
  }, [requirementBaseline, requirementText, previousRules, setRequirementBaseline, setRequirementQualityReport, setRequirementReviewCandidates]);

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
