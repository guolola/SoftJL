// Covers simplified rule editing, deterministic model previews and read-only permissions.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RequirementRuleDetailDialog } from "./requirement-rule-detail-dialog";
import "../../../shared/i18n/i18n";
const rule = { id: "r1", text: "失败后保留表单", type: "exception" as const };

it("edits only type and text and exposes fixed model associations", async () => {
  const user = userEvent.setup(), save = vi.fn();
  render(<RequirementRuleDetailDialog rule={rule} canEdit onSave={save} onOpenChange={() => {}} />);
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByLabelText("对应模型")).toHaveTextContent("总体业务流程");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByText("生命周期")).not.toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "需求类型" }));
  await user.click(await screen.findByRole("option", { name: "数据需求" }));
  expect(screen.getByLabelText("对应模型")).toHaveTextContent("领域概念模型");
  expect(screen.getByLabelText("对应模型")).not.toHaveTextContent("总体业务流程");
  await user.clear(screen.getByRole("textbox", { name: "需求文本" }));
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "需求文本" }), "  记录预约编号  ");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(save).toHaveBeenCalledWith("r1", { type: "data", text: "记录预约编号" });
});

it("keeps both fields disabled for a read-only workspace", () => {
  render(<RequirementRuleDetailDialog rule={rule} onOpenChange={() => {}} />);
  expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "需求类型" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "需求文本" })).toBeDisabled();
});
