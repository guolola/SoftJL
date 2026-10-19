// Protects distinct model identities and the SVG sizing/theme contract at shared UI entry points.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DESIGN_DIAGRAM_ICON, FEASIBILITY_ARTIFACT_ICON, REQUIREMENT_DIAGRAM_ICON } from "./model-icons";
import { DESIGN_DIAGRAM_ORDER, DIAGRAM_ORDER } from "./model";

const modelIcons = [
  FEASIBILITY_ARTIFACT_ICON.context,
  FEASIBILITY_ARTIFACT_ICON["business-flow"],
  ...DIAGRAM_ORDER.map(kind => REQUIREMENT_DIAGRAM_ICON[kind]),
  ...DESIGN_DIAGRAM_ORDER.map(kind => DESIGN_DIAGRAM_ICON[kind]),
];

describe("model category icons", () => {
  it("gives all 16 visible model categories distinct SVG geometry", () => {
    const geometry = modelIcons.map(Icon => render(<Icon />).container.querySelector("svg")!.innerHTML);
    expect(new Set(geometry).size).toBe(16);
    // Legacy requirement-context references identify the same feasibility artifact.
    expect(REQUIREMENT_DIAGRAM_ICON.context).toBe(FEASIBILITY_ARTIFACT_ICON.context);
  });

  it.each([16, 24])("supports %spx controls and inherited theme colors without an opaque background", size => {
    for (const Icon of modelIcons) {
      const svg = render(<Icon size={size} aria-label="模型类别" />).container.querySelector("svg")!;
      expect(svg).toHaveAttribute("width", String(size));
      expect(svg).toHaveAttribute("height", String(size));
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg).toHaveAttribute("aria-label", "模型类别");
      expect(svg.querySelector('[fill]:not([fill="currentColor"]):not([fill="none"])')).toBeNull();
    }
  });
});
