// Verifies the shared input's runtime submission, keyboard guards and cancellation contract.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import { ModelingComposer, type ModelingComposerProps } from "./modeling-composer";

afterEach(cleanup);
const noMessages = [];

function Harness({ onNew, onCancel, running = false, ...props }: Partial<ModelingComposerProps> & {
  onNew: (message: import('@assistant-ui/react').AppendMessage) => Promise<void>;
  onCancel?: () => Promise<void>;
  running?: boolean;
}) {
  const runtime = useExternalStoreRuntime({ messages: noMessages, isRunning: running, onNew, onCancel });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ModelingComposer placeholder="需求原文" inputLabel="系统业务需求" submitLabel="提取规则" cancelLabel="停止提取" {...props} />
    </AssistantRuntimeProvider>
  );
}

it("uses the runtime's Enter submission while preserving Shift+Enter as a newline", async () => {
  const onNew = vi.fn(async () => {});
  const onTextChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onNew={onNew} onTextChange={onTextChange} toolbarTestId="input-toolbar" inputClassName="field-sizing-fixed h-60 overflow-y-auto" modelControls={<span>工程模型</span>} />);
  const input = screen.getByRole("textbox", { name: "系统业务需求" });
  expect(input.closest('[data-slot="modeling-composer"]')).toBeInTheDocument();
  expect(input).toHaveClass("h-60", "overflow-y-auto", "field-sizing-fixed");
  // Narrow inputs give controls another row instead of squeezing the model name down to its icon.
  expect(screen.getByTestId("input-toolbar")).toHaveClass("flex-wrap", "sm:flex-nowrap");
  await user.type(input, "借阅规则{Shift>}{Enter}{/Shift}归还规则");
  expect(input).toHaveValue("借阅规则\n归还规则");
  expect(onTextChange).toHaveBeenLastCalledWith("借阅规则\n归还规则");
  expect(onNew).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(onNew).toHaveBeenCalledWith(expect.objectContaining({ content: [{ type: "text", text: "借阅规则\n归还规则" }] })));
});

it("keeps drafts editable while blocked submission rejects both the action and keyboard", async () => {
  const onNew = vi.fn(async () => {});
  const user = userEvent.setup();
  const view = render(<Harness onNew={onNew} submitDisabled />);
  const input = screen.getByRole("textbox", { name: "系统业务需求" });
  await user.type(input, "权限检查中");
  expect(input).toBeEnabled();
  expect(screen.getByRole("button", { name: "提取规则" })).toBeDisabled();
  await user.keyboard("{Enter}");
  expect(onNew).not.toHaveBeenCalled();
  view.rerender(<Harness onNew={onNew} submitDisabled={false} />);
  await user.click(screen.getByRole("button", { name: "提取规则" }));
  await waitFor(() => expect(onNew).toHaveBeenCalledOnce());
});

it("shows the runtime's stop action during a run and locks mutation controls for read-only input", async () => {
  const onNew = vi.fn(async () => {});
  const onCancel = vi.fn(async () => {});
  const user = userEvent.setup();
  const view = render(<Harness onNew={onNew} onCancel={onCancel} running />);
  expect(screen.queryByRole("button", { name: "提取规则" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "停止提取" }));
  expect(onCancel).toHaveBeenCalledOnce();
  view.rerender(<Harness onNew={onNew} inputDisabled />);
  expect(screen.getByRole("textbox", { name: "系统业务需求" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add attachment" })).toBeDisabled();
});
