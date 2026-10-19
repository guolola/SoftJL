// Protects SDK transcript restoration across prompt/tool messages, context edits and compaction metadata.
import test from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai";
import { restoreStandardSession } from "./standard-agent-session.js";

const usage = { input: 20, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 30,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

test("restores SDK 1.x prompt declarations and remaps edits to their restored message IDs", () => {
  const original = SessionManager.inMemory("/uml-projects/restoration");
  original.appendMessage({ role: "system", content: "Use only project tools.", timestamp: 0, toolsAdded: [{ name: "read_project", description: "Read this project", parameters: { type: "object", properties: {} } }] });
  const user = original.appendMessage({ role: "user", content: "旧描述", timestamp: 1 });
  original.appendContextEdit(user, { content: "修订后的描述" });
  const restored = restoreStandardSession("restoration", { entries: original.getEntries(), leafId: original.getLeafId() });
  const messages = restored.buildSessionContext().messages;
  assert.equal(getCurrentSystemPrompt(messages), "Use only project tools.");
  assert.deepEqual(getCurrentTools(messages).map(tool => tool.name), ["read_project"]);
  assert.equal(messages.find(message => message.role === "user")?.content, "修订后的描述");
  assert.equal(restored.getEntries().filter(entry => entry.type === "context_edit").length, 1);
});

test("retains compaction usage and standalone SDK usage entries across restoration", () => {
  const original = SessionManager.inMemory("/uml-projects/compaction");
  original.appendMessage({ role: "system", content: "Project memory", timestamp: 0, toolsAdded: [] });
  const kept = original.appendMessage({ role: "user", content: "保留当前问题", timestamp: 1 });
  original.appendCompaction("已完成需求澄清", kept, 1000, undefined, true, usage);
  original.appendUsage("cache_warm", "uml-managed", "test", usage);
  const restored = restoreStandardSession("compaction", { entries: original.getEntries(), leafId: original.getLeafId() });
  const entries = restored.getEntries();
  assert.deepEqual(entries.find(entry => entry.type === "compaction")?.usage, usage);
  assert.deepEqual(entries.find(entry => entry.type === "usage")?.usage, usage);
  assert.equal(restored.buildSessionContext().messages.some(message => message.role === "user" && message.content === "保留当前问题"), true);
});

test("restores a fully compacted session with its own retained boundary", () => {
  const original = SessionManager.inMemory("/uml-projects/compacted");
  original.appendMessage({ role: "system", content: "Keep project constraints.", timestamp: 0, toolsAdded: [] });
  original.appendCompaction("全部历史已压缩为项目摘要", null, 1000, undefined, true, usage);
  const restored = restoreStandardSession("compacted", { entries: original.getEntries(), leafId: original.getLeafId() });
  const compacted = restored.getEntries().find(entry => entry.type === "compaction");
  assert.equal(compacted?.type, "compaction");
  if (compacted?.type !== "compaction") throw new Error("Missing compaction");
  assert.equal(compacted.firstKeptEntryId, compacted.id);
  assert.deepEqual(compacted.usage, usage);
  assert.equal(getCurrentSystemPrompt(restored.buildSessionContext().messages), "Keep project constraints.");
});
