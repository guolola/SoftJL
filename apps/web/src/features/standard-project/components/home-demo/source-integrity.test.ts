// Guards the source-only UI requirement without depending on a developer's local reference checkout.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import manifest from "./source-manifest.json";
const root = path.resolve("src/features/standard-project/components/home-demo");
const hash = (code: string) => createHash("sha256").update(code).digest("hex");
it("keeps imported UI and reviewed project adaptations at their recorded fingerprints", () => {
  for (const entry of manifest) {
    const content = readFileSync(path.join(root, entry.file), "utf8").replace(/\r\n/g, "\n");
    if (!("bodySha256" in entry)) { expect(hash(content), entry.file).toBe(entry.sha256); continue; }
    const normalized = content.replace(/((?:from\s*|import\s*\(\s*|import\s*)['"])([^'"]+)(['"])/g, "$1__source_module__$3");
    const printed = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(ts.createSourceFile("source.tsx", normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
    expect(hash(printed), entry.file).toBe("adaptedBodySha256" in entry ? entry.adaptedBodySha256 : entry.bodySha256);
    const file = ts.createSourceFile("source.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nodes: unknown[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) nodes.push([node.kind, node.tagName.getText(file), node.attributes.properties.map(attribute => ts.isJsxAttribute(attribute) ? [attribute.name.getText(file), ["className", "style"].includes(attribute.name.getText(file)) ? attribute.initializer?.getText(file) : null] : attribute.getText(file))]);
      if (ts.isJsxClosingElement(node)) nodes.push([node.kind, node.tagName.getText(file)]);
      ts.forEachChild(node, visit);
    };
    visit(file);
    // Preserve upstream provenance while locking reviewed project layout adaptations separately.
    expect(hash(JSON.stringify(nodes)), `${entry.file} source structure/styles`).toBe("adaptedStructureSha256" in entry ? entry.adaptedStructureSha256 : entry.structureSha256);
  }
});
it("has no untracked substitute components in the upstream source directory", () => {
  const list = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? list(path.join(directory, entry.name)) : [path.relative(root, path.join(directory, entry.name)).replaceAll("\\", "/")]);
  expect(list(path.join(root, "source")).sort()).toEqual(manifest.map(entry => entry.file).sort());
});
