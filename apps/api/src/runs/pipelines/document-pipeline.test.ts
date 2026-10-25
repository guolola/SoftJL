// Verifies document pipelines enforce requirement baseline gates before rendering artifacts.
import { strictTestModelCapability } from "../../../tests/fixtures/providers/model-capability.js";
import { completeFeasibilityImplementationPlanSchema } from "@uml-platform/contracts";
import { FEASIBILITY_IMPLEMENTATION_EXAMPLE } from "@uml-platform/prompts";
import assert from "node:assert/strict";
import test from "node:test";
import type {
  ProviderSettings,
  StartDocumentRunRequest,
} from "@uml-platform/contracts";
import type { LlmTransport } from "../../adapters/llm/llm-transport.js";
import type { DocumentLibrary } from "../../documents/library/document-library.js";
import type { PngRenderClient } from "../../adapters/render/png-render-client.js";
import { createEmptyDocumentSnapshot } from "../records/snapshots.js";
import type { RunRecord } from "../records/run-record-store.js";
import { buildRequirementBaseline } from "../baselines/requirement-baseline.js";
import { runDocumentStagePipeline } from "./document-pipeline.js";
import { fallbackDocumentSections } from "../../documents/context/document-context.js";

const providerSettings: ProviderSettings = {
  modelCapability: strictTestModelCapability("gpt-5.5"),
  apiBaseUrl: "https://ai.comfly.org",
  apiKey: "sk-test",
  model: "gpt-5.5",
};

test("incomplete feasibility sources are rejected before generation starts or external resources are used", async () => {
  const input = blockedDocumentInput();
  input.documentKind = "feasibilityStudy";
  input.requirementBaseline = null;
  input.feasibilityImplementationPlan = completeFeasibilityImplementationPlanSchema.parse(FEASIBILITY_IMPLEMENTATION_EXAMPLE);
  input.feasibilityImplementationPlan.candidates[0]!.implementation!.costEstimates = [];
  const snapshot = createEmptyDocumentSnapshot("invalid-feasibility", input);
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  let externalCalls = 0;
  const transport: LlmTransport = { async *streamChatCompletion() { externalCalls++; yield "{}"; } };
  const library = { saveGeneratedDocument: async () => { externalCalls++; } } as unknown as DocumentLibrary;
  await assert.rejects(runDocumentStagePipeline(record, input, library, "workspace", providerSettings, transport,
    async () => { externalCalls++; throw new Error("Unexpected render"); }), /当前完整实现方案/);
  assert.equal(externalCalls, 0);
  assert.equal(record.events.some(event => event.type === "stage_started"), false);
});

function blockedDocumentInput(): StartDocumentRunRequest {
  const requirementBaseline = buildRequirementBaseline({
    runId: "run-blocked-document-baseline",
    requirementText: "用户可以查看公开活动日历。用户不得查看公开活动日历。",
    rules: [
      {
        id: "REQ-001",
        type: "functional" as const,
        text: "用户可以查看公开活动日历。",

      },
      {
        id: "REQ-002",
        type: "business-rule" as const,
        text: "用户不得查看公开活动日历。",

      },
    ],
  });
  return {
    documentKind: "requirementsSpec",
    requirementText: "用户可以查看公开活动日历。",
    requirementBaseline,
    rules: [],
    requirementModels: [],
    requirementModelTraceability: [],
    requirementPlantUml: [],
    requirementSvgArtifacts: [],
    designModels: [],
    designModelTraceability: [],
    designPlantUml: [],
    designSvgArtifacts: [],
    useAiText: false,
  };
}

test("document chapters run with concurrency four and merge in template order before whole-document export", async () => {
  const input = blockedDocumentInput();
  input.requirementBaseline = buildRequirementBaseline({ runId: "valid", requirementText: "用户可以查看日历。", rules: [{ id: "R1", type: "functional" as const, text: "用户可以查看日历。",  }] });
  input.useAiText = true;
  const snapshot = createEmptyDocumentSnapshot("parallel-document", input);
  const record: RunRecord = { snapshot, events: [], listeners: new Set(), terminal: false };
  let active = 0, peak = 0, calls = 0;
  const transport: LlmTransport = { async *streamChatCompletion({ messages, runContext }) {
    active++; peak = Math.max(peak, active); calls++;
    assert.match(runContext?.subtaskId ?? "", /^document:chapter:/);
    const prompt = String(messages.at(-1)!.content);
    const context = JSON.parse(prompt.split("当前产物上下文：").at(-1)!);
    assert.ok(context.sharedTerms && context.documentOutline);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active--;
    yield JSON.stringify({ sections: context.canonicalSections.map((section: { title: string; level: number; tableHeaders?: string[] }) => ({ title: section.title, level: section.level, body: [`本章说明 ${runContext?.subtaskLabel}。`], ...(section.tableHeaders ? { table: { headers: section.tableHeaders, rows: [] } } : {}) })) });
  } };
  const library = { saveGeneratedDocument: async ({ buffer }: { buffer: Buffer }) => ({ id: "document", fileName: "requirements.docx", mimeType: snapshot.mimeType, byteLength: buffer.length }) } as unknown as DocumentLibrary;
  await runDocumentStagePipeline(record, input, library, "workspace", providerSettings, transport, async () => { throw new Error("no diagram inputs"); });
  assert.equal(peak, 4);
  assert.equal(calls, fallbackDocumentSections(input).filter((section) => section.level === 1).length);
  assert.deepEqual(snapshot.sections.map((section) => [section.level, section.title]), fallbackDocumentSections(input).map((section) => [section.level, section.title]));
  assert.equal(snapshot.status, "completed"); assert.ok(record.documentBuffer?.length);
});
