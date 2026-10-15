// Verifies PlantUML render artifacts are normalized before run snapshots persist.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  DiagramModelSpec,
  ProviderSettings,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../../llm.js";
import type { RenderClient } from "../../../adapters/render/render-client.js";
import { createEmptySnapshot } from "../../records/snapshots.js";
import type { RunRecord } from "../../records/run-record-store.js";
import { renderArtifactWithRepair } from "./render-artifact-with-repair.js";

const providerSettings: ProviderSettings = {
  apiBaseUrl: "https://llm.test",
  apiKey: "test-key",
  model: "test-model",
};

const llmTransport: LlmTransport = {
  async *streamChatCompletion() {
    throw new Error("LLM repair should not run for a successful render");
  },
};

const useCaseModel: DiagramModelSpec = {
  diagramKind: "usecase",
  title: "用例模型",
  summary: "核心用例",
  notes: [],
  actors: [],
  useCases: [],
  systemBoundaries: [],
  relationships: [],
};

function createRecord(): RunRecord {
  return {
    snapshot: createEmptySnapshot("run-render-normalize", "需求", ["usecase"]),
    events: [],
    listeners: new Set(),
    terminal: false,
    metadata: { createdAt: new Date().toISOString() },
  };
}

test("renderArtifactWithRepair strips PlantUML text sizing attributes from persisted SVG", async () => {
  const renderClient: RenderClient = async () => ({
    svg: `<svg><text textLength="20" lengthAdjust="spacingAndGlyphs">ok</text><text textLength='12' lengthAdjust='spacing'>single</text></svg>`,
    renderMeta: {
      engine: "plantuml",
      generatedAt: new Date().toISOString(),
      sourceLength: 10,
      durationMs: 1,
    },
  });

  const result = await renderArtifactWithRepair(
    createRecord(),
    providerSettings,
    llmTransport,
    renderClient,
    useCaseModel,
    {
      diagramKind: "usecase",
      source: "@startuml\n@enduml",
    },
  );

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.doesNotMatch(result.svgArtifact.svg, /textLength=/);
  assert.doesNotMatch(result.svgArtifact.svg, /lengthAdjust=/);
  assert.match(result.svgArtifact.svg, /<text>ok<\/text>/);
  assert.match(result.svgArtifact.svg, /<text>single<\/text>/);
});

test("a valid SVG containing a Graphviz error picture is a render failure, never a publishable model", async () => {
  for (const error of ["Dot Executable: /opt/local/bin/dot", "Dot executable does not exist", "Cannot find Graphviz"]) {
    const record = createRecord();
    const result = await renderArtifactWithRepair(record, providerSettings, llmTransport, async () => ({
      svg: `<svg><text>${error}</text></svg>`,
      renderMeta: { engine: "plantuml", generatedAt: new Date().toISOString(), sourceLength: 10, durationMs: 1 },
    }), useCaseModel, { diagramKind: "usecase", source: "@startuml\n@enduml" });
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.match(result.errorMessage, /Graphviz/);
    assert.equal("svgArtifacts" in record.snapshot && record.snapshot.svgArtifacts.length, 0);
  }
});
