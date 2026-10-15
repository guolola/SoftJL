// Enforces repository documentation naming, structure, links, and artifact boundaries.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const toPosix = (value) => value.replaceAll("\\", "/");
const listGitFiles = (...args) =>
  execFileSync("git", ["ls-files", "-z", ...args], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map(toPosix);

const candidateMarkdown = [
  ...listGitFiles("--cached", "--others", "--exclude-standard", "--", "*.md"),
].filter((file, index, files) => files.indexOf(file) === index && existsSync(path.join(root, file)));
const trackedFiles = listGitFiles("--cached").filter((file) => existsSync(path.join(root, file)));
const runtimeSkillPrefix = "apps/api/src/code-skills/ui-ux-pro-max/";
const markdownFiles = candidateMarkdown.filter((file) => !file.startsWith(runtimeSkillPrefix));
const errors = [];

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fixedNames = new Set(["README.md", "AGENTS.md", "SKILL.md"]);
const processNamePattern = /(?:^|-)(?:plan|audit|final|followup|fixes)(?:-|$)|20\d{2}-\d{2}-\d{2}/;

function report(file, message) {
  errors.push(`${file}: ${message}`);
}

function headingsOutsideFences(content) {
  let inFence = false;
  const headings = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) headings.push({ level: match[1].length, title: match[2].replace(/\s+#+$/, ""), line: index + 1 });
  }
  return headings;
}

function validateNames(file) {
  const segments = file.split("/");
  const basename = segments.at(-1);
  const stem = basename.slice(0, -3);
  if (!fixedNames.has(basename) && !kebabCase.test(stem)) {
    report(file, "Markdown 文件名必须使用小写英文 kebab-case");
  }
  for (const directory of segments.slice(0, -1)) {
    if (!kebabCase.test(directory)) report(file, `目录 ${directory} 不符合小写英文 kebab-case`);
  }
  if (file.startsWith("docs/") && processNamePattern.test(stem)) {
    report(file, "活文档文件名不能包含日期或过程状态词");
  }
}

function validateHeadings(file, content) {
  const headings = headingsOutsideFences(content);
  const h1s = headings.filter((heading) => heading.level === 1);
  if (h1s.length !== 1) report(file, `必须且只能包含一个 H1，当前为 ${h1s.length} 个`);
  if (headings[0]?.level !== 1) report(file, "第一个标题必须是 H1");
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level > headings[index - 1].level + 1) {
      report(file, `第 ${headings[index].line} 行标题发生层级跳跃`);
    }
  }
  return headings.filter((heading) => heading.level === 2).map((heading) => heading.title);
}

function requireSections(file, actual, required) {
  const missing = required.filter((section) => !actual.includes(section));
  if (missing.length) report(file, `缺少必需章节：${missing.join("、")}`);
}

function validateLinks(file, content) {
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    const target = rawTarget.split(/\s+["']/)[0];
    if (!target || /^(?:https?:|mailto:|tel:|#|\/)/i.test(target)) continue;
    const cleanTarget = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (!cleanTarget) continue;
    const resolved = path.resolve(root, path.dirname(file), cleanTarget);
    if (!existsSync(resolved)) report(file, `相对链接不存在：${target}`);
  }
}

// The repository opens in Chinese; each language retains its own required headings.
const rootReadmeSections = ["项目简介", "在线访问", "核心能力", "界面预览", "技术架构", "快速开始", "常用命令", "文档导航", "授权"];
const englishReadmeSections = [
  "Overview",
  "Online Access",
  "Core Capabilities",
  "Interface Preview",
  "Architecture",
  "Quick Start",
  "Common Commands",
  "Documentation",
  "License",
];
const technicalSections = ["概述", "当前设计或配置", "操作与维护", "验证", "相关文档"];
const componentSections = ["职责", "边界", "使用或常用命令", "配置", "验证", "相关文档"];
const componentReadmes = new Set([
  "apps/api/README.md",
  "apps/render-service/README.md",
  "apps/web/src/shared/ui/README.md",
  "packages/harness-e2e/README.md",
]);

for (const file of markdownFiles) {
  const content = readFileSync(path.join(root, file), "utf8");
  validateNames(file);
  const h2s = validateHeadings(file, content);
  validateLinks(file, content);

  if (!fixedNames.has(path.basename(file)) && !content.trimStart().startsWith("<!--")) {
    report(file, "非协议 Markdown 必须以简短职责注释开头");
  }
  if (file === "README.md") requireSections(file, h2s, rootReadmeSections);
  if (file === "readme-en.md") requireSections(file, h2s, englishReadmeSections);
  if (file.startsWith("docs/")) {
    requireSections(file, h2s, technicalSections);
    for (const field of ["维护状态", "目标读者", "事实来源"]) {
      if (!content.includes(field)) report(file, `缺少元信息：${field}`);
    }
  }
  if (componentReadmes.has(file)) requireSections(file, h2s, componentSections);

  if (content.includes("软件工程实验平台")) report(file, "仍包含旧产品名“软件工程实验平台”");
  if (/[A-Za-z]:\\(?:Users|Documents|Downloads|Desktop)\\/i.test(content)) {
    report(file, "包含本机绝对路径");
  }
  if (content.includes("134.175.78.226")) report(file, "包含无必要的生产服务器 IP");
}

for (const forbiddenPrefix of ["apps/api/.local-documents/", "apps/web/public/sandpack/", "tmp/"]) {
  const offenders = trackedFiles.filter((file) => file.startsWith(forbiddenPrefix));
  if (offenders.length) report(forbiddenPrefix, `禁止跟踪该目录中的 ${offenders.length} 个文件`);
}

const expectedTechnicalDocs = [
  "docs/README.md",
  "docs/architecture/platform-overview.md",
  "docs/architecture/trusted-generation.md",
  "docs/deployment/baota-pm2.md",
  "docs/deployment/generation-workers.md",
  "docs/deployment/production-environment.md",
  "docs/deployment/seo.md",
  "docs/development/repository-hygiene.md",
  "docs/integrations/openai-compatible-provider.md",
];
for (const file of expectedTechnicalDocs) {
  if (!markdownFiles.includes(file)) report(file, "技术文档索引缺失");
}

if (errors.length) {
  console.error(`Documentation audit failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Documentation audit passed for ${markdownFiles.length} Markdown files.`);
