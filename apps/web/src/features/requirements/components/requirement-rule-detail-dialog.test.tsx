// Verifies simplified rule details show original evidence without promising inferred fields.
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RequirementRuleDetailDialog } from "./requirement-rule-detail-dialog";
import "../../../shared/i18n/i18n";

it("shows rule source text without an empty automatic structure section", () => {
  render(<RequirementRuleDetailDialog rule={{ id: "r1", type: "functional" as const, text: "学生只能查看自己的成绩。", sourceFragment: "仅本人可查分",  }} onOpenChange={() => {}} />);
  expect(screen.getByText("学生只能查看自己的成绩。")).toBeInTheDocument();
  expect(screen.getByText(/仅本人可查分/)).toBeInTheDocument();
  expect(screen.queryByText("结构化信息")).not.toBeInTheDocument();
  expect(screen.queryByText(/下一次生成时会/)).not.toBeInTheDocument();
});
