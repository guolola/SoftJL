// Coordinates auto-completed rule mapping merges with session state and repository persistence.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { DiagramType } from "../../../entities/diagram/model";
import type { RequirementRule } from "../../../entities/requirement-rule/model";
import type { WorkspaceRunSnapshot } from "../../../entities/workspace/model";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import type { RequirementAutoUpstreamPlan } from "./generation-planning";
import {
  ensureAutoCompletedRuleMappings,
  mergeAutoCompletedRuleMappings,
} from "./generation-planning";
import { requirementInputFingerprintFor } from "./workspace-context";
import { localizeCaughtFailure } from "../../../shared/i18n/api-errors";

type LatestRuleInputRef = {
  current: {
    rules: RequirementRule[];
  };
};

interface ResolveAutoCompletedRuleMappingInput {
  ruleMappingDiagrams: DiagramType[];
  rulesRunMode: RequirementAutoUpstreamPlan["rulesRunMode"];
  rulesSnapshot: WorkspaceRunSnapshot | null;
}

interface AutoCompletedRuleMappingActionsInput {
  latestInputRef: LatestRuleInputRef;
  repository: WorkspaceRepository;
  requirementText: string;
  rules: RequirementRule[];
  setRequirementInputFingerprint: Dispatch<SetStateAction<string | null>>;
  setRules: Dispatch<SetStateAction<RequirementRule[]>>;
  setRulesBasedOnTextVersion: Dispatch<SetStateAction<number | null>>;
  setRulesVersion: Dispatch<SetStateAction<number>>;
  rulesVersion: number;
  textVersion: number;
}

export function useAutoCompletedRuleMappingActions({
  latestInputRef,
  repository,
  requirementText,
  rules,
  setRequirementInputFingerprint,
  setRules,
  setRulesBasedOnTextVersion,
  setRulesVersion,
  rulesVersion,
  textVersion,
}: AutoCompletedRuleMappingActionsInput) {
  const resolveAutoCompletedRulesForRun = useCallback(
    async ({
      ruleMappingDiagrams,
      rulesRunMode,
      rulesSnapshot,
    }: ResolveAutoCompletedRuleMappingInput) => {
      const rulesForRun =
        rulesSnapshot && rulesRunMode === "merge"
          ? ensureAutoCompletedRuleMappings(
              mergeAutoCompletedRuleMappings(rules, rulesSnapshot.rules),
              ruleMappingDiagrams,
            )
          : (rulesSnapshot?.rules ?? rules);

      if (rulesSnapshot && rulesRunMode === "merge") {
        const nextRulesVersion = rulesVersion + 1;
        const nextRequirementInputFingerprint =
          requirementInputFingerprintFor(requirementText, rulesForRun);
        try {
          await repository.updateRequirementRules?.(rulesForRun, {
            requirementInputFingerprint: nextRequirementInputFingerprint,
            rulesBasedOnTextVersion: textVersion,
            rulesVersion: nextRulesVersion,
          });
        } catch (error) {
          const detail = localizeCaughtFailure(
            error,
            "保存项目工作台失败，请检查网络后重试。",
          );
          throw new Error(
            `需求规则映射保存失败，已阻止下游生成。${detail}`,
          );
        }
        setRules(rulesForRun);
        setRulesVersion(nextRulesVersion);
        setRulesBasedOnTextVersion(textVersion);
        setRequirementInputFingerprint(nextRequirementInputFingerprint);
        latestInputRef.current = {
          ...latestInputRef.current,
          rules: rulesForRun,
        };
      }

      return {
        reviewedRuleIds:
          rulesRunMode === "replace"
            ? (rulesSnapshot?.rules.map((rule) => rule.id) ?? [])
            : [],
        rulesForRun,
      };
    },
    [
      latestInputRef,
      repository,
      requirementText,
      rules,
      rulesVersion,
      setRequirementInputFingerprint,
      setRules,
      setRulesBasedOnTextVersion,
      setRulesVersion,
      textVersion,
    ],
  );

  return { resolveAutoCompletedRulesForRun };
}
