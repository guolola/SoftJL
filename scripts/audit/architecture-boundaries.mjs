#!/usr/bin/env node
// Reports architecture boundary signals for project-owned source without changing files.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import {
  dirname,
  extname,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";

const root = process.cwd();
const strictMode = process.argv.includes("--strict");
const sourceRoots = ["apps", "packages", "src", "scripts"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ignoredDirectoryNames = new Set([
  ".cache",
  ".git",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "opencode",
  "plantuml",
  "sandpack",
  "vendor",
]);
const ignoredPrefixes = [
  "apps/api/src/code-skills/",
  "apps/web/public/sandpack/",
  "apps/web/public/vendor/",
  "packages/harness-e2e/.playwright/",
];
const largeFileLineThreshold = 900;
const complexFileLineThreshold = 300;
const topCommentWindow = 8;
const maxExamples = 12;

const webLayerRank = {
  shared: 0,
  entities: 1,
  services: 2,
  features: 3,
  workflows: 4,
  app: 5,
};
const webLayers = new Set(Object.keys(webLayerRank));
const apiSourcePrefix = "apps/api/src/";
const webSourcePrefix = "apps/web/src/";

function toPosixPath(value) {
  return value.split(sep).join("/");
}

function relativeToRoot(absolutePath) {
  return toPosixPath(relative(root, absolutePath));
}

function isIgnoredPath(relativePath) {
  return ignoredPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function collectSourceFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    const relativePath = relativeToRoot(absolutePath);
    if (isIgnoredPath(relativePath)) continue;
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name) || /^\.next(?:-|$)/.test(entry.name)) continue;
      collectSourceFiles(absolutePath, files);
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(absolutePath);
    }
  }
  return files;
}

function readSourceFile(absolutePath) {
  const text = readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    relativePath: relativeToRoot(absolutePath),
    text,
    lines: text.length === 0 ? 0 : text.split(/\r\n|\n|\r/).length,
  };
}

function isTestFile(relativePath) {
  return /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(relativePath);
}

function hasTopResponsibilityNote(text) {
  const lines = text.split(/\r\n|\n|\r/).slice(0, topCommentWindow);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#!")) continue;
    if (/^["']use\s+\w+["'];?$/.test(trimmed)) continue;
    if (/^\/\/\s*(eslint|prettier|@ts-|c8|istanbul|vitest)/i.test(trimmed)) {
      return false;
    }
    return /^(\/\/|\/\*|\*)/.test(trimmed);
  }
  return false;
}

function extractImportSpecifiers(text) {
  const specifiers = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    const fromMatch = line.match(/\bfrom\s+["']([^"']+)["']/);
    if (fromMatch) specifiers.push(fromMatch[1]);
    const bareImportMatch = line.match(/^\s*import\s+["']([^"']+)["']/);
    if (bareImportMatch) specifiers.push(bareImportMatch[1]);
    const dynamicImportMatch = line.match(/\bimport\(\s*["']([^"']+)["']\s*\)/);
    if (dynamicImportMatch) specifiers.push(dynamicImportMatch[1]);
  }
  return specifiers;
}

function resolveRelativeImport(sourceFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  return relativeToRoot(resolve(dirname(sourceFile.absolutePath), specifier));
}

function getWebLayer(relativePath) {
  if (!relativePath.startsWith(webSourcePrefix)) return null;
  const layer = relativePath.slice(webSourcePrefix.length).split("/")[0];
  return webLayers.has(layer) ? layer : null;
}

