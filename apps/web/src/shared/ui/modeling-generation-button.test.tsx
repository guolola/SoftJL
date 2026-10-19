// Verifies generation labels stay visible before the shared arrow and compact composers retain accessible names.
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ModelingGenerationButton } from "./modeling-generation-button";

it("shows the generation label before the arrow and preserves blocked-action guidance", () => {
  render(<ModelingGenerationButton label="生成" disabled title="请先选择模型" />);
  const button = screen.getByRole("button", { name: "生成" });
  expect(button).toHaveTextContent(/^生成$/);
  expect(button.firstChild?.textContent).toBe("生成");
  expect(button.querySelector("svg.lucide-arrow-up")).toHaveAttribute("aria-hidden", "true");
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("title", "请先选择模型");
});

it("retains the label while busy and supports icon-only composer submission", () => {
  const view = render(<ModelingGenerationButton label="生成" busy />);
  expect(screen.getByRole("button", { name: "生成" })).toHaveTextContent("生成");
  expect(view.container.querySelector("svg.animate-spin")).toBeInTheDocument();
  view.rerender(<ModelingGenerationButton label="发送需求" iconOnly />);
  expect(screen.getByRole("button", { name: "发送需求" })).toHaveTextContent(/^$/);
  expect(view.container.querySelector("svg.lucide-arrow-up")).toBeInTheDocument();
});
