// Exercises manual rule edits through the real slice and baseline persistence hook.
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createRequirementBaselineSnapshot, type RequirementBaseline, type RequirementRule } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import { useRequirementsSlice } from "../slices/requirements-slice";
import { useRequirementRuleActions } from "./requirement-review-actions";

const rule: RequirementRule = { id: "r1", type: "functional" as const, text: "学生可以查询成绩。",  };

describe("manual requirement baseline snapshots", () => {
  it("persists complete new versions for add/edit/delete and skips an unchanged save", () => {
    const save = vi.fn(async () => {});
    const repository = { updateRequirementRules: save } as unknown as WorkspaceRepository;
    const initial = createRequirementBaselineSnapshot({ runId: "source-run", requirementText: "成绩系统", rules: [rule] });
    const { result } = renderHook(() => {
      const slice = useRequirementsSlice(repository);
      const [baseline, setBaseline] = useState<RequirementBaseline | null>(initial);
      const actions = useRequirementRuleActions({

        createRequirementRuleBase: slice.createRequirementRule,
        deleteRequirementRuleBase: slice.deleteRequirementRule,
        updateRequirementRuleBase: slice.updateRequirementRule,
        requirementBaseline: baseline,
        requirementText: slice.requirementText,
        rules: slice.rules,
        setRequirementBaseline: setBaseline,

      });
      return { ...slice, ...actions, baseline };
    });
    act(() => { result.current.setRules([rule]); result.current.setRequirementTextRaw("成绩系统"); });
    act(() => result.current.createRequirementRule({ type: "functional" as const, text: "管理员可以导出成绩。",  }));
    const added = result.current.baseline!;
    expect(added.version).toBe(2);
    expect(added.rules).toHaveLength(2);
    expect(added.rules.every(entry => !("origin" in entry))).toBe(true);
    expect(save).toHaveBeenLastCalledWith(result.current.rules, expect.objectContaining({ requirementBaseline: added }));
    act(() => result.current.updateRequirementRule("r1", { text: "学生只能查询自己的成绩。" }));
    const edited = result.current.baseline!;
    expect(edited.version).toBe(3);
    expect(edited.rules?.[0]).toMatchObject({ text: "学生只能查询自己的成绩。", requirementId: initial.rules![0]!.requirementId });
    expect(edited.rules?.[1]).toEqual(added.rules?.[1]);
    expect(initial.rules?.[0]?.text).toBe(rule.text);
    save.mockClear();
    act(() => result.current.updateRequirementRule("r1", { text: "学生只能查询自己的成绩。" }));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.baseline).toBe(edited);
    act(() => result.current.deleteRequirementRule("r1"));
    expect(result.current.baseline?.version).toBe(4);
    expect(result.current.baseline?.rules).toEqual([added.rules![1]]);
    act(() => { for (const rule of result.current.rules) result.current.deleteRequirementRule(rule.id); });
    expect(result.current.baseline?.rules).toEqual([]);
    expect(result.current.baseline?.version).toBe(5);
  });
});
