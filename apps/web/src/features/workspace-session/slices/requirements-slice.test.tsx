// Covers requirement slice behavior independently from WorkspaceSessionProvider.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepository } from "../../../services/workspace-repository/index";
import { requirementInputFingerprintFor } from "../lib/workspace-context";
import { useRequirementsSlice } from "./requirements-slice";

function createRepository(): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(),

    updateRequirementRules: vi.fn(),
    startRun: vi.fn(),
    subscribeToRun: vi.fn(),
    getRunSnapshot: vi.fn(),


    saveRunHistory: vi.fn(),
    listRunHistory: vi.fn(),
    deleteRunHistory: vi.fn(),

  };
}

describe("useRequirementsSlice", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks text edits as a draft without persisting them", () => {
    vi.useFakeTimers();
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => result.current.setRequirementText("新的需求"));

    expect(result.current.requirementText).toBe("新的需求");
    expect(result.current.textVersion).toBe(1);


    act(() => vi.advanceTimersByTime(500));

    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    act(() => result.current.setCommittedRequirementText("新的需求"));
    expect(result.current.hasUncommittedRequirementDraft).toBe(false);
  });

  it("keeps only the latest rapid edit in the draft", () => {
    vi.useFakeTimers();
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => {
      result.current.setRequirementText("此");
      result.current.setRequirementText("此日历");
      result.current.setRequirementText("此日历仅供公众使用");
      vi.advanceTimersByTime(500);
    });

    expect(result.current.requirementText).toBe("此日历仅供公众使用");

  });


  it("creates and updates requirement rules with stable ids", () => {
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => {
      result.current.createRequirementRule({
        type: "functional" as const,
        text: "登录",

      });
    });

    expect(result.current.rules).toMatchObject([
      { id: "r1", text: "登录",  },
    ]);

    act(() => {
      result.current.updateRequirementRule("r1", {

      });
    });

    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rulesVersion).toBe(1);
    expect(repository.updateRequirementRules).toHaveBeenCalledTimes(1);

    act(() => result.current.updateRequirementRule("r1", { type: "data" as const }));
    expect(result.current.rules).toHaveLength(1);
    expect(result.current.rules[0]!.type).toBe("data");
    expect(result.current.rules).toHaveLength(1);
    const updatedRules = result.current.rules;
    const updatedFingerprint = requirementInputFingerprintFor("", updatedRules);
    expect(result.current.requirementInputFingerprint).toBe(updatedFingerprint);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      updatedRules,
      expect.objectContaining({
        requirementInputFingerprint: updatedFingerprint,
        rulesBasedOnTextVersion: 0,
        rulesVersion: 2,
      }),
    );

    act(() => {
      for (const rule of result.current.rules) result.current.deleteRequirementRule(rule.id);
    });

    expect(result.current.rules).toEqual([]);
    const clearedFingerprint = requirementInputFingerprintFor("", []);
    expect(result.current.requirementInputFingerprint).toBe(clearedFingerprint);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({
        requirementInputFingerprint: clearedFingerprint,
        rulesBasedOnTextVersion: 0,
        rulesVersion: 3,
      }),
    );
  });

  it("normalizes duplicate rule ids before persisting and editing rules", () => {
    const repository = createRepository();
    const { result } = renderHook(() => useRequirementsSlice(repository));

    act(() => {
      result.current.commitRequirementRules([
        {
          id: "r1",
          type: "functional" as const,
          text: "读者可以检索图书。",

        },
        {
          id: "R1",
          type: "data" as const,
          text: "系统需要记录图书库存。",

        },
      ]);
    });

    expect(result.current.rules.map((rule) => rule.id)).toEqual(["r1", "R1-2"]);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "r1" }),
        expect.objectContaining({ id: "R1-2" }),
      ]),
      expect.objectContaining({ rulesVersion: 1 }),
    );

    act(() => result.current.deleteRequirementRule("R1-2"));

    expect(result.current.rules.map((rule) => rule.id)).toEqual(["r1"]);
    expect(repository.updateRequirementRules).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: "r1" })],
      expect.objectContaining({ rulesVersion: 2 }),
    );
  });
});
