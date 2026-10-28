// Shares maintained skill files between Pi's resource reader and independent structured-generation requests.
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";
import { getModelReviewProfile, standardModelStage, type StandardDiagramKind } from "@uml-platform/contracts";
import { standardResourceContent } from "../../../prompt-runtime/standard-runtime.js";
import type { PublishedSnapshot } from "../../../prompt-runtime/store.js";

export const standardModelingResourceRoot = fileURLToPath(new URL("./resources/", import.meta.url));
export const standardModelingSkillPaths = ["uml-graduation-modeling", "graduation-deliverables"]
  .map(name => join(standardModelingResourceRoot, "skills", name));

function assertResourcePath(root: string, path: string) {
  const child = relative(root, path);
  if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child) || extname(path).toLowerCase() !== ".md") {
    throw new Error("只允许读取平台提供的建模技能和参考资料");
  }
}

async function resolveResourcePath(path: string, root: string) {
  const absolute = resolve(root, path);
  assertResourcePath(resolve(root), absolute);
  // Check both the requested path and its physical target so links/junctions cannot expose host files.
  const [physicalRoot, physicalFile] = await Promise.all([realpath(root), realpath(absolute)]);
  assertResourcePath(physicalRoot, physicalFile);
  if ((await stat(physicalFile)).size > 65536) throw new Error("建模参考资料文件过大");
  return physicalFile;
}

export async function readStandardModelingResource(path: string, root = standardModelingResourceRoot, snapshot: PublishedSnapshot = {}) {
  const file = await resolveResourcePath(path, root);
  const original = await readFile(file);
  return resolve(root) === resolve(standardModelingResourceRoot)
    ? standardResourceContent(relative(root, file).split(sep).join("/"), original, snapshot) : original;
}

export function createStandardResourceReadTool(root = standardModelingResourceRoot, snapshot: PublishedSnapshot = {}): ReturnType<typeof createReadToolDefinition> {
  // Preserve Pi's native read schema, pagination and skill discovery; replace only its filesystem operations.
  const tool = createReadToolDefinition(root, { operations: {
    access: async path => { await resolveResourcePath(path, root); },
    readFile: path => readStandardModelingResource(path, root, snapshot),
    detectImageMimeType: async () => null,
  } });
  return { ...tool, label: "读取建模规范", description: "读取平台提供的 SKILL.md 和 Markdown 参考资料。支持绝对路径或相对技能资源根目录的路径，以及 offset/limit 分页。不能读取项目源码、凭证或其他宿主机文件。" };
}

export type StandardGuidanceTask = StandardDiagramKind | "tests" | "requirementsSpec" | "softwareDesignSpec";
const diagramReferences: Record<StandardDiagramKind, string> = {
  function: "views", usecase: "usecase", activity: "activity", architecture: "views",
  er: "data-modeling", class: "class", sequence: "sequence", table: "data-modeling",
};

export async function standardTaskGuidance(task: StandardGuidanceTask, snapshot: PublishedSnapshot = {}) {
  const files = task === "tests" || task === "requirementsSpec" || task === "softwareDesignSpec"
    ? ["skills/graduation-deliverables/SKILL.md"]
    : ["skills/uml-graduation-modeling/SKILL.md", `skills/uml-graduation-modeling/references/${diagramReferences[task]}.md`];
  const contents = await Promise.all(files.map(async path => (await readStandardModelingResource(path, standardModelingResourceRoot, snapshot)).toString("utf8")));
  const structure = task === "er"
    ? "实体 ID、关系 ID 分别在全图唯一，属性 ID 在所属实体内唯一；关系 sourceId／targetId 必须引用真实实体；基数只能是非负整数、* 或合法非负区间，下界不得大于上界。"
    : task in diagramReferences
      ? getModelReviewProfile(standardModelStage(task as Exclude<StandardDiagramKind, "er">), task).structure.join("\n")
      : "";
  return `平台维护的建模技能（按本次任务选取，直接使用语义指导并返回请求的结构数据）：\n${contents.join("\n\n")}${structure ? `\n\n生成阶段模型结构规则（在返回前自行核对）：\n${structure}` : ""}`;
}
