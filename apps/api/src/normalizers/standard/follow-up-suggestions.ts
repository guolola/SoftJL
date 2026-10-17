// Uses the assistant-ui homepage's line-based follow-up protocol, with bounds for durable platform messages.
export function parseFollowUpSuggestions(text: string, count = 3): string[] {
  const seen = new Set<string>();
  return text.split("\n").flatMap(line => {
    const suggestion = line.trim().replace(/^(?:(?:[-*•]+|\d+[.)]|\(\d+\))\s*)+/, "").trim()
      .replace(/^["'“‘]+|["'”’]+$/g, "").trim();
    if (!suggestion || suggestion.length > 120 || seen.has(suggestion) || seen.size >= count || /^```/.test(suggestion)) return [];
    seen.add(suggestion); return [suggestion];
  });
}
