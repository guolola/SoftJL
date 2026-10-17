// Shows input-format guidance only for recognizable pasted code; it never blocks generation.
export function looksLikeSourceCode(text: string) {
  return /```(?:typescript|javascript|tsx?|jsx?|python|py|java|c\+\+|cpp|csharp|c#|go|rust|sql|html|css|json)\b/i.test(text)
    || /^\s*(?:import\s+.+\s+from\s+["']|(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(|(?:public\s+)?class\s+\w+[^\n]*\{|def\s+\w+\s*\([^\n]*\)\s*:|public\s+static\s+void\s+main\b|SELECT\s+.+\s+FROM\s+)/im.test(text);
}
