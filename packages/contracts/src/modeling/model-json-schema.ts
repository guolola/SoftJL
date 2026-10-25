// Projects current Zod contracts to provider schemas and locates fields without changing stored data.
import { z } from "zod";

const unwrap = (node: z.ZodOptional | z.ZodNullable | z.ZodDefault | z.ZodPrefault) => node.unwrap() as z.ZodTypeAny;
const variants = (node: z.ZodUnion | z.ZodDiscriminatedUnion) => node.options as z.ZodTypeAny[];
function discriminatorVariant(node: z.ZodDiscriminatedUnion, value: any) {
  const field = node.def.discriminator;
  return variants(node).find(option => option instanceof z.ZodObject && option.shape[field]?.safeParse(value?.[field]).success);
}

// Select the actual discriminated variant before projecting a model-relative field.
export function contractFieldSchema(schema: z.ZodTypeAny, value: unknown, path: string): Record<string, any> | undefined {
  const find = (node: z.ZodTypeAny, current: any, parts: string[]): z.ZodTypeAny | undefined => {
    if (node instanceof z.ZodPipe) return find((node.in instanceof z.ZodTransform ? node.out : node.in) as z.ZodTypeAny, current, parts);
    if (node instanceof z.ZodOptional || node instanceof z.ZodNullable || node instanceof z.ZodDefault || node instanceof z.ZodPrefault) return find(unwrap(node), current, parts);
    if (node instanceof z.ZodDiscriminatedUnion) {
      const variant = discriminatorVariant(node, current);
      if (variant) return find(variant, current, parts);
    }
    if (node instanceof z.ZodUnion || node instanceof z.ZodDiscriminatedUnion) {
      const fields = variants(node).map(option => find(option, current, parts)).filter(Boolean) as z.ZodTypeAny[];
      return fields.length === 1 ? fields[0] : fields.length > 1 ? z.union(fields) : undefined;
    }
    if (!parts.length) return node;
    const [key, ...rest] = parts;
    if (node instanceof z.ZodObject && node.shape[key!]) return find(node.shape[key!], current?.[key!], rest);
    if (node instanceof z.ZodArray && /^\d+$/.test(key!)) return find(node.element as z.ZodTypeAny, current?.[key!], rest);
    if (node instanceof z.ZodRecord) return find(node.valueType as z.ZodTypeAny, current?.[key!], rest);
    return undefined;
  };
  const field = find(schema, value, path ? path.split(".") : []);
  if (!field) return undefined;
  try { return contractResponseSchema(field); } catch { return undefined; }
}

export function contractResponseSchema(schema: z.ZodTypeAny): Record<string, any> {
  const result = z.toJSONSchema(schema, {
    target: "draft-07", io: "input", reused: "inline", cycles: "throw",
    unrepresentable: ({ message }) => { throw new Error(`Unsupported model schema: ${message}`); },
    override({ zodSchema, jsonSchema }) {
      // Generation is a structural projection; normalization effects cannot be advertised as plain JSON.
      if (zodSchema._zod.def.type === "pipe" || zodSchema._zod.def.type === "transform") throw new Error("Unsupported model schema: transform");
      if (jsonSchema.type === "object") jsonSchema.additionalProperties = false;
      if (jsonSchema.oneOf) { jsonSchema.anyOf = jsonSchema.oneOf; delete jsonSchema.oneOf; }
      if (jsonSchema.const !== undefined) { jsonSchema.enum = [jsonSchema.const]; delete jsonSchema.const; }
      delete jsonSchema.default;
    },
  });
  delete result.$schema;
  return result;
}

/** Report unknown content before ordinary object parsing can strip it. */
export function unknownContractFields(schema: z.ZodTypeAny, value: unknown, path = ""): string[] {
  if (value === undefined || value === null) return [];
  if (schema instanceof z.ZodPipe) return unknownContractFields((schema.in instanceof z.ZodTransform ? schema.out : schema.in) as z.ZodTypeAny, value, path);
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault || schema instanceof z.ZodPrefault) return unknownContractFields(unwrap(schema), value, path);
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const variant = discriminatorVariant(schema, value);
    return variant ? unknownContractFields(variant, value, path) : [];
  }
  if (schema instanceof z.ZodUnion) {
    const variant = variants(schema).find(option => option.safeParse(value).success);
    return variant ? unknownContractFields(variant, value, path) : [];
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) return value.flatMap((item, i) => unknownContractFields(schema.element as z.ZodTypeAny, item, `${path}.${i}`));
  if (schema instanceof z.ZodObject && typeof value === "object" && !Array.isArray(value)) return Object.entries(value).flatMap(([key, item]) => {
    const next = path ? `${path}.${key}` : key;
    return schema.shape[key] ? unknownContractFields(schema.shape[key], item, next) : [next];
  });
  return [];
}

/** Generation reflects existing acceptance requirements and omits documented derived views. */
export function generationResponseSchema(schema: z.ZodTypeAny): Record<string, any> {
  const result = contractResponseSchema(schema);
  const requireElementSources = (node: Record<string, any>, field: string) => {
    if (node.properties?.id && node.properties[field]) {
      node.required = [...new Set([...(node.required ?? []), field])];
      node.properties[field].minItems = Math.max(1, node.properties[field].minItems ?? 0);
    }
    for (const child of Object.values(node.properties ?? {})) requireElementSources(child as Record<string, any>, field);
    if (node.items) requireElementSources(node.items, field);
    for (const child of node.anyOf ?? []) requireElementSources(child, field);
  };
  const visit = (node: Record<string, any>) => {
    // Analysis provenance is embedded on each identified element, including nested branches.
    if (node.properties?.diagramKind?.enum?.[0] === "analysis") requireElementSources(node, "sourceElementIds");
    if (node.properties?.diagramKind?.enum?.[0] === "context") requireElementSources(node, "sourceRequirementIds");
    if (node.properties?.diagramKind?.enum?.[0] === "table") {
      delete node.properties.relationships;
      node.required = node.required.filter((key: string) => key !== "relationships");
      const column = node.properties.tables.items.properties.columns.items;
      for (const key of ["isPrimaryKey", "isForeignKey", "references"]) {
        delete column.properties[key]; column.required = column.required.filter((name: string) => name !== key);
      }
    }
    for (const child of Object.values(node.properties ?? {})) visit(child as Record<string, any>);
    if (node.items) visit(node.items);
    for (const child of node.anyOf ?? []) visit(child);
  };
  visit(result);
  return result;
}
