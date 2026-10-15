// Converts handwritten JSON Schemas into the strict object shape required by OpenAI.
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addNullType(schema: Record<string, unknown>) {
  const next = { ...schema };
  const type = next.type;

  if (typeof type === "string") {
    next.type = type === "null" ? type : [type, "null"];
  } else if (Array.isArray(next.anyOf)) {
    if (!next.anyOf.some((item) => isRecord(item) && item.type === "null")) next.anyOf = [...next.anyOf, { type: "null" }];
  } else if (Array.isArray(type) && !type.includes("null")) {
    next.type = [...type, "null"];
  }

  if (Array.isArray(next.enum) && !next.enum.includes(null)) {
    next.enum = [...next.enum, null];
  }

  return next;
}

export function toOpenAiStrictJsonSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) return {};

  const next: Record<string, unknown> = { ...schema };
  if (isRecord(next.items)) {
    next.items = toOpenAiStrictJsonSchema(next.items);
  }
  if (Array.isArray(next.oneOf)) {
    next.anyOf = next.oneOf.map(toOpenAiStrictJsonSchema);
    delete next.oneOf;
  }
  if (Array.isArray(next.anyOf)) {
    next.anyOf = next.anyOf.map(toOpenAiStrictJsonSchema);
  }

  if (isRecord(next.properties)) {
    const originalRequired = new Set(
      Array.isArray(next.required) ? next.required.filter((key) => typeof key === "string") : [],
    );
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next.properties)) {
      const normalized = toOpenAiStrictJsonSchema(value);
      properties[key] = originalRequired.has(key)
        ? normalized
        : addNullType(normalized);
    }
    next.properties = properties;
    // OpenAI strict schemas require every declared property to be listed here;
    // optional contract fields are represented as nullable and stripped later.
    next.required = Object.keys(properties);
  }

  return next;
}
