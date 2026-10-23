// Verifies the installed element works from props alone and honors externally persisted receipts.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/i18n";
import { QuestionFlow } from "./question-flow";

beforeEach(async () => { await i18n.changeLanguage("en"); });
afterEach(cleanup);
const steps = [{ id: "audience", question: "Who should receive this?", options: [{ id: "team", label: "Project team" }, { id: "leaders", label: "Department leaders" }] }];

it("completes without an assistant-ui runtime or provider", async () => {
  const onComplete = vi.fn();
  const view = render(<QuestionFlow steps={steps} onComplete={onComplete} />);
  await userEvent.click(screen.getByRole("button", { name: "Project team" }));
  expect(onComplete).toHaveBeenCalledWith({ audience: ["team"] });
  await waitFor(() => expect(view.container.firstChild).toHaveAttribute("data-state", "receipt"));
  view.rerender(<QuestionFlow steps={steps} onComplete={onComplete} choice={{ audience: ["leaders"] }} />);
  expect(view.container.firstChild).toHaveTextContent("Department leaders");
  expect(view.container.firstChild).not.toHaveTextContent("Project team");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows a noninteractive list when onComplete is absent", () => {
  render(<QuestionFlow steps={steps} />);
  expect(screen.getByText("Project team")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
