// Verifies renderer output and renders authorized model corrections without post-render review.
import { strictTestModelCapability } from "../../../../tests/fixtures/providers/model-capability.js";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveTableModel, getStageModelSchemas, type ModelingStage } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import type { RunRecord } from "../../records/run-record-store.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import { reviewRenderedArtifact } from "./review-rendered-artifact.js";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "../../../adapters/plantuml/model-renderer.js";
import { verifySvgMapping } from "../../../../tests/fixtures/render/svg-mapping-verifier.js";

// JAVA_HOME names the installation; only Windows uses the .exe suffix.
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : process.platform === "win32" ? "C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin/java.exe" : "java";

test("every stage/model profile preserves its elements and relations through the real SVG renderer", { timeout: 90000 }, () => {
  const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
  const folder = resolve(root, "plantuml");
  const jar = readdirSync(folder).find((file) => /^plantuml-.*\.jar$/.test(file) && !/sources|javadoc/.test(file));
  assert.ok(jar, "Build the repository PlantUML runtime first");
  for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) {
    for (const schema of getStageModelSchemas(stage)) {
      const kind = schema.shape.diagramKind.value;
      let model = modelFixture(stage, kind);
      if (model.diagramKind === "table") model = deriveTableModel(model);
      const artifact = stage === "design"
        ? generateDesignPlantUmlArtifacts([model as Parameters<typeof generateDesignPlantUmlArtifacts>[0][number]])[0]!
        : generatePlantUmlArtifacts([model as Parameters<typeof generatePlantUmlArtifacts>[0][number]], stage)[0]!;
      const value = spawnSync(java, ["-Djava.awt.headless=true", "-jar", resolve(folder, jar), "-charset", "UTF-8", "-pipe", "-tsvg"], { input: Buffer.from(artifact.source), timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
      assert.equal(value.status, 0, `${stage}.${kind}: ${value.error ?? ""}${value.stderr}`);
      const result = verifySvgMapping(value.stdout.toString("utf8"), artifact.renderMapping, model.modelId!, kind);
      if (kind !== "function" && !(kind === "activity" && artifact.renderMapping?.mode === "native")) assert.ok(result.identifiable, `${stage}.${kind}: renderer must emit SVG identities, not a fallback error picture`);
      assert.deepEqual(result.findings, [], `${stage}.${kind}: real SVG mapping`);
    }
  }
});

test("real PlantUML renders the corrected FK model without a PNG recheck", async () => {
  const root = fileURLToPath(new URL("../../../../../../", import.meta.url));
  const folder = resolve(root, "plantuml");
  const jar = readdirSync(folder).find((file) => /^plantuml-.*\.jar$/.test(file) && !/sources|javadoc/.test(file));
  assert.ok(jar, "Build the repository PlantUML runtime first");
  const table = modelFixture("design", "table"); if (table.diagramKind !== "table") throw new Error("fixture");
  const candidate = deriveTableModel(table);
  const record: RunRecord = { snapshot: createEmptySnapshot("real-review", "需求", ["class"]), events: [], listeners: new Set(), terminal: false };
  const compile = (source: string) => {
    const value = spawnSync(java, ["-Djava.awt.headless=true", "-jar", resolve(folder, jar), "-charset", "UTF-8", "-pipe", "-tsvg"], { input: Buffer.from(source), timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(value.status, 0, `${value.error ?? ""}${value.stderr}`);
    return value.stdout;
  };
  const reviewed = await reviewRenderedArtifact({ record, model: table, mutable: true, basis: { stage: "design" },
    providerSettings: { modelCapability: strictTestModelCapability("selected-model"), apiBaseUrl: "https://example.test", apiKey: "test", model: "selected-model" },
    llmTransport: { async *streamChatCompletion(input) {
      const prompt = input.messages.at(-1)!.content;
      if (typeof prompt === "string" && prompt.includes("请基于本对话中上一版完整模型")) yield JSON.stringify(candidate);
      else {
        assert.equal(typeof prompt, "string");
        yield '{"passed":true,"issues":[],"findings":[]}';
      }
    } },
    renderClient: async (artifact) => { const svg = compile(artifact.source).toString("utf8"); assert.match(svg, /<svg/); return { svg, renderMeta: { engine: "PlantUML", generatedAt: new Date().toISOString(), sourceLength: artifact.source.length, durationMs: 1 } }; },
  });
  assert.equal(reviewed.review.status, "passed"); assert.equal(reviewed.review.repairAttempts, 1); assert.equal(reviewed.review.attempts, 0);
  assert.equal(reviewed.review.renderStatus, "passed"); assert.equal(reviewed.review.imageStatus, "skipped");
  assert.equal(reviewed.model.diagramKind, "table");
  assert.ok(reviewed.review.inputFingerprint);
});
