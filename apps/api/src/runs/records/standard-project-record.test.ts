// Verifies standard workspace reads require current state without migrating or dropping private execution context.
import assert from "node:assert/strict";
import test from "node:test";
import { createStandardProjectState } from "@uml-platform/contracts";
import { readStandardState } from "./standard-project-record.js";

test("current state reads retain private session and command receipts while new workspaces initialize normally", () => {
  const state = { ...createStandardProjectState("Current"), piSession: { entries: [], leafId: null }, acceptedCommands: ["command"] };
  assert.deepEqual(readStandardState({ standardProject: state }), state);
  assert.notEqual(readStandardState({ standardProject: state }), state);
  assert.deepEqual(readStandardState({}, "New"), createStandardProjectState("New"));
});

test("obsolete standard state is rejected without rewriting stored data", () => {
  for (const standardProject of [null, { description: "Old shape" }, { ...createStandardProjectState(), diagrams: [] }]) {
    const workspace = { standardProject }; const before = structuredClone(workspace);
    assert.throws(() => readStandardState(workspace));
    assert.deepEqual(workspace, before);
  }
});
