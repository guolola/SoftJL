// Verifies the shared scroll area only renders visible scrollbar parts for real overflow.
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { ScrollArea } from "./scroll-area";

describe("ScrollArea", () => {
  it("keeps the viewport scrollable without mounting idle scrollbar tracks", () => {
    render(
      <ScrollArea className="h-32" showHorizontalScrollbar>
        <div>长内容</div>
      </ScrollArea>,
    );

    expect(screen.getByText("长内容").closest('[data-slot="scroll-area-content"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="scroll-area-viewport"]')).toHaveClass("overflow-auto");
    expect(document.querySelectorAll('[data-slot="scroll-area-scrollbar"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-slot="scroll-area-thumb"]')).toHaveLength(0);
  });

  it("exposes the viewport element for imperative scrolling", () => {
    const viewportRef = createRef<HTMLDivElement>();

    render(
      <ScrollArea className="h-32" viewportRef={viewportRef}>
        <div>可滚动内容</div>
      </ScrollArea>,
    );

    expect(viewportRef.current).toBe(document.querySelector('[data-slot="scroll-area-viewport"]'));
  });
});
