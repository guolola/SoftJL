// Losslessly packs repeated source columns; current outputs and validation data remain ordinary JSON.
type Packed = unknown;
function pack(value: unknown): Packed {
  if (Array.isArray(value)) {
    const objects = value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[];
    const fields = objects[0] ? Object.keys(objects[0]) : [];
    if (value.length >= 2 && objects.length === value.length && fields.length >= 3 && objects.every(item => Object.keys(item).length === fields.length && fields.every(key => Object.hasOwn(item, key)))) {
      const table = { $fields: fields, $rows: objects.map(item => fields.map(key => pack(item[key]))) };
      const ordinary = value.map(item => Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, pack(entry)])));
      return JSON.stringify(table).length < JSON.stringify(ordinary).length ? table : ordinary;
    }
    return value.map(pack);
  }
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pack(item)]));
  return value;
}
export function compactPromptData(value: unknown): unknown { return pack(value); }
export const PROMPT_DATA_FORMAT = "来源集合可使用 {$fields:[字段名],$rows:[[逐字段值]]} 无损表格编码；每行依 $fields 顺序读取，嵌套同理。所有条件、约束、说明和事件流均为完整事实，不得忽略。";

export function expandPromptData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expandPromptData);
  if (!value || typeof value !== "object") return value;
  const data = value as Record<string, unknown>;
  if (Array.isArray(data.$fields) && Array.isArray(data.$rows) && Object.keys(data).length === 2) return data.$rows.map((row: unknown[]) => Object.fromEntries((data.$fields as string[]).map((field, index) => [field, expandPromptData(row[index])])));
  return Object.fromEntries(Object.entries(data).map(([key, item]) => [key, expandPromptData(item)]));
}
