// Removes provider placeholders only for optional non-nullable fields, preserving meaningful contract nulls.
type Schema = Record<string, any>;
const object = (value: unknown): value is Schema => Boolean(value && typeof value === "object" && !Array.isArray(value));
function allowsNull(schema: Schema): boolean {
  return schema.type === "null" || Array.isArray(schema.type) && schema.type.includes("null") ||
    Array.isArray(schema.anyOf) && schema.anyOf.some(allowsNull);
}

export function normalizeContractNulls(value: unknown, schema: Schema): unknown {
  if (value === null || value === undefined) return value;
  if (schema.anyOf && object(value)) {
    const variants = schema.anyOf.filter((variant: Schema) => variant.properties && Object.entries(variant.properties).every(([key, property]) => {
      const allowed = (property as Schema).enum;
      return !allowed || value[key] === undefined || allowed.includes(value[key]);
    }));
    if (variants.length === 1) return normalizeContractNulls(value, variants[0]);
  }
  if (Array.isArray(value)) return value.map(item => normalizeContractNulls(item, schema.items ?? {}));
  if (!object(value) || !schema.properties) return value;
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const child = schema.properties[key];
    if (item === null && child && !required.has(key) && !allowsNull(child)) return [];
    return [[key, child ? normalizeContractNulls(item, child) : item]];
  }));
}
