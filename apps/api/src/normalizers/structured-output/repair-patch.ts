// Applies versioned field patches and narrowly restores JSON punctuation without inventing missing values.
import { snapshotInputFingerprint } from "@uml-platform/contracts";
import { parseJson } from "../json/parse-json.js";

const unsafe = new Set(["__proto__", "prototype", "constructor"]);
export function repairPathParts(path: string) {
  const parts = path.split(".");
  if (!parts.length || parts.some(part => !part || /[\[\]]/.test(part) || unsafe.has(part))) throw new Error("修复补丁路径不合法，必须使用点分路径");
  return parts;
}
export function valueAtRepairPath(value: unknown, path: string): unknown {
  return repairPathParts(path).reduce<any>((current, key) => current && typeof current === "object" ? current[key] : undefined, value);
}
export function applyGenerationPatch(before: unknown, response: unknown, targetId: string, allowedPaths: string[]) {
  // Reject alternate envelopes instead of silently accepting mixed patch protocols.
  if (!response || typeof response !== "object" || Array.isArray(response) ||
    Object.keys(response).some(key => !["targetId", "baseFingerprint", "changes"].includes(key))) {
    throw new Error("修复补丁只能包含 targetId、baseFingerprint 和 changes");
  }
  const patch = response as { targetId?: string; baseFingerprint?: string; changes?: { path: string; value: unknown }[] };
  if (patch.targetId !== targetId || patch.baseFingerprint !== snapshotInputFingerprint(before)) throw new Error("修复补丁的任务或基础版本不匹配");
  if (!Array.isArray(patch.changes) || !patch.changes.length || patch.changes.length > 100) throw new Error("修复必须返回 1 至 100 个字段补丁");
  const candidate = structuredClone(before);
  for (const change of patch.changes) {
    if (!change || typeof change !== "object" || Array.isArray(change) || typeof change.path !== "string" || !Object.hasOwn(change, "value") ||
      Object.keys(change).some(key => key !== "path" && key !== "value")) throw new Error("修复补丁字段只能包含路径和值");
    const parts = repairPathParts(change.path), canonical = parts.join(".");
    if (!allowedPaths.some(path => canonical === path || canonical.startsWith(path + "."))) throw new Error(`修复越过允许范围：${canonical}`);
    const last = parts.pop()!;
    let parent: any = candidate;
    for (const key of parts) {
      if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, key)) throw new Error("修复补丁的父路径不存在");
      parent = parent[key];
    }
    if (!parent || typeof parent !== "object" || Array.isArray(parent) && (!/^\d+$/.test(last) || Number(last) >= parent.length)) throw new Error("修复不能隐式扩展集合");
    parent[last] = structuredClone(change.value);
  }
  return candidate;
}

export function restoreJsonPunctuation(raw: string): string {
  try { parseJson(raw); return raw; } catch { /* Only syntax that does not add data is recoverable locally. */ }
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!/^[{[]/.test(text)) return raw;
  const stack: string[] = [];
  let quoted = false, escaped = false, result = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") { if (stack.pop() !== char) return raw; }
    if (char === "," && /^[\s]*[}\]]/.test(text.slice(index + 1))) continue;
    result += char;
  }
  if (quoted || escaped || /[[:,{]\s*$/.test(result)) return raw;
  result += stack.reverse().join("");
  try { JSON.parse(result); return result; } catch { return raw; }
}
