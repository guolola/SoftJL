// Covers capability gates and decoded byte budgets before modeling calls consume usage.
import assert from "node:assert/strict";
import test from "node:test";
import type { ModelCapacity, ModelingAttachment } from "@uml-platform/contracts";
import { modelingInputError, validModelingImage } from "./modeling-input-validation.js";

const capacity: ModelCapacity = { context: 128000, output: 8192, source: "models.dev", matchedId: "vision", updatedAt: null, capabilities: { vision: true, reasoning: true, toolCall: true } };
const image: ModelingAttachment = { id: "i", name: "flow.png", type: "image", contentType: "image/png", data: "iVBORw0KGgo=" };

test("requires explicitly confirmed reasoning and image capabilities", () => {
  assert.match(modelingInputError({ text: "需求", reasoning: true }, undefined)!, /推理/);
  assert.match(modelingInputError({ text: "需求", attachments: [image] }, undefined)!, /图片/);
  assert.equal(modelingInputError({ text: "需求", attachments: [image], reasoning: true }, capacity), null);
});

test("checks decoded MIME signatures and the one megabyte per image limit", () => {
  assert.equal(validModelingImage("image/png", image.data), true);
  assert.equal(validModelingImage("image/jpeg", image.data), false);
  const oversized = Buffer.alloc(1_000_001); Buffer.from(image.data, "base64").copy(oversized);
  assert.equal(validModelingImage("image/png", oversized.toString("base64")), false);
  assert.equal(modelingInputError({ text: "需求", attachments: [{ ...image, data: oversized.toString("base64") }] }, capacity), "这张图片超过 1 MB，请压缩后重试");
  assert.match(modelingInputError({ text: "需求", attachments: [{ ...image, data: "YWJj" }] }, capacity)!, /格式/);
});

test("caps combined user text and text documents instead of each source separately", () => {
  const document: ModelingAttachment = { id: "d", name: "scope.txt", type: "document", contentType: "text/plain", text: "x".repeat(59999) };
  assert.equal(modelingInputError({ text: "x", attachments: [document] }), null);
  assert.match(modelingInputError({ text: "xx", attachments: [document] })!, /60,000/);
});
