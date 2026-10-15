// Projects the supported Zod contract vocabulary to provider schemas; unsupported constructs fail closed.
import { z } from "zod";

export function contractResponseSchema(schema: z.ZodTypeAny): Record<string, any> {
  if (schema instanceof z.ZodOptional) return contractResponseSchema(schema.unwrap());
  if (schema instanceof z.ZodNullable) return { anyOf: [contractResponseSchema(schema.unwrap()), { type: "null" }] };
  if (schema instanceof z.ZodDefault) return contractResponseSchema(schema.removeDefault());
  if (schema instanceof z.ZodObject) {
    const entries = Object.entries(schema.shape) as Array<[string, z.ZodTypeAny]>;
    return { type: "object", additionalProperties: false, properties: Object.fromEntries(entries.map(([key, value]) => [key, contractResponseSchema(value)])), required: entries.filter(([, value]) => !value.isOptional()).map(([key]) => key) };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: contractResponseSchema(schema.element), ...(schema._def.minLength ? { minItems: schema._def.minLength.value } : {}), ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}) };
  }
  if (schema instanceof z.ZodDiscriminatedUnion || schema instanceof z.ZodUnion) return { anyOf: schema.options.map(contractResponseSchema) };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { type: typeof schema.value, enum: [schema.value] };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    for (const check of schema._def.checks) {
      if (check.kind === "min") result.minLength = check.value;
      else if (check.kind === "max") result.maxLength = check.value;
      else if (check.kind === "regex") result.pattern = check.regex.source;
      else throw new Error(`Unsupported model string check: ${check.kind}`);
    }
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: "number" };
    for (const check of schema._def.checks) {
      if (check.kind === "int") result.type = "integer";
      else if (check.kind === "min") result[check.inclusive ? "minimum" : "exclusiveMinimum"] = check.value;
      else if (check.kind === "max") result[check.inclusive ? "maximum" : "exclusiveMaximum"] = check.value;
      else if (check.kind !== "finite") throw new Error(`Unsupported model number check: ${check.kind}`);
    }
    return result;
  }
  throw new Error(`Unsupported model schema: ${schema._def.typeName}`);
}

/** Report unknown content before Zod's ordinary object parsing can strip it. */
export function unknownContractFields(schema: z.ZodTypeAny, value: unknown, path = ""): string[] {
  if (value === undefined || value === null) return [];
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unknownContractFields(schema.unwrap(), value, path);
  if (schema instanceof z.ZodDefault) return unknownContractFields(schema.removeDefault(), value, path);
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const key = value && typeof value === "object" ? (value as Record<string, unknown>)[schema.discriminator] : undefined;
    const variant = schema.optionsMap.get(key as string);
    return variant ? unknownContractFields(variant, value, path) : [];
  }
  if (schema instanceof z.ZodUnion) {
    const variant = schema.options.find((option: z.ZodTypeAny) => option.safeParse(value).success);
    return variant ? unknownContractFields(variant, value, path) : [];
  }
  if (schema instanceof z.ZodArray && Array.isArray(value)) return value.flatMap((item, i) => unknownContractFields(schema.element, item, `${path}.${i}`));
  if (schema instanceof z.ZodObject && typeof value === "object" && !Array.isArray(value)) return Object.entries(value).flatMap(([key, item]) => {
    const next = path ? `${path}.${key}` : key;
    return schema.shape[key] ? unknownContractFields(schema.shape[key], item, next) : [next];
  });
  return [];
}

/** Generation omits only documented derived views; prompts and provider schemas share this projection. */
export function generationResponseSchema(schema: z.ZodTypeAny): Record<string, any> {
  const result = contractResponseSchema(schema);
  const visit = (node: Record<string, any>) => {
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
