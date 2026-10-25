// Splits original source into stable evidence units while preserving exact source offsets.
export interface RequirementSourceUnit {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  category?: "requirement" | "context";
  pending?: boolean;
}

export function splitRequirementInput(source: string): RequirementSourceUnit[] {
  const units: RequirementSourceUnit[] = [];
  for (const line of source.matchAll(/[^\r\n]+/gu)) {
    for (const sentence of line[0].matchAll(/[^。！？!?；;]+[。！？!?；;]?/gu)) {
      const leading = sentence[0].match(/^\s*/u)?.[0].length ?? 0;
      const trailing = sentence[0].match(/\s*$/u)?.[0].length ?? 0;
      const startOffset = line.index + sentence.index + leading;
      const endOffset = line.index + sentence.index + sentence[0].length - trailing;
      if (endOffset > startOffset) units.push({ id: `u${units.length + 1}`, text: source.slice(startOffset, endOffset), startOffset, endOffset,
        ...(/^\s*(?:\[PENDING(?:[-_][A-Z0-9_-]+)?\]|(?:待确认|尚未确认)\s*[:：])/iu.test(line[0]) ? { pending: true } : {}) });
    }
  }
  return units;
}
