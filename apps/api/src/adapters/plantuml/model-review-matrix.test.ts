// Checks real SVG review verdicts for all supported profiles, complex legal graphs and deliberate omissions.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getStageModelSchemas, type ModelingStage } from "@uml-platform/contracts";
import { modelReviewFixtures } from "../../../../../packages/contracts/src/testing/model-review-fixtures.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "./model-renderer.js";
import { verifySvgMapping } from "../../normalizers/diagrams/svg-review.js";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : process.platform === "win32" ? "C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin/java.exe" : "java";
function draw(source: string) {
  const rendered = spawnSync(java, ["-Djava.awt.headless=true", "-jar", resolve(root, "plantuml/build/libs/plantuml-1.2026.3beta8.jar"), "-charset", "UTF-8", "-pipe", "-tsvg"], { input: source, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
  assert.equal(rendered.status, 0, `${rendered.error ?? ""}${rendered.stderr}`);
  assert.doesNotMatch(rendered.stdout, /Syntax Error|Cannot find Graphviz|Dot executable does not exist/);
  return rendered.stdout;
}

// Remove actual drawing groups, including nested shapes, rather than just deleting metadata.
function removeGroups(svg: string, predicate: (tag: string) => boolean) {
  const tags = /<g\b[^>]*>|<\/g>/g;
  const spans: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = tags.exec(svg))) {
    if (match[0].startsWith("</") || !predicate(match[0])) continue;
    const start = match.index; let depth = 1;
    while (depth && (match = tags.exec(svg))) depth += match[0].startsWith("</") ? -1 : 1;
    assert.equal(depth, 0); spans.push([start, tags.lastIndex]);
  }
  for (const [start, end] of spans.reverse()) svg = svg.slice(0, start) + svg.slice(end);
  return svg;
}

test("real rendered relationship symbols and ownership must agree with the model", () => {
  const usecase = modelReviewFixtures("requirements", "usecase")[0]!.model;
  const usecaseArtifact = generatePlantUmlArtifacts([usecase as never], "requirements")[0]!;
  const association = usecaseArtifact.renderMapping!.relationships[0]!;
  assert.equal(association.symbol, "--");
  const wrongSymbol = draw(usecaseArtifact.source.replace(association.statement!, association.statement!.replace("--", "..>")));
  assert.ok(verifySvgMapping(wrongSymbol, usecaseArtifact.renderMapping, usecase.modelId!, "usecase").findings.some((item) => item.code === "wrong-svg-relationship-symbol" && item.relationshipId === association.relationshipId));

  const architecture = modelReviewFixtures("design", "architecture")[1]!.model;
  if (architecture.diagramKind !== "architecture") throw new Error("architecture fixture required");
  const expected = generateDesignPlantUmlArtifacts([architecture])[0]!;
  const wrongOwner = structuredClone(architecture);
  wrongOwner.components.find((item) => item.id === "c")!.packageId = "root";
  wrongOwner.relationships = wrongOwner.relationships.filter((item) => item.type !== "contains");
  const moved = generateDesignPlantUmlArtifacts([wrongOwner])[0]!;
  assert.ok(verifySvgMapping(draw(moved.source), expected.renderMapping, architecture.modelId!, "architecture").findings.some((item) => item.code === "wrong-svg-owner" && item.elementId === "c"));
});

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`${stage}.${kind}: real legal complex SVGs pass and removed nodes/links cannot pass`, { timeout: 90000 }, () => {
    for (const { name, model } of modelReviewFixtures(stage, kind)) {
      const artifact = (stage === "design" ? generateDesignPlantUmlArtifacts([model as never]) : generatePlantUmlArtifacts([model as never], stage))[0]!;
      const svg = draw(artifact.source);
      const check = verifySvgMapping(svg, artifact.renderMapping, model.modelId!, kind);
      assert.deepEqual(check.findings, [], `${name}: no false positives`);
      if (kind === "function") { assert.equal(check.identifiable, false, "MindMap has no stable identities; never assert program mapping success"); continue; }
      assert.equal(check.identifiable, true, name); assert.equal(check.inconclusive, undefined, name);
      if (kind === "activity" && artifact.source.includes('diamond " " as')) {
        const legacy = draw(artifact.source.replace(/diamond " " as (n_[\da-f]+)/g, "<> $1"));
        const legacyCheck = verifySvgMapping(legacy, artifact.renderMapping, model.modelId!, kind);
        assert.deepEqual(legacyCheck.findings, [], "unmarked but visible diamonds must not be declared missing");
        assert.ok(legacyCheck.inconclusive?.length, "unsupported identity must remain incomplete");
      }
      if (name === "基本模型") {
        const label = artifact.renderMapping!.elements.find((element) => element.label && element.statement?.includes(element.label));
        if (label?.label) {
          const badLabel = draw(artifact.source.replace(label.label, "错误显示名称"));
          assert.ok(verifySvgMapping(badLabel, artifact.renderMapping, model.modelId!, kind).findings.some((item) => item.code === "wrong-svg-element-label"), "wrong visible label detected");
        }
        const edge = artifact.renderMapping!.relationships.find((item) => item.sourceId !== item.targetId && item.statement && !item.statement.startsWith("'") && item.symbol && !["--", "..", "<-->", "<..>"].includes(item.symbol));
        const aliases = new Map(artifact.renderMapping!.elements.map((item) => [item.elementId, item.alias]));
        if (edge?.statement && aliases.has(edge.sourceId) && aliases.has(edge.targetId)) {
          const source = aliases.get(edge.sourceId)!, target = aliases.get(edge.targetId)!;
          const reversed = edge.statement.replace(source, "__swap_source__").replace(target, source).replace("__swap_source__", target);
          const badDirection = draw(artifact.source.replace(edge.statement, reversed));
          assert.ok(verifySvgMapping(badDirection, artifact.renderMapping, model.modelId!, kind).findings.some((item) => item.relationshipId === edge.relationshipId), "wrong source/target direction detected");
        }
      }
      const alias = artifact.renderMapping!.elements[0]!.alias;
      const missingNode = removeGroups(svg, (tag) => tag.includes(`data-qualified-name="${alias}"`) || tag.includes(`.${alias}"`) || tag.includes(`id="elem_${alias}"`));
      assert.notEqual(missingNode, svg);
      assert.ok(verifySvgMapping(missingNode, artifact.renderMapping, model.modelId!, kind).findings.some((item) => item.code === "missing-svg-element"), `${name}: actual node omission detected`);
      const drawnEdges = artifact.renderMapping!.relationships.filter((edge) => edge.statement && !edge.statement.trimStart().startsWith("'"));
      if (drawnEdges.length) {
        const missingLinks = removeGroups(svg, (tag) => /class="(?:link|message)"/.test(tag));
        assert.ok(verifySvgMapping(missingLinks, artifact.renderMapping, model.modelId!, kind).findings.some((item) => item.code === "missing-svg-relationship"), `${name}: actual line omission detected`);
      }
    }
  });
}
