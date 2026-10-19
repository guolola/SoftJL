// Exercises durable context rewinds, root restoration and stale-client guards.
import test from "node:test";
import assert from "node:assert/strict";
import { createStandardProjectState, type StandardProjectState } from "@uml-platform/contracts";
import { restoreStandardSession } from "./standard-agent-session.js";
import { applyConversationRevision, resolveConversationRevision, conversationTurnMarker } from "./standard-conversation-revision.js";

function fixture() {
  const manager = restoreStandardSession("p");
  manager.appendCustomEntry(conversationTurnMarker, { messageId: "u1", rounds: [] });
  manager.appendMessage({ role: "user", content: "obsolete first turn", timestamp: 1 });
  manager.appendCustomMessageEntry("response", "old reply", false);
  manager.appendCustomEntry(conversationTurnMarker, { messageId: "u2", rounds: [] });
  manager.appendMessage({ role: "user", content: "second turn", timestamp: 2 });
  const state: StandardProjectState = { ...createStandardProjectState("obsolete first turn"), piSession: { entries: manager.getEntries(), leafId: manager.getLeafId() },
    diagrams: { class: { id: "class", kind: "class", title: "Saved", status: "completed", svg: "<svg>keep</svg>" } },
    conversation: [{ id: "u1", role: "user", text: "obsolete first turn", createdAt: "1", status: "completed" },
      { id: "a1", role: "assistant", text: "old reply", createdAt: "1", status: "completed" },
      { id: "u2", role: "user", text: "second turn", createdAt: "2", status: "completed", quote: { text: "reference" },
        attachments: [{ id: "f", name: "r.txt", type: "document", contentType: "text/plain", text: "requirements" }] },
      { id: "a2", role: "assistant", text: "second reply", createdAt: "2", status: "completed" }] };
  return state;
}

test("editing the first turn excludes all abandoned context after repeated durable restores", () => {
  const state = fixture(); const entries = state.piSession!.entries.length;
  applyConversationRevision(state, { operation: "edit", messageId: "u1", expectedHeadId: "a2", message: "replacement" });
  assert.deepEqual(state.conversation, []); assert.equal(state.description, "replacement");
  assert.equal(state.diagrams.class!.svg, "<svg>keep</svg>"); assert.equal(state.piSession!.entries.length, entries);
  const restored = restoreStandardSession("p", state.piSession);
  assert.doesNotMatch(JSON.stringify(restored.getBranch()), /obsolete first turn|second turn/);
  restored.appendMessage({ role: "user", content: "replacement", timestamp: 3 });
  const again = restoreStandardSession("p", { entries: restored.getEntries(), leafId: restored.getLeafId() });
  assert.match(JSON.stringify(again.getBranch()), /replacement/); assert.doesNotMatch(JSON.stringify(again.getBranch()), /obsolete first turn/);
});

test("regeneration reuses the owning user turn and preserves its prefix, references and attachments", () => {
  const state = fixture();
  const command = { operation: "regenerate" as const, messageId: "a2", expectedHeadId: "a2" };
  const resolved = resolveConversationRevision(state, command);
  assert.equal(resolved.message, "second turn"); assert.deepEqual(resolved.quote, { text: "reference" }); assert.equal(resolved.attachments?.length, 1);
  applyConversationRevision(state, command);
  assert.deepEqual(state.conversation!.map(item => item.id), ["u1", "a1"]);
  const context = JSON.stringify(restoreStandardSession("p", state.piSession).getBranch());
  assert.match(context, /obsolete first turn/); assert.doesNotMatch(context, /second turn/);
  assert.throws(() => applyConversationRevision(state, command), /对话已变化/);
});

test("revisions without current checkpoints are rejected without changing saved context", () => {
  const state = fixture(); state.piSession!.entries = state.piSession!.entries.filter((entry: any) => entry.customType !== conversationTurnMarker);
  const before = structuredClone(state);
  assert.throws(() => resolveConversationRevision(state, { operation: "regenerate", messageId: "a2", expectedHeadId: "a2" }), /缺少当前上下文检查点/);
  assert.throws(() => applyConversationRevision(state, { operation: "regenerate", messageId: "a2", expectedHeadId: "a2" }), /缺少当前上下文检查点/);
  assert.deepEqual(state, before);
  assert.throws(() => resolveConversationRevision(fixture(), { operation: "edit", messageId: "a1", expectedHeadId: "a2" }), /未找到/);
});
