// Exercises rapid card handoffs with real Motion presence, including revisits before animations finish.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HoverEffect } from "./card-hover-effect";

describe("HoverEffect", () => {
  it("keeps exactly one opaque background during repeated four-card rotations", () => {
    const items = Array.from({ length: 4 }, (_, index) => ({
      title: `Card ${index + 1}`,
      description: "Project preview",
      link: `/projects/${index + 1}`,
    }));
    const { container } = render(<HoverEffect items={items} />);
    const cards = screen.getAllByRole("link");
    const backgrounds = () => container.querySelectorAll('[data-slot="card-hover-background"]');
    let previous: HTMLElement = document.body;

    // No animation waits: each next target must replace an unfinished handoff immediately.
    for (const index of Array.from({ length: 10 }, () => [0, 1, 3, 2, 0, 2, 3, 1]).flat()) {
      const target = cards[index];
      fireEvent.mouseOut(previous, { relatedTarget: target });
      fireEvent.mouseOver(target, { relatedTarget: previous });
      expect(backgrounds()).toHaveLength(1);
      expect(target).toContainElement(backgrounds()[0] as HTMLSpanElement);
      expect(backgrounds()[0]).toHaveStyle({ opacity: "1" });
      expect(backgrounds()[0]).toBeVisible();
      previous = target;
    }

    fireEvent.mouseOut(previous, { relatedTarget: document.body });
    expect(backgrounds()).toHaveLength(0);
    fireEvent.mouseOver(cards[0], { relatedTarget: document.body });
    expect(backgrounds()).toHaveLength(1);
    expect(backgrounds()[0]).toHaveStyle({ opacity: "1" });
  });
});
