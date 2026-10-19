// Verifies report sections use saved IDs, including scoped models and cross-stage diagrams.
import assert from "node:assert/strict";
import test from "node:test";
import { startDocumentRunRequestSchema, type DocumentKind } from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { bindDocumentDiagramReferences, documentDiagramAssets } from "./document-diagram-references.js";
import { fallbackDocumentSections, mergeDocumentSectionsWithTemplate } from "./document-context.js";
import { renderDocumentBuffer } from "../render/document-renderer.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4l8AAAAASUVORK5CYII=", "base64");
const renderMeta = { engine: "plantuml" as const, generatedAt: "2026-10-18T00:00:00Z", sourceLength: 30, durationMs: 1 };

function reportInput(documentKind: DocumentKind) {
  const requirementModels = ["function", "activity", "usecase", "class", "deployment", "prototype", "analysis", "context"].map(kind => ({
    ...modelFixture("requirements", kind), modelId: kind === "activity" ? "shared-identity" : `requirement-${kind}-custom`,
    ...(kind === "analysis" ? { sourceUseCaseId: "case" } : {}),
  }));
  const designModels = ["architecture", "sequence", "class", "navigation", "table", "component", "deployment"].map(kind => ({
    ...modelFixture("design", kind), modelId: kind === "architecture" ? "shared-identity" : `design-${kind}-custom`,
    ...(kind === "sequence" ? { sourceUseCaseId: "case" } : {}),
  }));
  const plantUml = (models: typeof requirementModels | typeof designModels) => models.map(model => ({ diagramKind: model.diagramKind,
    modelId: model.modelId, source: `@startuml\n' ${model.modelId}\n@enduml` }));
  const svg = (models: typeof requirementModels | typeof designModels) => models.map(model => ({ diagramKind: model.diagramKind,
    modelId: model.modelId, svg: "<svg />", renderMeta }));
  return startDocumentRunRequestSchema.parse({ documentKind, requirementText: "图书馆管理系统", useAiText: false,
    feasibilityImplementationPlan: structuredClone(FEASIBILITY_IMPLEMENTATION_EXAMPLE),
    requirementModels, designModels, requirementPlantUml: plantUml(requirementModels), designPlantUml: plantUml(designModels),
    requirementSvgArtifacts: svg(requirementModels), designSvgArtifacts: svg(designModels) });
}

for (const kind of ["feasibilityStudy", "requirementsSpec", "softwareDesignSpec"] as const) {
  test(`${kind} embeds every available diagram using custom model IDs`, async () => {
    const input = reportInput(kind);
    const sections = fallbackDocumentSections(input);
    const assets = documentDiagramAssets(input);
    const illustrated = sections.filter(section => section.diagramKind);
    assert.ok(illustrated.length > 0);
    assert.ok(illustrated.every(section => section.diagramModelId && assets.plantUml.has(section.diagramModelId)));
    assert.ok(illustrated.every(section => assets.svg.has(section.diagramModelId!)));
    const missing: string[] = [];
    const calls: Array<{ modelId?: string; source: string }> = [];
    const buffer = await renderDocumentBuffer(kind, sections, assets.plantUml, assets.svg, async request => {
      calls.push(request); return { png, renderMeta };
    }, missing, { includeTableOfContents: false, autoNumberHeadings: false });
    assert.ok(buffer.length > 0);
    assert.deepEqual(missing, []);
    assert.equal(calls.length, illustrated.length);
    if (kind === "softwareDesignSpec") {
      assert.match(assets.plantUml.get("requirement:shared-identity")!, /shared-identity/);
      assert.ok(illustrated.some(section => section.diagramModelId === "requirement:shared-identity"));
      assert.ok(illustrated.some(section => section.diagramModelId === "shared-identity"));
    }
  });
}

test("generated prose cannot replace the template's diagram identity", () => {
  const section = { level: 2 as const, title: "领域概念模型", body: ["模板正文"], diagramKind: "class", diagramModelId: "saved-domain" };
  const merged = mergeDocumentSectionsWithTemplate([section], [{ ...section, body: ["生成的正文"], diagramModelId: "invented-id" }]);
  assert.equal(merged[0]!.diagramModelId, "saved-domain");
  assert.deepEqual(merged[0]!.body, ["生成的正文"]);
});

test("scoped diagrams stay distinct and an unknown explicit ID never selects another model", () => {
  const input = reportInput("requirementsSpec");
  const first = input.requirementModels.find(model => model.diagramKind === "analysis")!;
  input.requirementModels.push({ ...first, modelId: "analysis-second" });
  const sections = bindDocumentDiagramReferences(input, [first.modelId!, "analysis-second", "unknown-analysis"].map(id => ({
    level: 2, title: id, body: [], diagramKind: "analysis", diagramModelId: id,
  })));
  assert.deepEqual(sections.map(section => section.diagramModelId), [first.modelId, "analysis-second", "unknown-analysis"]);
  assert.throws(() => bindDocumentDiagramReferences(input, [{ level: 2, title: "分析", body: [], diagramKind: "analysis" }]), /引用不明确/);
});

test("genuinely absent sources remain missing instead of receiving a type alias", () => {
  const input = reportInput("requirementsSpec");
  input.requirementPlantUml = input.requirementPlantUml.filter(item => item.diagramKind !== "deployment");
  input.requirementSvgArtifacts = input.requirementSvgArtifacts.filter(item => item.diagramKind !== "deployment");
  const section = fallbackDocumentSections(input).find(item => item.diagramKind === "deployment")!;
  assert.equal(documentDiagramAssets(input).plantUml.has(section.diagramModelId!), false);
});

test("explicit artifact IDs remain exact even when an ID equals the diagram kind", () => {
  const input = reportInput("requirementsSpec");
  const model = input.requirementModels.find(item => item.diagramKind === "class")!;
  input.requirementModels.push({ ...model, modelId: "class" });
  const [section] = bindDocumentDiagramReferences(input, [{ level: 2, title: "类图", body: [], diagramKind: "class", diagramModelId: "class" }]);
  assert.equal(section!.diagramModelId, "class");
});
