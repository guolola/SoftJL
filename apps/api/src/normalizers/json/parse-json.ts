// Owns tolerant JSON extraction and small structural helpers shared by API normalizers.
export function extractFirstJsonValue(value: string) {
  const trimmed = value.trim();
  const startIndex = [...trimmed]
    .map((char, index) => ({ char, index }))
    .find(({ char }) => char === "{" || char === "[")?.index;

  if (startIndex === undefined) {
    return trimmed;
  }

  const opening = trimmed[startIndex];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < trimmed.length; index += 1) {
    const char = trimmed[index] ?? "";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === opening) depth += 1;
    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(startIndex, index + 1);
      }
    }
  }

  return trimmed;
}

export function parseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    const extracted = extractFirstJsonValue(value);
    if (extracted === value.trim()) {
      throw error;
    }
    return JSON.parse(extracted) as T;
  }
}

export function formatParseError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringArray(item))
      .filter((item, index, array) => item.trim().length > 0 && array.indexOf(item) === index);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|[;；]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [String(value).trim()].filter(Boolean);
}

export function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
