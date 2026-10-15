// Sanitizes server-rendered PlantUML SVG before it is injected into the DOM.
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "ellipse",
  "circle",
  "polygon",
  "polyline",
  "line",
  "text",
  "tspan",
  "marker",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "xmlns",
  "viewbox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "rx",
  "ry",
  "r",
  "d",
  "points",
  "transform",
  "class",
  "id",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "style",
  "marker-end",
  "marker-start",
  "marker-mid",
  "offset",
  "stop-color",
  "stop-opacity",
  "clip-path",
  "mask",
  "role",
  "aria-label",
]);

function isSafeAttribute(name: string, value: string) {
  const normalizedName = name.toLowerCase();
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedName.startsWith("on")) {
    return false;
  }
  if (normalizedName === "href" || normalizedName === "xlink:href") {
    return normalizedValue.startsWith("#");
  }
  if (!ALLOWED_ATTRIBUTES.has(normalizedName)) {
    return false;
  }
  if (
    normalizedValue.includes("javascript:") ||
    normalizedValue.includes("data:") ||
    normalizedValue.includes("vbscript:") ||
    normalizedValue.includes("expression(")
  ) {
    return false;
  }
  if (normalizedName === "style" && normalizedValue.includes("url(")) {
    return false;
  }
  return true;
}

function sanitizeElement(element: Element) {
  for (const child of Array.from(element.children)) {
    const tagName = child.tagName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(tagName)) {
      child.remove();
      continue;
    }

    for (const attribute of Array.from(child.attributes)) {
      if (!isSafeAttribute(attribute.name, attribute.value)) {
        child.removeAttribute(attribute.name);
      }
    }

    sanitizeElement(child);
  }
}

export function sanitizeSvgMarkup(svg: string) {
  if (!svg.trim() || typeof DOMParser === "undefined") {
    return "";
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    return "";
  }

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    return root?.outerHTML ?? "";
  }

  for (const attribute of Array.from(root.attributes)) {
    if (!isSafeAttribute(attribute.name, attribute.value)) {
      root.removeAttribute(attribute.name);
    }
  }
  sanitizeElement(root);

  return root.outerHTML;
}
