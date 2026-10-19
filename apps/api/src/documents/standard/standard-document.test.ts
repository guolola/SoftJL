// Verifies ordinary files keep snapshots and use the shared style/library contract required by Word editing.
import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { createStandardProjectState } from "@uml-platform/contracts";
import { buildStandardDocument, standardDocumentSections } from "./standard-document.js";
import { publishStandardDocument } from "./publish-standard-document.js";
import type { DocumentLibrary } from "../library/document-library.js";

function entry(buffer: Buffer, name: string) {
  for (let at = 0; at < buffer.length - 46; at++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) continue;
    const length = buffer.readUInt16LE(at + 28);
    if (buffer.subarray(at + 46, at + 46 + length).toString() !== name) continue;
    const local = buffer.readUInt32LE(at + 42);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + buffer.readUInt32LE(at + 20));
    return (buffer.readUInt16LE(at + 10) === 8 ? inflateRawSync(compressed) : compressed).toString();
  }
  throw new Error(`Missing DOCX entry: ${name}`);
}

test("ordinary export applies shared document styling and preserves generated diagram snapshots", async () => {
  const state = createStandardProjectState("图书系统");
  state.documents = { requirementsSpec: { title: "需求规格说明书", generatedAt: "now", markdown: "# 需求范围\n支持借阅。\n## 约束\n只允许学生借阅。", diagrams: [],
    documentStyle: { presetName: "courseDesign", includeTableOfContents: true, autoNumberHeadings: true, body: { eastAsiaFont: "仿宋", sizePt: 18 } } } };
  state.diagrams.activity = { id: "activity", kind: "activity", title: "之后新增的图", status: "completed", source: "must not render" };
  const render = async () => { throw new Error("Must use the empty original snapshot"); };
  const buffer = await buildStandardDocument(state, "requirementsSpec", render);
  assert.match(entry(buffer, "word/styles.xml"), /仿宋/);
  assert.match(entry(buffer, "word/document.xml"), /支持借阅/);
  assert.match(entry(buffer, "word/document.xml"), /TOC/);
  let input: Parameters<DocumentLibrary["saveGeneratedDocument"]>[0] | undefined;
  const library = { saveGeneratedDocument: async (value: typeof input) => { input = value; return { id: "document-1" }; } } as unknown as DocumentLibrary;
  assert.equal(await publishStandardDocument({ state, kind: "requirementsSpec", projectId: "project-a", userId: "owner", library, render }), "document-1");
  assert.equal(input!.workspaceId, "project-project-a");
  assert.equal(input!.sourceRunId, null);
  assert.equal(input!.createdByUserId, "owner");
  assert.equal(standardDocumentSections(state.documents.requirementsSpec!.markdown, "说明书").length, 2);
});
