// Ensures display terminology cannot corrupt SVG identities, references, or nested text formatting.
import { expect, it } from "vitest";
import { localizeDiagramText } from "./diagram-display-language";

it("translates only visible text and accessible descriptions", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g id="RequirementBaseline"><text><tspan>From RequirementBaseline</tspan></text><title>RequirementBaseline</title><use href="#RequirementBaseline" /></g></svg>';
  const result = localizeDiagramText(svg, "需求基线");
  expect(result).toContain('id="RequirementBaseline"');
  expect(result).toContain('href="#RequirementBaseline"');
  expect(result).toContain('<tspan>From 需求基线</tspan>');
  expect(result).toContain('<title>需求基线</title>');
});
