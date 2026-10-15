// Verifies the shared actionable-feedback dialog semantics, actions, and state deduplication.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppI18nProvider } from "../i18n";
import {
  FeedbackDialog,
  FeedbackDialogProvider,
  FeedbackReopenButton,
  useFeedbackDialog,
  type FeedbackDialogState,
} from "./feedback-dialog";

const warningFeedback: FeedbackDialogState = {
  dedupeKey: "test-warning",
  revision: 1,
  tone: "warning",
  title: "需要先处理依赖",
  message: "上游模型尚未完成。",
};

function withI18n(children: React.ReactNode) {
  return <AppI18nProvider>{children}</AppI18nProvider>;
}

function FeedbackHarness() {
  const { openFeedback, openFeedbackOnce } = useFeedbackDialog();
  return (
    <>
      <button type="button" onClick={() => openFeedback(warningFeedback)}>
        用户操作
      </button>
      <button
        type="button"
        onClick={() =>
          openFeedbackOnce(warningFeedback)
        }
      >
        自动提醒
      </button>
      <button
        type="button"
        onClick={() =>
          openFeedbackOnce({
            ...warningFeedback,
            revision: 2,
            title: "新版本问题",
          })
        }
      >
        自动提醒新版本
      </button>
      <button
        type="button"
        onClick={() => {
          openFeedback({ ...warningFeedback, title: "队列第一项" });
          openFeedback({ ...warningFeedback, title: "队列第二项" });
        }}
      >
        打开队列
      </button>
      <FeedbackReopenButton feedback={warningFeedback} label="重新查看" />
    </>
  );
}

describe("FeedbackDialog", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/projects/feedback-project");
  });

  it.each([
    ["success", "操作成功", "bg-success/10"],
    ["warning", "需要处理", "bg-warning/10"],
    ["destructive", "操作失败", "bg-destructive/10"],
  ] as const)("renders the %s semantic icon", (tone, label, toneClass) => {
    render(
      withI18n(
        <FeedbackDialog
          feedback={{ ...warningFeedback, tone }}
          open
          onClose={vi.fn()}
        />,
      ),
    );

    expect(screen.getByLabelText(label)).toHaveAttribute("data-feedback-tone", tone);
    expect(screen.getByLabelText(label)).toHaveClass(toneClass);
  });

  it("omits impact and technical details and runs safe dialog actions", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const primaryAction = vi.fn();
    const secondaryAction = vi.fn();
    render(
      withI18n(
        <FeedbackDialog
          feedback={{
            ...warningFeedback,
            primaryAction: { label: "前往处理", onSelect: primaryAction },
            secondaryAction: {
              label: "保持打开",
              onSelect: secondaryAction,
              closeOnSelect: false,
            },
          }}
          open
          onClose={onClose}
        />,
      ),
    );

    expect(screen.queryByText("影响：")).not.toBeInTheDocument();
    expect(screen.queryByText("技术详情")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前往处理" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "保持打开" }));
    expect(secondaryAction).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "前往处理" }));
    expect(primaryAction).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders Markdown-flavored and entity-encoded copy as plain user text", () => {
    render(
      withI18n(
        <FeedbackDialog
          feedback={{
            ...warningFeedback,
            message: "**请先处理**&#x4E0A;游内容",
          }}
          open
          onClose={vi.fn()}
        />,
      ),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("请先处理上游内容");
    expect(dialog).not.toHaveTextContent("**");
    expect(dialog).not.toHaveTextContent("&#x");
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      withI18n(
        <FeedbackDialog feedback={warningFeedback} open onClose={onClose} />,
      ),
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("always shows user actions, dedupes automatic reminders, and accepts a new revision", async () => {
    const user = userEvent.setup();
    render(
      withI18n(
        <FeedbackDialogProvider>
          <FeedbackHarness />
        </FeedbackDialogProvider>,
      ),
    );

    await user.click(screen.getByRole("button", { name: "用户操作" }));
    expect(screen.getByRole("dialog", { name: "需要先处理依赖" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "我知道了" }));
    await user.click(screen.getByRole("button", { name: "用户操作" }));
    expect(screen.getByRole("dialog", { name: "需要先处理依赖" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "我知道了" }));

    await user.click(screen.getByRole("button", { name: "自动提醒" }));
    expect(screen.getByRole("dialog", { name: "需要先处理依赖" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "我知道了" }));
    await user.click(screen.getByRole("button", { name: "自动提醒" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新查看" }));
    expect(screen.getByRole("dialog", { name: "需要先处理依赖" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "我知道了" }));
    await user.click(screen.getByRole("button", { name: "自动提醒新版本" }));
    expect(screen.getByRole("dialog", { name: "新版本问题" })).toBeInTheDocument();
  });

  it("shows queued feedback in order", async () => {
    const user = userEvent.setup();
    render(withI18n(<FeedbackDialogProvider><FeedbackHarness /></FeedbackDialogProvider>));

    await user.click(screen.getByRole("button", { name: "打开队列" }));
    expect(screen.getByRole("dialog", { name: "队列第一项" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "我知道了" }));
    expect(screen.getByRole("dialog", { name: "队列第二项" })).toBeInTheDocument();
  });

  it("does not reuse deduplication state after switching projects", async () => {
    const user = userEvent.setup();
    render(
      withI18n(
        <FeedbackDialogProvider>
          <FeedbackHarness />
        </FeedbackDialogProvider>,
      ),
    );

    await user.click(screen.getByRole("button", { name: "自动提醒" }));
    await user.click(screen.getByRole("button", { name: "我知道了" }));
    window.history.pushState({}, "", "/projects/another-project");
    window.dispatchEvent(new CustomEvent("uml-route-change"));
    await user.click(screen.getByRole("button", { name: "自动提醒" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "需要先处理依赖" })).toBeInTheDocument();
    });
  });
});
