// Checks shared attachment limits and engineering command compatibility at the public contract boundary.
import assert from "node:assert/strict";
import test from "node:test";
import { startRunCommandSchema, startRunRequestSchema } from "./runs.js";
import { standardAttachmentSchema } from "./standard-project.js";

const attachment = { id: "doc", name: "scope.md", type: "document", contentType: "text/markdown", text: "用户可以创建预约。" };

test("engineering inputs accept the exact quick-modeling document schema and reasoning switch", () => {
  const command = startRunCommandSchema.parse({ projectId: "p", requirementText: "", selectedDiagrams: [], attachments: [attachment], reasoning: true });
  assert.deepEqual(command.attachments, [standardAttachmentSchema.parse(attachment)]);
  assert.equal(command.reasoning, true);
  assert.equal(startRunRequestSchema.safeParse({ requirementText: "", selectedDiagrams: [], attachments: [attachment] }).success, true);
  assert.equal(startRunRequestSchema.safeParse({ requirementText: "", selectedDiagrams: [] }).success, false);
});

test("both project modes reject unsupported MIME types and more than four attachments", () => {
  assert.equal(standardAttachmentSchema.safeParse({ ...attachment, contentType: "application/pdf" }).success, false);
  assert.equal(startRunCommandSchema.safeParse({ projectId: "p", selectedDiagrams: [], attachments: Array(5).fill(attachment) }).success, false);
});
