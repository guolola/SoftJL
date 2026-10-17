// Translates internal terminology in rendered SVG text without changing model identities or SVG references.
export function localizeDiagramText(svg: string, baselineLabel: string) {
  if (!svg.includes("RequirementBaseline") || typeof DOMParser === "undefined") return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (document.querySelector("parsererror")) return svg;
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest("text, title, desc")) {
      node.textContent = (node.textContent ?? "").replace(/\bRequirementBaseline\b/g, baselineLabel);
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}
