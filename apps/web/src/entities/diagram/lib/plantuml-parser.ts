import type { DiagramType } from "../model";

export type ElementKind =
  // function MindMap
  | "function"
  // usecase
  | "actor"
  | "usecase"
  // component / deployment
  | "component"
  | "package"
  | "interface"
  | "cloud"
  | "node"
  | "database"
  // class
  | "class"
  | "enum"
  // state
  | "state"
  // activity
  | "activity"
  | "decision"
  // sequence
  | "participant";

export type DiagramElement = {
  id: string;
  kind: ElementKind;
  label: string;
};

export const KIND_META: Record<ElementKind, { label: string; order: number }> = {
  function: { label: "功能", order: 1 },
  actor: { label: "角色", order: 1 },
  usecase: { label: "用例", order: 2 },
  package: { label: "包", order: 1 },
  component: { label: "组件", order: 2 },
  interface: { label: "接口", order: 3 },
  cloud: { label: "云/外部", order: 4 },
  node: { label: "节点", order: 1 },
  database: { label: "数据库", order: 3 },
  class: { label: "类", order: 1 },
  enum: { label: "枚举", order: 2 },
  state: { label: "状态", order: 1 },
  activity: { label: "活动", order: 1 },
  decision: { label: "判断", order: 2 },
  participant: { label: "参与者", order: 1 },
};

