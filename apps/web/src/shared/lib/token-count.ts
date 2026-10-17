// Formats context counters consistently across modeling inputs and usage details.
const UNITS = [
  { size: 1_000, suffix: "k" },
  { size: 1_000_000, suffix: "M" },
  { size: 1_000_000_000, suffix: "B" },
  { size: 1_000_000_000_000, suffix: "T" },
] as const;

export function formatTokenCount(tokens: number): string {
  if (!(tokens >= 1_000)) return `${tokens}`;
  let label = "";
  for (const { size, suffix } of UNITS) {
    const value = Math.round((tokens / size) * 10) / 10;
    label = `${value}${suffix}`;
    if (value < 1_000) break;
  }
  return label;
}
