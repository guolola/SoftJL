// Verifies versioned field repairs for feasibility candidates and document chapters.
import assert from "node:assert/strict";
import test from "node:test";
import { documentContentResultSchema, MAX_GENERATION_REPAIR_ATTEMPTS, snapshotInputFingerprint } from "@uml-platform/contracts";
import { GenerationRepairSession } from "./generation-repair.js";
import { restoreJsonPunctuation } from "../../../normalizers/structured-output/repair-patch.js";

test("local JSON punctuation recovery preserves complete values and refuses incomplete strings and values", () => {
  assert.equal(restoreJsonPunctuation('{"items":["a","b",],'), '{"items":["a","b",],');
  assert.deepEqual(JSON.parse(restoreJsonPunctuation('{"items":["a","b",]')), { items: ["a", "b"] });
  for (const raw of ['{"name":"unfinished', '{"value":', '{"value":tru', '{"actors":[', '{"implementation":{']) assert.equal(restoreJsonPunctuation(raw), raw);
});

test("the default budget allows five repairs and refuses a sixth", () => {
  const session = new GenerationRepairSession("document:chapter:1", {}, ["sections"]);
  session.accept('{"sections":[{"body":[]}]}');
  for (let round = 1; round <= MAX_GENERATION_REPAIR_ATTEMPTS; round++) {
    session.prepare(new Error("sections.0.title: required"));
    assert.equal(session.metadata.round, round);
  }
  assert.throws(() => session.prepare(new Error("still invalid")), /5 次/);
});

test("implementation patch cannot edit another candidate and omits that candidate from prompt", () => {
  const plan = { candidates: [{ name: "selected", implementation: { costs: [{ id: "cost", minimum: "bad", maximum: 100 }] } }, { name: "OTHER_CANDIDATE", implementation: { costs: [{ minimum: 10 }] } }] };
  const session = new GenerationRepairSession("implementation", {}, []);
  session.accept(JSON.stringify(plan));
  const prompt = session.prepare(new Error("invalid amount"), { paths: ["candidates.0.implementation.costs.0.minimum"] });
  assert.ok(!prompt.includes("OTHER_CANDIDATE"));
  const patch = { targetId: "implementation", baseFingerprint: snapshotInputFingerprint(plan), changes: [{ path: "candidates.1.name", value: "overwritten" }] };
  assert.throws(() => session.accept(JSON.stringify(patch)), /允许范围/);
  const accepted = JSON.parse(session.accept(JSON.stringify({ ...patch, changes: [{ path: "candidates.0.implementation.costs.0.minimum", value: 50 }] })));
  assert.deepEqual(accepted.candidates[1], plan.candidates[1]);
});

test("document patch keeps directory and unrelated paragraphs immutable", () => {
  const document = { sections: [{ title: "引言", level: 1, body: ["待补充"] }, { title: "边界", level: 1, body: ["不得删除历史记录"] }] };
  const session = new GenerationRepairSession("document:chapter:1", {}, ["sections"]);
  session.accept(JSON.stringify(document));
  session.prepare(new Error("placeholder"), { paths: ["sections.0.body"] });
  const base = { targetId: "document:chapter:1", baseFingerprint: snapshotInputFingerprint(document) };
  for (const path of ["sections.0.title", "sections.1.body", "sections.0.__proto__.polluted"]) assert.throws(() => session.accept(JSON.stringify({ ...base, changes: [{ path, value: "wrong" }] })));
  const result = JSON.parse(session.accept(JSON.stringify({ ...base, changes: [{ path: "sections.0.body", value: ["系统用于处理订单。"] }] })));
  assert.deepEqual(result.sections[1], document.sections[1]);
});

test("field repairs reject unversioned candidate patches and full replacement responses", () => {
  const plan = { candidates: [{ implementation: { summary: "before" } }] };
  const session = new GenerationRepairSession("implementation", {}, []);
  session.accept(JSON.stringify(plan));
  session.prepare(new Error("invalid summary"), { paths: ["candidates.0.implementation.summary"] });
  const before = structuredClone(plan);
  for (const response of [
    { candidateIndex: 0, patch: { summary: "after" } },
    { candidates: [{ implementation: { summary: "after" } }] },
    { targetId: "implementation", baseFingerprint: snapshotInputFingerprint(plan), candidateIndex: 0, patch: { summary: "after" } },
  ]) assert.throws(() => session.accept(JSON.stringify(response)), /修复补丁只能包含/);
  const current = JSON.parse(session.accept(JSON.stringify({
    targetId: "implementation", baseFingerprint: snapshotInputFingerprint(plan),
    changes: [{ path: "candidates.0.implementation.summary", value: "after" }],
  })));
  assert.equal(current.candidates[0].implementation.summary, "after");
  assert.deepEqual(plan, before);
});

test("envelope-level schema errors select explicit regeneration instead of an invalid empty path", () => {
  const session = new GenerationRepairSession("document:chapter:1", {}, ["sections"]);
  session.accept('{"sections":[]}');
  session.prepare({ issues: [{ path: [], message: "invalid envelope" }] });
  assert.equal(session.metadata.mode, "scoped-regeneration");
  assert.deepEqual(session.metadata.paths, ["sections"]);
});

test("missing document fields retain their chapter position and current field schema", () => {
  const document = { sections: [
    { title: "引言", level: 1, body: ["KEEP_FIRST_CHAPTER"] },
    { level: 1, body: ["当前系统的范围。"] },
  ] };
  const session = new GenerationRepairSession("document", "UPSTREAM_SOURCE", ["sections"], 5, undefined, documentContentResultSchema);
  session.accept(JSON.stringify(document));
  const result = documentContentResultSchema.safeParse(document);
  assert.equal(result.success, false);
  if (result.success) throw new Error("Expected a missing title diagnostic");
  const prompt = session.prepare(result.error);
  assert.deepEqual(session.metadata.paths, ["sections.1.title"]);
  assert.match(prompt, /"actualType":"missing"/);
  assert.match(prompt, /"expectedSchema":\{"type":"string"/);
  assert.doesNotMatch(prompt, /KEEP_FIRST_CHAPTER|UPSTREAM_SOURCE/);
  const repaired = JSON.parse(session.accept(JSON.stringify({
    targetId: "document", baseFingerprint: snapshotInputFingerprint(document),
    changes: [{ path: "sections.1.title", value: "边界" }],
  })));
  assert.deepEqual(repaired.sections[0], document.sections[0]);
  assert.equal(documentContentResultSchema.safeParse(repaired).success, true);
});