function collectWebBoundaryViolations(files) {
  const violations = [];
  const counts = new Map();
  for (const file of files) {
    const fromLayer = getWebLayer(file.relativePath);
    if (!fromLayer) continue;
    for (const specifier of extractImportSpecifiers(file.text)) {
      const targetPath = resolveRelativeImport(file, specifier);
      if (!targetPath || !targetPath.startsWith(webSourcePrefix)) continue;
      const toLayer = getWebLayer(targetPath);
      if (!toLayer || toLayer === fromLayer) continue;
      if (webLayerRank[toLayer] <= webLayerRank[fromLayer]) continue;
      const key = `${fromLayer} -> ${toLayer}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      violations.push({
        key,
        sourceKind: isTestFile(file.relativePath) ? "test" : "source",
        file: file.relativePath,
        import: specifier,
      });
    }
  }
  return { counts, violations };
}

function getApiDomain(relativePath) {
  if (!relativePath.startsWith(apiSourcePrefix)) return null;
  const segment = relativePath.slice(apiSourcePrefix.length).split("/")[0];
  return segment.replace(/\.[cm]?[jt]sx?$/, "");
}

function collectApiRouteDependencyCounts(files) {
  const counts = new Map();
  for (const file of files) {
    if (isTestFile(file.relativePath)) continue;
    if (!file.relativePath.startsWith(`${apiSourcePrefix}routes/`)) continue;
    for (const specifier of extractImportSpecifiers(file.text)) {
      const targetPath = resolveRelativeImport(file, specifier);
      if (!targetPath || !targetPath.startsWith(apiSourcePrefix)) continue;
      const targetDomain = getApiDomain(targetPath);
      if (!targetDomain || targetDomain === "routes") continue;
      counts.set(targetDomain, (counts.get(targetDomain) ?? 0) + 1);
    }
  }
  return counts;
}

function countByWorkspaceArea(files, predicate) {
  const counts = new Map();
  for (const file of files) {
    if (!predicate(file)) continue;
    const [workspace, name] = file.relativePath.split("/");
    const area = workspace === "apps" || workspace === "packages" ? `${workspace}/${name}` : workspace;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return counts;
}

function sortEntriesByCount(entries) {
  return [...entries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printCountTable(title, counts) {
  console.log(`\n${title}`);
  const entries = sortEntriesByCount(counts.entries());
  if (entries.length === 0) {
    console.log("  none");
    return;
  }
  for (const [label, count] of entries) {
    console.log(`  ${label}: ${count}`);
  }
}

function printFileList(title, files, formatter) {
  console.log(`\n${title}`);
  if (files.length === 0) {
    console.log("  none");
    return;
  }
  for (const file of files.slice(0, maxExamples)) {
    console.log(`  ${formatter(file)}`);
  }
  if (files.length > maxExamples) {
    console.log(`  ... ${files.length - maxExamples} more`);
  }
}

const sourceFiles = sourceRoots
  .flatMap((sourceRoot) => collectSourceFiles(resolve(root, sourceRoot)))
  .map(readSourceFile)
  .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const largeFiles = [...sourceFiles]
  .filter((file) => file.lines >= largeFileLineThreshold)
  .sort((a, b) => b.lines - a.lines);
const missingTopNotes = [...sourceFiles]
  .filter((file) => file.lines >= complexFileLineThreshold)
  .filter((file) => !hasTopResponsibilityNote(file.text))
  .sort((a, b) => b.lines - a.lines);
const topNoteCounts = countByWorkspaceArea(sourceFiles, (file) => hasTopResponsibilityNote(file.text));
const missingTopNoteCounts = countByWorkspaceArea(sourceFiles, (file) => !hasTopResponsibilityNote(file.text));
const webBoundary = collectWebBoundaryViolations(sourceFiles);
const apiRouteDependencies = collectApiRouteDependencyCounts(sourceFiles);

console.log("Architecture boundary audit");
console.log(`Root: ${root}`);
console.log(`Project-owned source files: ${sourceFiles.length}`);
console.log("Excluded paths: plantuml, opencode, dist, vendor, sandpack, copied code-skills, caches, logs, screenshots");
console.log(
  `Mode: ${strictMode ? "strict for frontend upward imports and complex missing top notes" : "report-only; existing findings do not fail this command."}`,
);

printCountTable("Top responsibility notes by area", topNoteCounts);
printCountTable("Missing top responsibility notes by area", missingTopNoteCounts);

printFileList(
  `Large files >= ${largeFileLineThreshold} lines`,
  largeFiles,
  (file) => `${file.relativePath} (${file.lines} lines)`,
);

printFileList(
  `Complex files >= ${complexFileLineThreshold} lines missing a top note`,
  missingTopNotes,
  (file) => `${file.relativePath} (${file.lines} lines)`,
);

printCountTable("Frontend upward import counts", webBoundary.counts);
printFileList(
  "Frontend upward import examples",
  webBoundary.violations,
  (violation) => `${violation.key} [${violation.sourceKind}] ${violation.file} imports ${violation.import}`,
);

printCountTable("API route dependency counts", apiRouteDependencies);

const largestFile = largeFiles[0];
if (largestFile) {
  console.log(`\nLargest file: ${largestFile.relativePath} (${largestFile.lines} lines)`);
}
console.log(`Complex files missing top notes: ${missingTopNotes.length}`);

if (strictMode) {
  const frontendViolationCount = webBoundary.violations.length;
  if (frontendViolationCount > 0 || missingTopNotes.length > 0) {
    console.error(
      `Strict architecture audit failed: ${frontendViolationCount} frontend upward imports, ${missingTopNotes.length} complex files missing top notes.`,
    );
    process.exitCode = 1;
  }
}
