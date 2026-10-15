// Verifies semantic badge variants stay backed by shared theme tokens.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("exposes semantic variants for reusable status labels", () => {
    render(
      <div>
        <Badge variant="success">成功</Badge>
        <Badge variant="secondary">警告</Badge>
        <Badge variant="secondary">信息</Badge>
      </div>,
    );

    expect(screen.getByText("成功")).toHaveClass("bg-success/10", "text-success");
    expect(screen.getByText("警告")).toHaveClass("bg-secondary", "text-secondary-foreground");
    expect(screen.getByText("信息")).toHaveClass("bg-secondary", "text-secondary-foreground");
  });
});