function getStrippedLines(source: string) {
  return source
    .split("\n")
    .map((l) => l.replace(/'.*$/, "").trim())
    .filter(
      (l) =>
        l &&
        !l.startsWith("@start") &&
        !l.startsWith("@end") &&
        !l.startsWith("!") &&
        !l.startsWith("skinparam") &&
        !l.startsWith("title ") &&
        !l.startsWith("left to right") &&
        !l.startsWith("top to bottom"),
    );
}

function uniqById(items: DiagramElement[]): DiagramElement[] {
  const seen = new Set<string>();
  const out: DiagramElement[] = [];
  for (const it of items) {
    const key = `${it.kind}:${it.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function parseFunction(source: string): DiagramElement[] {
  const out: DiagramElement[] = [];
  const lines = getStrippedLines(source);
  lines.forEach((line, index) => {
    const match = line.match(/^\*+\s+(.+)$/u);
    if (!match) return;
    const label = match[1].replace(/\s+->\s+.*$/u, "").trim();
    if (!label) return;
    out.push({ id: `function-${index + 1}-${label}`, kind: "function", label });
  });
  return uniqById(out);
}

// Use case
function parseUseCase(source: string): DiagramElement[] {
  const out: DiagramElement[] = [];
  const lines = getStrippedLines(source);
  for (const line of lines) {
    let m: RegExpMatchArray | null;
    // actor "Name" as alias  |  actor Name as alias  |  actor Name  |  :Name: as alias
    m = line.match(/^actor\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[1] ?? m[2];
      const id = m[3] ?? label;
      out.push({ id, kind: "actor", label });
      continue;
    }
    m = line.match(/^:([^:]+):\s*(?:as\s+(\S+))?/);
    if (m) {
      out.push({ id: m[2] ?? m[1].trim(), kind: "actor", label: m[1].trim() });
      continue;
    }
    // usecase "Name" as alias | usecase Name | (Name) as alias | (Name)
    m = line.match(/^usecase\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[1] ?? m[2];
      const id = m[3] ?? label;
      out.push({ id, kind: "usecase", label });
      continue;
    }
    const ucMatches = line.matchAll(/\(([^)]+)\)(?:\s+as\s+(\w+))?/g);
    for (const um of ucMatches) {
      const label = um[1].trim();
      if (!label || label === "*") continue;
      out.push({ id: um[2] ?? label, kind: "usecase", label });
    }
  }
  return uniqById(out);
}

// Class
function parseClass(source: string): DiagramElement[] {
  const out: DiagramElement[] = [];
  const lines = getStrippedLines(source);
  for (const line of lines) {
    let m = line.match(/^(abstract\s+)?class\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[2] ?? m[3];
      out.push({ id: m[4] ?? label, kind: "class", label });
      continue;
    }
    m = line.match(/^interface\s+(?:"([^"]+)"|(\S+))/i);
    if (m) {
      const label = m[1] ?? m[2];
      out.push({ id: label, kind: "interface", label });
      continue;
    }
    m = line.match(/^enum\s+(?:"([^"]+)"|(\S+))/i);
    if (m) {
      const label = m[1] ?? m[2];
      out.push({ id: label, kind: "enum", label });
    }
  }
  return uniqById(out);
}

// Activity
function parseActivity(source: string): DiagramElement[] {
  const out: DiagramElement[] = [];
  const lines = getStrippedLines(source);
  for (const line of lines) {
    const a = line.match(/^:([^;]+);/);
    if (a) {
      const label = a[1].trim();
      out.push({ id: label, kind: "activity", label });
      continue;
    }
    const d = line.match(/^if\s*\(([^)]+)\)/i);
    if (d) {
      const label = d[1].trim();
      out.push({ id: label, kind: "decision", label });
    }
  }
  return uniqById(out);
}

// Deployment
function parseDeployment(source: string): DiagramElement[] {
  const out: DiagramElement[] = [];
  const lines = getStrippedLines(source);
  for (const line of lines) {
    let m = line.match(/^node\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[1] ?? m[2];
      out.push({ id: m[3] ?? label, kind: "node", label });
    }
    m = line.match(/^database\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[1] ?? m[2];
      out.push({ id: m[3] ?? label, kind: "database", label });
    }
    const compMatches = line.matchAll(/\[([^\]]+)\](?:\s+as\s+(\w+))?/g);
    for (const cm of compMatches) {
      const label = cm[1].trim();
      out.push({ id: cm[2] ?? label, kind: "component", label });
    }
  }
  return uniqById(out);
}

function parsePrototype(source: string): DiagramElement[] {
  const out: DiagramElement[] = [];
  const lines = getStrippedLines(source);
  for (const line of lines) {
    let m = line.match(/^package\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[1] ?? m[2];
      out.push({ id: m[3] ?? label, kind: "package", label });
      continue;
    }
    m = line.match(/^interface\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[1] ?? m[2];
      out.push({ id: m[3] ?? label, kind: "interface", label });
      continue;
    }
    m = line.match(/^component\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (m) {
      const label = m[1] ?? m[2];
      out.push({ id: m[3] ?? label, kind: "component", label });
      continue;
    }
  }
  return uniqById(out);
}

function parseAnalysis(source: string): DiagramElement[] {
  const out: DiagramElement[] = [];
  const lines = getStrippedLines(source);
  for (const line of lines) {
    const m = line.match(/^(actor|boundary|control|entity|database|participant)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?/i);
    if (!m) continue;
    const label = m[2] ?? m[3];
    out.push({ id: m[4] ?? label, kind: "participant", label });
  }
  return uniqById(out);
}

const PARSERS: Record<DiagramType, (s: string) => DiagramElement[]> = {
  context: parseAnalysis,
  function: parseFunction,
  activity: parseActivity,
  usecase: parseUseCase,
  class: parseClass,
  deployment: parseDeployment,
  prototype: parsePrototype,
  analysis: parseAnalysis,
};

export function parseElements(type: DiagramType, source: string): DiagramElement[] {
  if (!source) return [];
  return PARSERS[type](source);
}

export function groupElements(elements: DiagramElement[]) {
  const map = new Map<ElementKind, DiagramElement[]>();
  for (const el of elements) {
    if (!map.has(el.kind)) map.set(el.kind, []);
    map.get(el.kind)!.push(el);
  }
  return Array.from(map.entries())
    .map(([kind, items]) => ({ kind, items }))
    .sort((a, b) => KIND_META[a.kind].order - KIND_META[b.kind].order);
}
