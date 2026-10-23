// Verifies standard workspace reads require current state without migrating or dropping private execution context.
import assert from "node:assert/strict";
import test from "node:test";
import { createStandardProjectState, standardDiagramKinds, type StandardProjectState } from "@uml-platform/contracts";
import { standardModelFixture } from "@uml-platform/contracts/testing";
import { createInMemoryAuthStore } from "../../auth/in-memory-auth-store.js";
import { readStandardState, updateStandardState } from "./standard-project-record.js";

test("current state reads retain private session and command receipts while new workspaces initialize normally", () => {
  const state = { ...createStandardProjectState("Current"), piSession: { entries: [], leafId: null }, acceptedCommands: ["command"] };
  assert.deepEqual(readStandardState({ standardProject: state }), state);
  assert.notEqual(readStandardState({ standardProject: state }), state);
  assert.deepEqual(readStandardState({}, "New"), createStandardProjectState("New"));
});

test("obsolete standard state is rejected without rewriting stored data", () => {
  for (const standardProject of [null, { description: "Old shape" }, { ...createStandardProjectState(), diagrams: [] },
    { ...createStandardProjectState(), conversation: [{ id: "old", role: "assistant", text: "完成", createdAt: "2026-10-23T01:00:00.000Z", durationMs: 10 }] }]) {
    const workspace = { standardProject }; const before = structuredClone(workspace);
    assert.throws(() => readStandardState(workspace));
    assert.deepEqual(workspace, before);
  }
});

test("pending unsupported-model consent survives workspace reads without being cleared or inferred", () => {
  const state: StandardProjectState = { ...createStandardProjectState("Current"), generationScope: { status: "confirmed", kinds: [] },
    unsupportedDiagramRequest: { models: ["UML 状态图"], messageId: "user:r", questionId: "scope_alternative" } };
  assert.deepEqual(readStandardState({ standardProject: state }), state);
  assert.throws(() => readStandardState({ standardProject: { ...state, unsupportedDiagramRequest: { models: [] } } }));
});

test("all eight model writes are validated before persistence and keep private context", async () => {
  const store = createInMemoryAuthStore();
  const owner = store.createUser({ username: "currentmodels", displayName: "Owner", passwordHash: "test" })!;
  const { project } = store.createProject({ ownerUserId: owner.id, name: "Current models", description: null, projectMode: "standard" });
  await updateStandardState(store, project.id, owner.id, state => {
    state.piSession = { entries: [], leafId: null }; state.acceptedCommands = ["current"];
    for (const kind of standardDiagramKinds) state.diagrams[kind] = { id: kind, kind, title: kind, status: "completed", model: standardModelFixture(kind) };
  });
  const before = structuredClone(store.getProjectWorkspace(project.id));
  for (const kind of standardDiagramKinds) {
    await assert.rejects(updateStandardState(store, project.id, owner.id, state => {
      Object.assign(state.diagrams[kind], { model: { nodes: [], edges: [] } });
    }));
    assert.deepEqual(store.getProjectWorkspace(project.id), before);
  }
  const current = readStandardState(before.state);
  assert.deepEqual(current.piSession, { entries: [], leafId: null });
  assert.deepEqual(current.acceptedCommands, ["current"]);
});
