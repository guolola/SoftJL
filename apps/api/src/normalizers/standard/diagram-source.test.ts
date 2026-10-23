// Compiles quick-modeling payloads with the actual renderer, including engineering rich-model fixtures.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { standardDiagramKinds, standardDiagramSchema, standardModelStage, validateStandardModel } from "@uml-platform/contracts";
import { modelReviewFixtures, standardModelFixture } from "@uml-platform/contracts/testing";
import { buildStandardDiagram } from "./diagram-source.js";

const jars = fileURLToPath(new URL("../../../../../plantuml/", import.meta.url));
const jar = existsSync(jars) ? readdirSync(jars).find(name => /^plantuml-.*\.jar$/.test(name) && !/sources|javadoc/.test(name)) : undefined;
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
  : process.platform === "win32" ? "C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin/java.exe" : "java";
function compile(source: string) {
  assert.ok(jar, "PlantUML runtime is required for rendering verification");
  const result = spawnSync(java, ["-Djava.awt.headless=true", "-jar", resolve(jars, jar), "-charset", "UTF-8", "-pipe", "-tsvg"], {
    input: source, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${source}\n${result.stdout?.slice(-1000)}`);
  assert.match(result.stdout, /<svg/);
  assert.doesNotMatch(result.stdout, /Syntax Error|An error has occurred/);
  return result.stdout;
}

for (const kind of standardDiagramKinds) test(`quick ${kind}: current payload survives persistence and actual rendering`, () => {
  const model = validateStandardModel(kind, standardModelFixture(kind));
  const diagram = { id: kind, kind, title: model.title, model, status: "completed" };
  assert.deepEqual(standardDiagramSchema.parse(diagram).model, model);
  const source = buildStandardDiagram(kind, model).source;
  const svg = compile(source);
  if (kind === "er") { assert.match(source, /diamond/); assert.match(source, /<u>ISBN<\/u>/); assert.match(svg, /ISBN/); }
});

test("native rendering keeps labels literal instead of executing preprocessor or image syntax", () => {
  const model = standardModelFixture("class");
  model.classes[0].name = 'Book\n!include not-a-file <img:untrusted> $variable %load_json()';
  model.classes[0].attributes = [{ name: "books", type: "List<Book>", visibility: "private", constraints: [] }];
  const source = buildStandardDiagram("class", model).source;
  assert.doesNotMatch(source, /!include|<img:|\$variable|%load_json/);
  assert.match(source, /List&#60;Book&#62;/);
  assert.match(source, /n_6f72646572/);
  assert.equal(model.classes[0].attributes[0].type, "List<Book>");
  const svg = compile(source);
  assert.match(svg, /\$variable/);
  assert.doesNotMatch(svg, /<image\b/i);
});

for (const kind of standardDiagramKinds.filter(kind => kind !== "er")) {
  for (const fixture of modelReviewFixtures(standardModelStage(kind), kind).slice(1)) test(`quick ${kind}: ${fixture.name}`, () => {
    const model = validateStandardModel(kind, fixture.model);
    const persisted = standardDiagramSchema.parse({ id: kind, kind, title: model.title, model, status: "completed" });
    assert.deepEqual(persisted.model, model, "rich elements must not be silently dropped at persistence boundaries");
    const source = buildStandardDiagram(kind, model).source;
    compile(source);
    if (model.diagramKind === "sequence" && model.fragments.length) for (const type of ["alt", "opt", "loop", "par"]) assert.match(source, new RegExp(`\\b${type}\\b`));
  });
}
