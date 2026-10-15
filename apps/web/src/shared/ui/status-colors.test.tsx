// Verifies that project status and category markers retain distinct semantic colors.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import { categoryChipTone } from "./category-tones";
import { PageNoticeButton } from "./page-notice-button";

describe("project status colors", () => {
  it("uses distinct warning, info, failure, and success badge colors", () => {
    render(<>
      <Badge variant="warning">待处理</Badge>
      <Badge variant="info">信息</Badge>
      <Badge variant="destructive">失败</Badge>
      <Badge variant="success">完成</Badge>
    </>);

    expect(screen.getByText("待处理")).toHaveClass("text-warning");
    expect(screen.getByText("信息")).toHaveClass("text-info");
    expect(screen.getByText("失败")).toHaveClass("text-destructive");
    expect(screen.getByText("完成")).toHaveClass("text-success");
  });

  it("makes notice controls accessible and differentiates category markers", () => {
    render(<PageNoticeButton label="查看风险提示" tone="warning" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "查看风险提示" })).toHaveClass("text-warning");
    expect(categoryChipTone(0)).not.toBe(categoryChipTone(1));
    expect(categoryChipTone(0)).toBe(categoryChipTone(8));
  });
});
