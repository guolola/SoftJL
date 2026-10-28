// Resolves only quick-modeling versions pinned at the start of an operation; never writes runtime files.
import { catalogById, catalog } from "./catalog.js";
import { splitSkillMetadata } from "./standard-catalog.js";
import type { PublishedSnapshot } from "./store.js";

export function standardPrompt(id: string, snapshot: PublishedSnapshot = {}) {
  const item = catalogById.get(id);
  if (!item || item.mode !== "standard" || item.resourcePath) throw new Error("快速建模提示词不存在");
  return snapshot[id]?.content ?? item.instruction;
}

export function standardResourceContent(path: string, original: Buffer, snapshot: PublishedSnapshot = {}): Buffer {
  const item = catalog.find(item => item.mode === "standard" && item.resourcePath === path);
  if (!item || !snapshot[item.id]) return original;
  const content = snapshot[item.id].content;
  return Buffer.from(item.kind === "skill" ? splitSkillMetadata(original.toString("utf8")).header + content : content, "utf8");
}
