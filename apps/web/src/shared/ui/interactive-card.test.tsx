// Verifies shared interactive-card layering so spotlight effects remain visible without blocking content.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpotlightCard } from "./interactive-card";

describe("SpotlightCard", () => {
  it("keeps the glow behind transparent content without intercepting pointer input", () => {
    render(
      <SpotlightCard aria-label="模型卡片">
        <button type="button">编辑</button>
      </SpotlightCard>,
    );

    const card = screen.getByRole("article", { name: "模型卡片" });
    const glow = card.querySelector('[aria-hidden="true"]');
    const content = glow?.nextElementSibling;

    expect(glow).toHaveClass("pointer-events-none", "absolute", "inset-0", "z-0");
    expect(content).toHaveClass("relative", "z-[1]", "h-full");
    expect(content).not.toHaveClass("bg-card/96", "group-hover/spotlight:bg-card/90", "group-hover/spotlight:backdrop-blur-sm");
    expect(screen.getByRole("button", { name: "编辑" })).toBeEnabled();
  });
});
