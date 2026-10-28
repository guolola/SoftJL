// Tests the native skill reader's actual filesystem boundary, pagination and shared generation knowledge.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createStandardResourceReadTool, readStandardModelingResource, standardTaskGuidance } from "./standard-modeling-knowledge.js";
import { getModelReviewProfile, standardModelStage } from "@uml-platform/contracts";

test("native read permits paginated Markdown resources and denies traversal, non-resources and junction escapes", async t => {
  const dir = await mkdtemp(join(tmpdir(), "uml-skill-read-"));
  t.after(async () => {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
    await rm(dir, { recursive: true, force: true });
  });
  const root = join(dir, "resources"); const outside = join(dir, "outside");
  await mkdir(root); await mkdir(outside);
  await writeFile(join(root, "guide.md"), "first\nsecond\nthird");
  await writeFile(join(root, "private.json"), "not readable");
  await writeFile(join(outside, "private.md"), "outside secret");
  const tool = createStandardResourceReadTool(root);
  const read = (path: string, options = {}) => tool.execute("read", { path, ...options }, new AbortController().signal, undefined, undefined!);
  const result = await read("guide.md", { offset: 2, limit: 1 });
  assert.equal(result.content[0]!.type, "text");
  assert.ok(result.content.some(part => part.type === "text" && part.text.startsWith("second")));
  for (const path of ["../outside/private.md", join(outside, "private.md"), "private.json", root]) {
    await assert.rejects(read(path), /只允许读取平台提供/);
  }
  await symlink(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(read(join(root, "escape", "private.md")), /只允许读取平台提供/);
});

test("generation guidance uses the authored skill and only the task's reference", async () => {
  const classReference = (await readStandardModelingResource("skills/uml-graduation-modeling/references/class.md")).toString("utf8");
  const sequenceReference = (await readStandardModelingResource("skills/uml-graduation-modeling/references/sequence.md")).toString("utf8");
  const skill = (await readStandardModelingResource("skills/uml-graduation-modeling/SKILL.md")).toString("utf8");
  const guidance = await standardTaskGuidance("class");
  assert.ok(guidance.includes(skill)); assert.ok(guidance.includes(classReference)); assert.ok(!guidance.includes(sequenceReference));
});

test("ordinary generation receives current relationship rules without professional source requirements", async () => {
  for (const kind of ["function", "usecase", "activity", "architecture", "class", "sequence", "table"] as const) {
    const guidance = await standardTaskGuidance(kind);
    for (const rule of getModelReviewProfile(standardModelStage(kind), kind).structure) assert.ok(guidance.includes(rule), `${kind}: ${rule}`);
  }
  assert.doesNotMatch(await standardTaskGuidance("sequence"), /sourceUseCaseId.*必须/);
});
