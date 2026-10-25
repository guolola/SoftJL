// Checks native business swimlanes and graph traversal against the bundled PlantUML engine.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ActivityDiagramSpec, ActivityNode, ActivityRelationship } from "@uml-platform/contracts";
import { generatePlantUmlArtifacts } from "./model-renderer.js";
import { umlAlias } from "./plantuml-text.js";
import { branchedRetryActivity, parallelRetryActivity } from "../../../tests/fixtures/complex-activity.js";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : process.platform === "win32" ? "C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin/java.exe" : "java";
function compile(source: string, diagramType = "ACTIVITY") {
  const result = spawnSync(java, ["-Djava.awt.headless=true", "-jar", resolve(root, "plantuml/plantuml-1.2026.3beta8.jar"), "-charset", "UTF-8", "-pipe", "-tsvg"], { input: source, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${source}\n${result.stdout?.slice(-1500)}`);
  assert.ok(result.stdout.includes(`data-diagram-type="${diagramType}"`));
  assert.doesNotMatch(result.stdout, /Syntax Error|An error has occurred/);
  return result.stdout;
}
const visible = (svg: string) => svg.replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number))).replace(/&gt;/g, ">").replace(/&lt;/g, "<");
const action = (id: string, name: string, actorOrLane = "system"): ActivityNode => ({ id, type: "activity", name, actorOrLane, input: [], output: [] });
const flow = (sourceId: string, targetId: string, guard?: string): ActivityRelationship => ({ id: `${sourceId}-${targetId}`, type: "control_flow", sourceId, targetId, ...(guard ? { guard } : {}) });
function model(nodes: ActivityNode[], relationships: ActivityRelationship[]): ActivityDiagramSpec {
  return { diagramKind: "activity", modelId: "business-flow", title: "办理登机业务流程", summary: "人员与系统协作", notes: [],
    swimlanes: [{ id: "user", name: "旅客" }, { id: "system", name: "旅游 App" }], nodes, relationships };
}
const start: ActivityNode = { id: "start", type: "start", name: "开始", actorOrLane: "user" };
const end: ActivityNode = { id: "end", type: "end", name: "结束", actorOrLane: "user" };

for (const stage of ["feasibility", "requirements"] as const) test(`${stage}: native uncolored vertical lanes follow graph order and return to a lane`, () => {
  const input = model([end, action("print", "领取登机牌", "user"), action("generate", "生成登机牌"), start, action("submit", "提交登机信息", "user")],
    [flow("generate", "print"), flow("submit", "generate"), flow("print", "end"), flow("start", "submit")]);
  const artifact = generatePlantUmlArtifacts([input], stage)[0]!;
  assert.equal(artifact.renderMapping?.mode, "native");
  assert.match(artifact.source, /\|lane_\w+\| 旅客/);
  assert.match(artifact.source, /\|lane_\w+\| 旅游 App/);
  assert.doesNotMatch(artifact.source, /\|#/);
  assert.doesNotMatch(artifact.source, /allowmixing|<<partition>>|rectangle |usecase |circle /);
  assert.ok(artifact.source.indexOf(":提交登机信息;") < artifact.source.indexOf(":生成登机牌;"));
  assert.ok(artifact.source.indexOf(":生成登机牌;") < artifact.source.indexOf(":领取登机牌;"));
  assert.equal(artifact.source.match(new RegExp(`^\\|lane_${umlAlias("user")}\\|$`, "gm"))?.length, 2);
  assert.equal(artifact.renderMapping?.elements.length, input.nodes.length);
  assert.equal(artifact.renderMapping?.relationships.length, input.relationships.length);
  const svg = compile(artifact.source);
  // Native lane borders share a top and bottom while occupying distinct columns.
  const borders = [...svg.matchAll(/<line style="stroke:#000000;stroke-width:1\.5;" x1="([\d.]+)" x2="\1" y1="([\d.]+)" y2="([\d.]+)"/g)];
  assert.equal(borders.length, 3);
  assert.equal(borders[0]![2], borders[1]![2]);
  assert.equal(borders[0]![3], borders[1]![3]);
  assert.notEqual(borders[0]![1], borders[1]![1]);
  assert.doesNotMatch(svg, /#87CEFA|#FAEBD7/);
  assert.match(visible(svg), /生成登机牌/);
});

test("branch conditions reconverge once, retaining guards, triggers and an empty branch", () => {
  const input = model([start, action("submit", "提交信息", "user"), { id: "check", type: "decision", question: "信息是否有效？", actorOrLane: "system" },
    action("save", "保存信息"), { id: "merge", type: "merge", actorOrLane: "system" }, action("reply", "反馈结果"), end],
    [flow("start", "submit"), flow("submit", "check"), { ...flow("check", "save", "数量>=10"), trigger: "用户确认", condition: "证件有效" },
      flow("check", "merge", "数量<10"), flow("save", "merge"), flow("merge", "reply"), flow("reply", "end")]);
  const artifact = generatePlantUmlArtifacts([input])[0]!;
  assert.match(artifact.source, /if \(信息是否有效？\) then \(数量&#62;=10 \/ 证件有效 \/ 用户确认\)/);
  assert.match(artifact.source, /else \(数量&#60;10\)/);
  assert.equal(artifact.source.match(/:反馈结果;/g)?.length, 1);
  assert.match(artifact.source, /endif[\s\S]*:反馈结果;/);
  const svg = visible(compile(artifact.source));
  assert.match(svg, /数量>=10/);
  assert.match(svg, /数量<10/);
  assert.match(svg, /用户确认/);
});

test("nested choices, three-way choices and parallel branches retain their native structure", () => {
  const input = model([start, { id: "choice", type: "decision", question: "处理类型", actorOrLane: "system" },
    { id: "fork", type: "fork", actorOrLane: "system" }, action("left", "登记登机信息"), action("right", "确认行程", "user"),
    { id: "join", type: "join", actorOrLane: "system" }, { id: "nested", type: "decision", question: "需要补充？", actorOrLane: "system" }, action("edit", "补充信息", "user"),
    { id: "merge", type: "merge", actorOrLane: "system" }, end],
    [flow("start", "choice"), flow("choice", "fork", "正常"), flow("choice", "nested", "补充"), flow("choice", "merge", "取消"),
      flow("fork", "left"), flow("fork", "right"), flow("left", "join"), flow("right", "join"), flow("join", "merge"),
      flow("nested", "edit", "是"), flow("nested", "merge", "否"), flow("edit", "merge"), flow("merge", "end")]);
  const artifact = generatePlantUmlArtifacts([input])[0]!;
  assert.match(artifact.source, /switch \(处理类型\)/);
  assert.match(artifact.source, /fork\n/);
  assert.match(artifact.source, /fork again/);
  assert.match(artifact.source, /end fork/);
  assert.match(artifact.source, /if \(需要补充？\)/);
  assert.match(artifact.source, /endswitch/);
  assert.equal(artifact.renderMapping?.relationships.length, input.relationships.length);
  compile(artifact.source);
});

test("retry loops draw native repeat/backward arrows without duplicating actions", () => {
  const input = model([start, { id: "retry", type: "merge", actorOrLane: "user" }, action("submit", "提交资料", "user"),
    { id: "check", type: "decision", question: "审核通过？", actorOrLane: "system" }, action("edit", "修改资料", "user"), end],
    [flow("start", "retry"), flow("retry", "submit"), flow("submit", "check"), flow("check", "end", "通过"),
      flow("check", "edit", "不通过"), flow("edit", "retry", "重新提交")]);
  const artifact = generatePlantUmlArtifacts([input])[0]!;
  assert.match(artifact.source, /repeat while \(审核通过？\) is \(不通过\) not \(通过\)/);
  assert.match(artifact.source, /backward :修改资料; \(-> 重新提交\)/);
  assert.doesNotMatch(artifact.source, /goto /);
  assert.equal(artifact.source.match(/:提交资料;/g)?.length, 1);
  assert.equal(artifact.renderMapping?.relationships.length, input.relationships.length);
  compile(artifact.source);
});

test("duplicate lane names remain distinct and DSL delimiters cannot inject commands", () => {
  const input = model([start, action("submit", "提交;|资料|\n@enduml", "user"), action("save", "保存(证件)[副本]"), end],
    [flow("start", "submit"), flow("submit", "save"), flow("save", "end")]);
  input.swimlanes.forEach(lane => { lane.name = "办理|服务"; });
  const artifact = generatePlantUmlArtifacts([input])[0]!;
  assert.equal(artifact.source.match(/^@enduml$/gm)?.length, 1);
  assert.match(artifact.source, /办理&#124;服务/);
  assert.ok(artifact.source.includes(`lane_${umlAlias("system")}`));
  assert.ok(artifact.source.includes(`lane_${umlAlias("user")}`));
  compile(artifact.source);
});

test("multiple retry actions stay inside a native while loop in their business order", () => {
  const input = model([start, { id: "retry", type: "merge", actorOrLane: "user" }, action("submit", "提交资料", "user"),
    { id: "check", type: "decision", question: "校验通过？", actorOrLane: "system" }, action("explain", "显示错误"), action("edit", "修改资料", "user"), end],
    [flow("start", "retry"), flow("retry", "submit"), flow("submit", "check"), flow("check", "end", "通过"),
      flow("check", "explain", "不通过"), flow("explain", "edit"), flow("edit", "retry")]);
  const artifact = generatePlantUmlArtifacts([input])[0]!;
  assert.equal(artifact.renderMapping?.mode, "native");
  assert.match(artifact.source, /while \(校验通过？\) is \(不通过\)/);
  assert.match(artifact.source, /:显示错误;[\s\S]*:修改资料;[\s\S]*:提交资料;[\s\S]*endwhile \(通过\)/);
  assert.equal(artifact.renderMapping?.elements.length, input.nodes.length);
  compile(artifact.source);
});

test("independent start nodes share a downstream activity without losing a branch", () => {
  const input = model([start, { id: "otherStart", type: "start", name: "系统触发", actorOrLane: "system" }, action("submit", "提交资料", "user"),
    action("import", "导入资料"), action("check", "核验资料"), end],
    [flow("start", "submit"), flow("otherStart", "import"), flow("submit", "check"), flow("import", "check"), flow("check", "end")]);
  const artifact = generatePlantUmlArtifacts([input])[0]!;
  assert.equal(artifact.renderMapping?.mode, "native");
  assert.equal(artifact.source.match(/^start$/gm)?.length, 2);
  assert.equal(artifact.source.match(/:核验资料;/g)?.length, 1);
  assert.equal(artifact.renderMapping?.relationships.length, input.relationships.length);
  compile(artifact.source);
});

test("non-local cycles use paired native connectors while keeping every control flow", () => {
  const input = model([start, action("a", "处理资料", "user"), action("b", "接收资料"), end],
    [flow("start", "a"), flow("a", "b"), flow("b", "a", "继续处理"), flow("b", "end", "完成")]);
  for (const stage of ["requirements", "feasibility"] as const) {
    const artifact = generatePlantUmlArtifacts([input], stage)[0]!;
    assert.match(artifact.source, /@return-entry/);
    assert.equal(artifact.renderMapping?.relationships.length, input.relationships.length);
    const svg = visible(compile(artifact.source));
    assert.match(svg, /继续处理/);
    assert.match(svg, /完成/);
  }
  assert.equal(input.relationships.length, 4, "Rendering must not drop a business edge to fit the layout");
});

for (const stage of ["feasibility", "requirements"] as const) for (const fixture of [branchedRetryActivity, parallelRetryActivity]) {
  test(`${stage}: ${fixture.name} preserves complex returns, labels and vertical lanes in real SVG`, () => {
    const input = fixture(), before = structuredClone(input);
    const artifact = generatePlantUmlArtifacts([input], stage)[0]!;
    assert.equal(artifact.renderMapping?.mode, "native");
    assert.deepEqual(input, before, "Rendering cannot rewrite the model to fit native syntax");
    assert.deepEqual(new Set(artifact.renderMapping?.elements.map(item => item.elementId)), new Set(input.nodes.map(node => node.id)));
    assert.deepEqual(new Set(artifact.renderMapping?.relationships.map(item => `${item.relationshipId}:${item.sourceId}:${item.targetId}`)),
      new Set(input.relationships.map(item => `${item.id}:${item.sourceId}:${item.targetId}`)));
    assert.doesNotMatch(artifact.source, /goto |allowmixing|rectangle |@repeat-element/);
    const connectors = artifact.renderMapping!.auxiliary!.filter(item => item.kind === "flow-connector");
    assert.deepEqual(connectors.map(item => item.elementId), fixture === branchedRetryActivity ? ["log"] : ["log", "configure"]);
    for (const connector of connectors) {
      assert.equal(artifact.source.split(`(${connector.label})`).length - 1, 2, "Each return has both an exit and an entry");
      assert.match(artifact.source, new RegExp(`' @return-to ${umlAlias(connector.elementId!)}\\n\\(${connector.label}\\)\\ndetach`));
      const target = input.nodes.find(node => node.id === connector.elementId)!;
      assert.ok(artifact.source.includes(`' @return-entry ${umlAlias(target.id)}\n(${connector.label})\n' @element ${umlAlias(target.id)}\n:${target.type === "activity" ? target.name : ""};`));
      assert.equal(connector.ownerId, target.actorOrLane);
    }
    assert.match(artifact.source, /审核退回 \/ 点评次数不足 \/ 管理员确认/);
    assert.match(artifact.source, /repeat while \(是否修改评价？\)/);
    if (fixture === parallelRetryActivity) {
      assert.equal(artifact.source.match(/^fork$/gm)?.length, 2);
      assert.equal(artifact.source.match(/^end fork$/gm)?.length, 2);
    }
    const svg = visible(compile(artifact.source));
    for (const node of input.nodes) if (node.type === "activity") assert.ok(svg.includes(node.name), `SVG omitted ${node.id}`);
    for (const wording of ["审核退回", "点评次数不足", "管理员确认", "审核通过", "需要修改", "无需修改"]) assert.ok(svg.includes(wording), `SVG omitted ${wording}`);
    // PlantUML renders spot letters as vector paths, rather than SVG text nodes.
    const spots = [...svg.matchAll(/<ellipse[^>]*fill="#F1F1F1"[^>]*rx="10"[^>]*ry="10"[^>]*\/><path /g)];
    assert.equal(spots.length, connectors.length * 2, "The SVG must contain both ends of every connector");
    const borders = [...svg.matchAll(/<line style="stroke:#000000;stroke-width:1\.5;" x1="([\d.]+)" x2="\1" y1="([\d.]+)" y2="([\d.]+)"/g)];
    assert.equal(borders.length, input.swimlanes.length + 1);
    assert.equal(new Set(borders.map(line => `${line[2]}:${line[3]}`)).size, 1, "All lanes span the full diagram height");
    assert.deepEqual(artifact, generatePlantUmlArtifacts([input], stage)[0], "Repeated renders are deterministic");
  });
}

