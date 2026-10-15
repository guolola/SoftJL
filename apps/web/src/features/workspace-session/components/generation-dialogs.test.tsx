// Verifies generation-scope ordering, dependency meaning, and confirmation actions in the shared flow.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider, LOCALE_PREFERENCE_STORAGE_KEY } from "../../../shared/i18n";
import { i18n } from "../../../shared/i18n/i18n";
import { GenerationConfirmationDialog, type GenerationConfirmationDialogState } from "./generation-dialogs";

function confirmation(overrides: Partial<GenerationConfirmationDialogState> = {}): GenerationConfirmationDialogState {
  return {
    title: "确认生成需求模型",
    description: "本次会追加或更新所选需求模型，已有模型会保留。",
    keptLabels: ["功能结构图", "总体业务流程"],
    regeneratedLabels: ["用例模型"],
    newLabels: ["领域概念模型"],
    dependencyLabels: [],
    resolve: vi.fn(),
    ...overrides,
  };
}

function renderDialog(value = confirmation(), onCancel = vi.fn(), onConfirm = vi.fn()) {
  return render(<AppI18nProvider><GenerationConfirmationDialog confirmation={value} onCancel={onCancel} onConfirm={onConfirm} /></AppI18nProvider>);
}

describe("generation confirmation flow", () => {
  it("reviews kept, updated, and new models in order with distinct semantic icons", () => {
    renderDialog();
    const flow = screen.getByRole("list", { name: "模型生成范围" });
    const rows = within(flow).getAllByRole("listitem");
    expect(rows.map(row => within(row).getByRole("heading").textContent)).toEqual(["保留不变", "更新", "新增"]);
    expect(rows.map(row => row.dataset.flowTone)).toEqual(["success", "warning", "info"]);
    expect(rows[0]).toHaveTextContent("功能结构图、总体业务流程");
    expect(rows[1]).toHaveTextContent("用例模型");
    expect(rows[2]).toHaveTextContent("领域概念模型");
    expect(rows[0].querySelector("svg")).toHaveClass("lucide-circle-check");
    expect(rows[1].querySelector("svg")).toHaveClass("lucide-triangle-alert");
    expect(rows[2].querySelector("svg")).toHaveClass("lucide-circle-alert");
    expect(within(rows[1]).getByText("用例模型")).toHaveClass("font-semibold", "text-foreground");
  });

  it.each([
    { keptLabels: ["保留模型"], regeneratedLabels: [], newLabels: [], headings: ["保留不变"] },
    { keptLabels: [], regeneratedLabels: ["更新模型"], newLabels: [], headings: ["更新"] },
    { keptLabels: [], regeneratedLabels: [], newLabels: ["新增模型"], headings: ["新增"] },
  ])("omits empty categories for $headings", ({ headings, ...labels }) => {
    renderDialog(confirmation(labels));
    const flow = screen.getByRole("list", { name: "模型生成范围" });
    expect(within(flow).getAllByRole("heading").map(heading => heading.textContent)).toEqual(headings);
  });

  it("keeps upstream dependencies separate from the model-generation categories", () => {
    renderDialog(confirmation({
      title: "确认生成设计模型",
      ruleDependencyLabels: ["规则映射"],
      requirementDependencyLabels: ["上游用例模型"],
      dependencyLabels: ["上游设计类图"],
    }));
    const flow = screen.getByRole("list", { name: "模型生成范围" });
    for (const label of ["规则映射", "上游用例模型", "上游设计类图"]) {
      expect(screen.getByText(label)).toBeVisible();
      expect(within(flow).queryByText(label)).not.toBeInTheDocument();
    }
    for (const label of ["需求规则补齐", "需求模型补齐 / 更新", "设计依赖补齐"]) expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByText("本次没有需要生成的模型。")).not.toBeInTheDocument();
  });

  it("shows a plain no-work message when there are no generation targets", () => {
    renderDialog(confirmation({ keptLabels: [], regeneratedLabels: [], newLabels: [] }));
    expect(screen.queryByRole("list", { name: "模型生成范围" })).not.toBeInTheDocument();
    expect(screen.getByText("本次没有需要生成的模型。")).toBeVisible();
  });

  it("keeps long model lists complete instead of truncating the generation scope", () => {
    const labels = Array.from({ length: 80 }, (_, index) => `模型 ${index + 1}：${"订单、库存与配送协作".repeat(8)}`);
    renderDialog(confirmation({ newLabels: labels }));
    const added = screen.getByRole("list", { name: "模型生成范围" }).querySelector('[data-generation-category="added"]')!;
    expect(added.querySelector("p")?.textContent).toBe(labels.join("、"));
  });

  it("localizes the flow headings and accessible label in English", async () => {
    const preference = localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY);
    localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, "en");
    await i18n.changeLanguage("en");
    try {
      renderDialog();
      const flow = screen.getByRole("list", { name: "Model generation scope" });
      expect(within(flow).getAllByRole("heading").map(heading => heading.textContent)).toEqual(["Kept unchanged", "Updated", "New"]);
    } finally {
      if (preference === null) localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
      else localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, preference);
      await i18n.changeLanguage("zh-CN");
    }
  });

  it("preserves confirm, cancel, and Escape actions", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    renderDialog(confirmation(), onCancel, onConfirm);
    fireEvent.click(screen.getByRole("button", { name: "确认生成" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await userEvent.setup().keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
