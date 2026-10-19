// Applies bounded structural field patches to a private candidate before the existing whole-model acceptance checks.
import type { AnyDiagramModel } from "@uml-platform/contracts";

export function structuralRepairCandidate(output: unknown, before: AnyDiagramModel): AnyDiagramModel {
  const result = output as { changes?: Array<{ path: string; value: unknown }> } | null;
  if (!Array.isArray(result?.changes) || !result.changes.length || result.changes.length > 100) throw new Error("结构修复必须返回非空字段补丁");
  const candidate = structuredClone(before);
  for (const change of result.changes) {
    if (!change || typeof change.path !== "string" || !Object.hasOwn(change, "value")) throw new Error("结构修复补丁缺少路径或值");
    const parts = change.path.split(".");
    if (parts.some(part => !part || ["__proto__", "prototype", "constructor"].includes(part))) throw new Error("结构修复路径不合法");
    const last = parts.pop()!;
    let parent: any = candidate;
    for (const part of parts) {
      if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, part)) throw new Error("结构修复路径不存在");
      parent = parent[part];
    }
    if (!parent || typeof parent !== "object" || (Array.isArray(parent) && (!/^\d+$/.test(last) || Number(last) >= parent.length))) throw new Error("结构修复不能扩展集合");
    parent[last] = structuredClone(change.value);
  }
  return candidate;
}
