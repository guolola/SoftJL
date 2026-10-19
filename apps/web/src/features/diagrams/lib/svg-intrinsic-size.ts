// Reads the natural pixel size PlantUML writes into an SVG so zoom levels mean the same for every diagram.
export function svgIntrinsicSize(markup: string): { width: number; height: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(markup)?.[0];
  if (!tag) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1] ?? null;
  const length = (value: string | null) => {
    const parsed = value ? Number.parseFloat(value) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 && !/%/.test(value ?? "") ? parsed : null;
  };
  const width = length(attr("width"));
  const height = length(attr("height"));
  if (width && height) return { width, height };
  const viewBox = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox && viewBox.length === 4 && viewBox[2]! > 0 && viewBox[3]! > 0) {
    return { width: viewBox[2]!, height: viewBox[3]! };
  }
  return null;
}