test("separate return branches share the entry connector of their original target", () => {
  const input = branchedRetryActivity();
  input.nodes.push({ id: "followup", type: "decision", actorOrLane: "system", question: "是否需要追加复核？" });
  input.relationships.find(edge => edge.sourceId === "complete" && edge.targetId === "compose")!.targetId = "followup";
  input.relationships.push(flow("followup", "log", "追加复核退回"), flow("followup", "compose", "复核通过"));
  const artifact = generatePlantUmlArtifacts([input], "requirements")[0]!;
  const connectors = artifact.renderMapping!.auxiliary!.filter(item => item.kind === "flow-connector");
  assert.deepEqual(connectors.map(item => item.elementId), ["log"]);
  assert.equal(artifact.source.match(/@return-entry/g)?.length, 1);
  assert.equal(artifact.source.match(/@return-to/g)?.length, 2);
  assert.equal(artifact.source.match(/\(A\)/g)?.length, 3);
  const svg = visible(compile(artifact.source));
  assert.match(svg, /追加复核退回/);
  assert.match(svg, /复核通过/);
  assert.equal([...svg.matchAll(/<ellipse[^>]*fill="#F1F1F1"[^>]*rx="10"[^>]*ry="10"[^>]*\/><path /g)].length, 3);
});

test("missing lanes fail before emitting an unpartitioned diagram", () => {
  const input = model([start, action("work", "办理业务"), end], [flow("start", "work"), flow("work", "end")]);
  input.swimlanes = [];
  assert.throws(() => generatePlantUmlArtifacts([input], "requirements", "schema"), /至少需要一条泳道/);
});

test("shared downstream actions across non-joining branches remain vertical with complete identities", () => {
  const input = model([start, { id: "choice", type: "decision", question: "是否处理？", actorOrLane: "system" },
    action("work", "办理业务", "user"), end],
    [flow("start", "choice"), flow("start", "work"), flow("choice", "work", "是"), flow("choice", "end", "否"), flow("work", "end")]);
  const before = structuredClone(input);
  const first = generatePlantUmlArtifacts([input], "requirements")[0]!;
  const second = generatePlantUmlArtifacts([input], "feasibility")[0]!;
  assert.equal(first.source, second.source);
  assert.equal(first.renderMapping?.mode, "native");
  assert.equal(first.renderMapping?.elements.length, input.nodes.length);
  assert.equal(first.renderMapping?.relationships.length, input.relationships.length);
  assert.match(first.source, /@repeat-element/);
  compile(first.source);
  assert.deepEqual(input, before);
});
