// Encodes stable graph IDs and preserves full labels while escaping PlantUML line boundaries.
export function umlAlias(value: string) { return `n_${Buffer.from(value, "utf8").toString("hex")}`; }
export function umlText(value: string) { return value.replace(/\r?\n/g, "\\n").replace(/"/g, "&#34;"); }
export function umlLabel(value: string) { return `"${umlText(value)}"`; }
