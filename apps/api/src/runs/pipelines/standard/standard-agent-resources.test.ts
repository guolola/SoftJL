// Verifies native Pi package loading, reload and isolation from unrequested API-host resources.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { loadStandardAgentResources } from "./standard-agent-resources.js";
import { readStandardModelingResource, standardModelingResourceRoot } from "./standard-modeling-knowledge.js";

async function workspace(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "uml-pi-resources-"));
  t.after(async () => {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

test("the native loader imports an explicit local Pi package and reloads its factories", async t => {
  const cwd = await workspace(t); const packageDir = join(cwd, "modeling-package");
  await mkdir(packageDir);
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "modeling-package", pi: { extensions: ["./index.mjs"] } }));
  await writeFile(join(packageDir, "index.mjs"), `export default pi => {
    pi.registerTool({ name: "package_tool", label: "Package tool", description: "Inspect modeling",
      parameters: { type: "object", properties: {} },
      async execute() { return { content: [{ type: "text", text: "loaded" }], details: {} }; }
    });
  };`);
  let loads = 0;
  const loader = await loadStandardAgentResources(cwd, SettingsManager.inMemory(), "建模系统指令", {
    additionalExtensionPaths: [packageDir], extensionFactories: [pi => {
      loads++; pi.on("agent_start", () => {});
    }],
  });
  assert.ok(loader instanceof DefaultResourceLoader);
  assert.ok(loader.getExtensions().extensions.some(extension => extension.tools.has("package_tool")));
  assert.equal(loads, 1);
  await loader.reload();
  assert.equal(loads, 2);
  assert.equal(loader.getExtensions().extensions.filter(extension => extension.tools.has("package_tool")).length, 1);
  assert.deepEqual(loader.getExtensions().errors, []);
});

test("host extensions, skills, prompt templates and context files are not implicitly loaded", async t => {
  const cwd = await workspace(t); const piDir = join(cwd, ".pi");
  for (const dir of [join(piDir, "extensions"), join(piDir, "skills", "host-skill"), join(piDir, "prompts"), join(cwd, "extensions")]) await mkdir(dir, { recursive: true });
  const trap = 'export default () => { throw new Error("host extension must not run"); };';
  await writeFile(join(piDir, "extensions", "host.js"), trap);
  await writeFile(join(cwd, "extensions", "global.js"), trap);
  await writeFile(join(piDir, "skills", "host-skill", "SKILL.md"), "---\nname: host-skill\ndescription: host material\n---\nHost secret.");
  await writeFile(join(piDir, "prompts", "host.md"), "Host secret.");
  await writeFile(join(cwd, "AGENTS.md"), "Host secret.");
  await writeFile(join(cwd, "SYSTEM.md"), "Host secret.");
  await writeFile(join(cwd, "APPEND_SYSTEM.md"), "Host secret.");
  // A real host settings file is deliberately ignored in favor of the in-memory settings manager.
  await writeFile(join(piDir, "settings.json"), JSON.stringify({ extensions: ["./extensions/host.js"], packages: ["./missing-package"] }));
  const loader = await loadStandardAgentResources(cwd, SettingsManager.inMemory(), "建模系统指令", {});
  assert.deepEqual(loader.getExtensions().extensions, []);
  assert.deepEqual(loader.getSkills().skills.map(skill => skill.name).sort(), ["graduation-deliverables", "uml-graduation-modeling"]);
  assert.deepEqual(loader.getSkills().diagnostics, []);
  assert.deepEqual(loader.getPrompts().prompts, []);
  assert.deepEqual(loader.getAgentsFiles().agentsFiles, [{ path: join(standardModelingResourceRoot, "AGENTS.md"), content: (await readStandardModelingResource("AGENTS.md")).toString("utf8") }]);
  assert.equal(loader.getSystemPrompt(), "建模系统指令");
  assert.deepEqual(loader.getAppendSystemPrompt(), []);
});

test("missing explicit extension paths fail instead of silently removing capabilities", async t => {
  const cwd = await workspace(t);
  await assert.rejects(loadStandardAgentResources(cwd, SettingsManager.inMemory(), "建模系统指令", {
    additionalExtensionPaths: [join(cwd, "missing.ts")],
  }), /快速建模扩展加载失败/);
});
