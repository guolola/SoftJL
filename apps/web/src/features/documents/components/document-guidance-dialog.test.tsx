// Verifies document guidance reuses shared feedback presentation without nested cards.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n";
import type { FeedbackDialogState } from "../../../shared/ui/feedback-dialog";
import { DocumentGuidanceDialog } from "./document-guidance-dialog";

const prerequisite: FeedbackDialogState = {
  dedupeKey: "requirements-prerequisite",
  tone: "warning",
  title: "需求规格说明书暂时无法生成",
  message: "请先在需求模型页生成需求模型",
};

function renderGuidance(notices: FeedbackDialogState[]) {
  return render(<AppI18nProvider><DocumentGuidanceDialog notices={notices} /></AppI18nProvider>);
}

describe("document guidance", () => {
  it("hides the entry when no guidance is needed", () => {
    renderGuidance([]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows prerequisites as plain list items inside the shared feedback dialog", async () => {
    const user = userEvent.setup();
    renderGuidance([prerequisite]);
    const entry = screen.getByRole("button", { name: "有 1 项需要处理" });
    expect(entry).toHaveClass("h-8", "text-warning");
    await user.click(entry);

    const dialog = screen.getByRole("dialog", { name: "有 1 项需要处理" });
    expect(dialog).toHaveAttribute("data-testid", "feedback-dialog");
    expect(within(dialog).getByLabelText("需要处理")).toHaveAttribute("data-feedback-tone", "warning");
    expect(dialog).toHaveTextContent("查看说明书的生成条件和需要处理的问题。");
    const item = within(dialog).getByRole("listitem");
    expect(item).toHaveTextContent(prerequisite.title);
    expect(item).toHaveTextContent(prerequisite.message);
    expect(item).not.toHaveClass("border", "rounded-lg", "bg-card", "shadow-sm");
    expect(item.parentElement?.parentElement).toHaveAttribute("data-slot", "feedback-details");

    await user.click(within(dialog).getByRole("button", { name: "我知道了" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(entry);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses the failure tone and closes the overview when retrying", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    renderGuidance([prerequisite, {
      dedupeKey: "list-error",
      tone: "destructive",
      title: "说明书暂时无法读取",
      message: "请重试读取说明书。",
      primaryAction: { label: "重试", onSelect: retry },
    }]);
    const entry = screen.getByRole("button", { name: "有 2 项需要处理" });
    expect(entry).toHaveClass("text-destructive");
    await user.click(entry);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("操作失败")).toHaveAttribute("data-feedback-tone", "destructive");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
    await user.click(within(dialog).getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
