// Verifies heading offsets for nested docs scrolling, including the mobile toolbar.
import { describe, expect, it, vi } from "vitest";
import { scrollDocsHeading } from "./docs-scroll";

describe("scrollDocsHeading", () => {
  it.each([0, 52])("accounts for viewport origin, existing scroll, and a %dpx toolbar", (toolbarHeight) => {
    const viewport = document.createElement("div");
    const heading = document.createElement("h2");
    viewport.scrollTop = 300;
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ top: 64 } as DOMRect);
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({ top: 800 } as DOMRect);
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;

    scrollDocsHeading(viewport, heading, toolbarHeight);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1012 - toolbarHeight, behavior: "smooth" });
  });

  it("clamps article resets to the start without smooth scrolling", () => {
    const viewport = document.createElement("div");
    const heading = document.createElement("h1");
    viewport.scrollTop = 20;
    scrollDocsHeading(viewport, heading, 52, "instant");
    expect(viewport.scrollTop).toBe(0);
  });
});
