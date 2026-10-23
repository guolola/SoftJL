// Verifies field repairs accept only the current versioned envelope and literal dotted paths.
import assert from "node:assert/strict";
import test from "node:test";
import { snapshotInputFingerprint } from "@uml-platform/contracts";
import { applyGenerationPatch, repairPathParts, valueAtRepairPath } from "./repair-patch.js";

const source = { sections: [{ title: "引言", body: ["原始正文"] }] };
const patch = {
  targetId: "document:chapter:0", baseFingerprint: snapshotInputFingerprint(source),
  changes: [{ path: "sections.0.body", value: ["修正正文"] }],
};

test("current field patches preserve untouched content and do not mutate their input", () => {
  const before = structuredClone(source);
  assert.deepEqual(applyGenerationPatch(source, patch, patch.targetId, ["sections.0.body"]), {
    sections: [{ title: "引言", body: ["修正正文"] }],
  });
  assert.deepEqual(source, before);
  assert.deepEqual(valueAtRepairPath(source, "sections.0.body"), ["原始正文"]);
});

test("bracket paths are rejected rather than translated into current dotted paths", () => {
  for (const path of ["sections[0].body", "sections.[0].body", "sections.0.body[0]"]) {
    assert.throws(() => repairPathParts(path), /必须使用点分路径/);
    assert.throws(() => valueAtRepairPath(source, path), /必须使用点分路径/);
    assert.throws(() => applyGenerationPatch(source, { ...patch, changes: [{ path, value: [] }] }, patch.targetId, ["sections"]), /必须使用点分路径/);
  }
});

test("mixed and non-current patch envelopes are rejected without losing version checks", () => {
  for (const response of [null, [], { ...patch, candidateIndex: 0 }, { ...patch, patch: {} },
    { ...patch, changes: [{ ...patch.changes[0], op: "replace" }] },
    { ...patch, changes: [{ path: "sections.0.body", replacement: [] }] },
  ]) assert.throws(() => applyGenerationPatch(source, response, patch.targetId, ["sections"]), /修复补丁/);
  assert.throws(() => applyGenerationPatch(source, { ...patch, baseFingerprint: "outdated" }, patch.targetId, ["sections"]), /基础版本不匹配/);
  assert.throws(() => applyGenerationPatch(source, { ...patch, changes: [{ path: "sections.0.title", value: "不允许" }] }, patch.targetId, ["sections.0.body"]), /越过允许范围/);
  assert.deepEqual(source.sections[0], { title: "引言", body: ["原始正文"] });
});
