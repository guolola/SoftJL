// Regresses semantic fidelity and compiles fixtures with the repository's actual PlantUML runtime.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { deriveTableModel, getModelGraphElements, getStageModelSchemas, type AnyDiagramModel, type ModelingStage } from "@uml-platform/contracts";
import { modelFixture, objectActivityFixture, parallelObjectActivityFixture } from "@uml-platform/contracts/testing";
import { generateDesignPlantUmlArtifacts, generatePlantUmlArtifacts } from "./model-renderer.js";
import { umlAlias } from "./plantuml-text.js";

function draw(model: AnyDiagramModel, stage: ModelingStage = "design") {
  return (stage === "design" ? generateDesignPlantUmlArtifacts([model as never]) : generatePlantUmlArtifacts([model as never], stage))[0]!;
}
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const jars = resolve(root, "plantuml");
const jar = existsSync(jars) ? readdirSync(jars).find((file) => /^plantuml-.*\.jar$/.test(file) && !/sources|javadoc/.test(file)) : undefined;
// CI runs on Linux while local verification may run on Windows.
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : process.platform === "win32" ? "C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin/java.exe" : "java";
function compile(source: string) {
  assert.ok(jar, "Repository PlantUML jar must be built before renderer verification");
  const result = spawnSync(java, ["-Djava.awt.headless=true", "-jar", resolve(jars, jar), "-charset", "UTF-8", "-pipe", "-tsvg"], { input: source, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stderr}\n${result.stdout?.slice(-2500)}\n${source}`);
  assert.match(result.stdout, /<svg/);
  assert.doesNotMatch(result.stdout, /Syntax Error|An error has occurred/);
  return result.stdout;
}
for (const stage of ["feasibility", "requirements", "design"] as const) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`${stage}/${kind}: actual PlantUML compile and model coverage`, () => {
    const model = modelFixture(stage, kind);
    model.notes = ["MODEL_NOTES_EXCLUDED_FROM_DIAGRAM", "本模型仅依据已确认的业务规则构建。"];
    const artifact = draw(model, stage), svg = compile(artifact.source);
    assert.doesNotMatch(artifact.source, /\blegend\b|MODEL_NOTES_EXCLUDED_FROM_DIAGRAM|活动图：显式图形映射/);
    assert.doesNotMatch(svg, /MODEL_NOTES_EXCLUDED_FROM_DIAGRAM/);
    assert.ok(!artifact.renderMapping?.auxiliary?.some((item) => item.kind === "legend"));
    assert.deepEqual(artifact, draw({ ...model, notes: [] }, stage), "Model notes must not affect diagrams or their review mapping");
    for (const item of getModelGraphElements(model)) {
      assert.ok(artifact.renderMapping?.elements.some((entry) => entry.elementId === item.id));
      if (kind !== "function" && !(kind === "activity" && artifact.renderMapping?.mode === "native")) assert.ok(svg.includes(umlAlias(item.id)), `${kind}: SVG omitted ${item.id}`);
    }
    const edges = "messages" in model ? model.messages : model.relationships;
    for (const edge of edges) assert.ok(artifact.renderMapping?.relationships.some((entry) => entry.relationshipId === edge.id));
  });
}
test("1 aliases never collide for punctuation, Unicode or leading digits", () => {
  const ids = ["a-b", "a_b", "1", "n_1", "订单", "訂單"];
  assert.equal(new Set(ids.map(umlAlias)).size, ids.length);
});
test("2 boundaries keep distinct membership and extension conditions", () => {
  const model = modelFixture("requirements", "usecase") as any;
  model.systemBoundaries.push({ id: "other", name: "积分系统" });
  model.useCases.push({ ...model.useCases[0], id: "extra", systemBoundaryId: "other", extensionPoints: [] });
  model.relationships.push({ id: "ext", type: "extend", sourceId: "extra", targetId: "case", extensionPointIds: ["discount"], condition: "用户拥有积分并且订单满足所有折扣条件" });
  const source = draw(model, "requirements").source;
  assert.match(source, new RegExp(`as ${umlAlias("other")} \\{\\nusecase .* as ${umlAlias("extra")}`));
  assert.ok(source.includes("用户拥有积分并且订单满足所有折扣条件"));
  compile(source);
});
test("3-5 class role names, cardinalities, abstract/static members and navigability", () => {
  const model = modelFixture("design", "class") as any;
  Object.assign(model.classes[0], { isAbstract: true, attributes: [{ name: "count", type: "int", visibility: "public", constraints: [], isStatic: true }], operations: [{ name: "save", visibility: "public", parameters: [], isAbstract: true }] });
  Object.assign(model.relationships[0], { type: "association", navigability: "none", sourceRole: "owner", targetRole: "items", sourceMultiplicity: "1", targetMultiplicity: "0..*" });
  let source = draw(model).source;
  assert.ok(source.includes('"1 owner" -- "0..* items"'));
  assert.match(source, /abstract class/); assert.match(source, /\{static\} \+count/); assert.match(source, /\{abstract\} \+save/);
  compile(source);
  model.relationships[0].type = "composition"; model.relationships[0].navigability = "bidirectional";
  source = draw(model).source; assert.match(source, /\*-->/); assert.ok(source.includes("{navigable}")); compile(source);
});
test("6-8 activity explicitly maps object flow, repeated names, loops and two final types", () => {
  const model = objectActivityFixture();
  model.relationships.push({ id: "loop", type: "control_flow", sourceId: "consume", targetId: "work", guard: "后续订单仍存在且每个审批条件全部成立" });
  const artifact = draw(model, "requirements"), svg = compile(artifact.source);
  assert.equal(artifact.renderMapping?.mode, "explicit-graph");
  assert.equal(artifact.renderMapping?.relationships.length, model.relationships.length);
  assert.ok(artifact.source.includes(`${umlAlias("out")} --> ${umlAlias("data")}`));
  assert.ok(artifact.source.includes(`${umlAlias("data")} --> ${umlAlias("in")}`));
  assert.equal(artifact.source.match(/rectangle "处理"/g)?.length, 2);
  assert.ok(artifact.source.includes("●") && artifact.source.includes("×"));
  assert.match(artifact.source, /usecase "<size:18>●<\/size>"/);
  assert.match(artifact.source, /usecase "<size:18>×<\/size>"/);
  for (const item of getModelGraphElements(model)) assert.ok(svg.includes(umlAlias(item.id)));
});
test("9 return navigation keeps source-to-destination and complete trigger/guard", () => {
  const model = modelFixture("design", "navigation") as any;
  Object.assign(model.relationships[0], { trigger: "用户点击浏览器或页面返回按钮", condition: "所有未保存数据已经获得用户的明确确认" });
  const source = draw(model).source;
  assert.ok(source.includes(`${umlAlias("b")} --> ${umlAlias("a")}`));
  assert.ok(source.includes(model.relationships[0].trigger) && source.includes(model.relationships[0].condition));
});
test("10 package ownership renders nesting and invalid package cannot hide components", () => {
  const model = modelFixture("design", "architecture") as any;
  model.packages.push({ id: "parent", name: "父包" }); model.packages[0].parentId = "parent";
  const source = draw(model).source;
  assert.ok(source.indexOf(`as ${umlAlias("parent")} {`) < source.indexOf(`as ${umlAlias("p")} {`)); compile(source);
  model.components[0].packageId = "absent";
  assert.throws(() => draw(model), /missing-reference/);
});
test("11-14 sequence creation, destruction, return, nested alt/opt/loop/par and activation", () => {
  const model = modelFixture("design", "sequence") as any;
  model.messages = ["create", "sync", "return", "sync", "async", "destroy"].map((type, i) => ({ id: `m${i}`, type, sourceId: i === 2 ? "b" : "a", targetId: i === 2 ? "a" : "b", name: `call${i}`, parameters: [] }));
  model.messages[1].sourceId = "b";
  model.fragments = [
    { id: "all", type: "loop", label: "每次事务", messageIds: ["m0", "m1", "m2", "m3", "m4", "m5"] },
    { id: "choice", type: "alt", label: "选择", parentFragmentId: "all", messageIds: ["m1", "m2", "m3", "m4"], branches: [{ id: "yes", label: "通过", condition: "校验通过", messageIds: ["m1", "m2"] }, { id: "no", label: "重试", condition: "可重试", messageIds: ["m3", "m4"] }] },
    { id: "optional", type: "opt", label: "可选", parentFragmentId: "choice", parentBranchId: "yes", messageIds: ["m1"] },
    { id: "parallel", type: "par", label: "并行", parentFragmentId: "choice", parentBranchId: "no", messageIds: ["m3", "m4"], branches: [{ id: "one", label: "一", messageIds: ["m3"] }, { id: "two", label: "二", messageIds: ["m4"] }] },
  ];
  model.activations = [{ id: "act", participantId: "b", startMessageId: "m1", endMessageId: "m1" }];
  const source = draw(model).source;
  assert.ok(source.indexOf(`create ${umlAlias("b")}`) < source.indexOf("call0"));
  assert.match(source, /loop 每次事务/); assert.match(source, /alt 选择\\n通过/); assert.match(source, /opt 可选/); assert.match(source, /par 并行\\n一/);
  assert.ok(source.includes(`${umlAlias("b")} --> ${umlAlias("a")}`));
  assert.ok(source.includes(`destroy ${umlAlias("b")}`));
  assert.equal(source.match(/^activate /gm)?.length, 1);
  compile(source);
});
test("15 component interface operations are visible, wrong endpoints fail", () => {
  const model = modelFixture("design", "component") as any;
  assert.ok(draw(model).source.includes("submit(order)"));
  model.relationships[0].sourceId = "i"; model.relationships[0].targetId = "c";
  assert.throws(() => draw(model), /invalid-endpoints/);
});
test("16-17 deployment distinguishes nesting, deploy/manifest, artifact dependency, direction and protocol", () => {
  const model = modelFixture("design", "deployment") as any;
  model.artifacts = [{ id: "jar", name: "orders.jar" }, { id: "lib", name: "shared.jar" }]; model.components = [{ id: "c", name: "Orders" }];
  Object.assign(model.relationships[0], { direction: "inbound", protocol: "HTTPS", port: "443" });
  model.relationships.push(...[["deploy", "deployment", "jar", "e"], ["manifest", "manifestation", "jar", "c"], ["dep", "dependency", "jar", "lib"]].map(([id, type, sourceId, targetId]) => ({ id, type, sourceId, targetId })));
  const source = draw(model).source;
  assert.ok(source.includes(`${umlAlias("e")} <-- ${umlAlias("outside")} : HTTPS\\n443`));
  assert.match(source, /<<deploy>>/); assert.match(source, /<<manifest>>/); assert.match(source, /<<dependency>>/);
  compile(source);
});
test("18 composite primary/foreign keys and association tables derive faithful crowfoot endpoints", () => {
  const model = modelFixture("design", "table") as any;
  model.tables[0].columns.push({ ...model.tables[0].columns[0], id: "tenant", name: "tenant" }); model.tables[0].relationalConstraints[0].columnIds.push("tenant");
  model.tables[1].columns.push({ ...model.tables[1].columns[1], id: "tenant", name: "tenant" });
  model.tables[1].relationalConstraints[1].columnIds.push("tenant"); model.tables[1].relationalConstraints[1].referenceColumnIds.push("tenant");
  model.tables[1].relationalConstraints[0].columnIds = ["order", "tenant", "id"];
  model.tables[1].relationalConstraints.push({ id: "positive", type: "check", expression: "id > 0 AND tenant > 0" });
  const derived = deriveTableModel(model), source = draw(model).source;
  assert.equal(derived.relationships[0]?.identifying, true);
  assert.ok(source.includes("||--o{")); assert.ok(source.includes("FOREIGN KEY (order, tenant)")); assert.ok(source.includes("id > 0 AND tenant > 0"));
  compile(source);
});
test("review mapping preserves labels, symbols, ownership and distinct parallel guard statements", () => {
  const model = modelFixture("requirements", "activity"); if (model.diagramKind !== "activity") throw new Error("fixture");
  model.relationships[1]!.guard = "数量>=10";
  model.relationships.push({ ...model.relationships[1]!, id: "alternate", guard: "数量<10" });
  const artifact = draw(model, "requirements");
  assert.equal(artifact.renderMapping?.relationships.find((item) => item.relationshipId === "r2")?.label, "数量>=10");
  assert.ok(artifact.renderMapping?.relationships.find((item) => item.relationshipId === "r2")?.statement?.includes("数量&#62;=10"));
  assert.ok(artifact.renderMapping?.relationships.find((item) => item.relationshipId === "alternate")?.statement?.includes("数量&#60;10"));
  assert.equal(artifact.renderMapping?.relationships[0]?.symbol, "->");
  assert.equal(artifact.renderMapping?.elements.find((item) => item.elementId === "work")?.ownerId, "system");
  assert.ok(!artifact.renderMapping?.auxiliary?.some((item) => item.kind === "legend"));
  compile(artifact.source);
});

test("parallel control and object flows preserve multiple pins and cross-partition endpoints", () => {
  const model = parallelObjectActivityFixture(), artifact = draw(model, "requirements"), svg = compile(artifact.source);
  for (const item of getModelGraphElements(model)) assert.ok(svg.includes(umlAlias(item.id)), `Missing ${item.id}`);
  for (const edge of model.relationships) assert.ok(artifact.source.includes(`${umlAlias(edge.sourceId)} --> ${umlAlias(edge.targetId)}`));
  assert.equal(artifact.renderMapping?.relationships.length, model.relationships.length);
  const visibleText = svg.replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
  assert.ok(visibleText.includes("履约") && visibleText.includes("结算"));
});

test("an empty else operand is retained by the PlantUML engine", () => {
  const model = modelFixture("design", "sequence") as any;
  model.fragments = [{ id: "optionalChoice", type: "alt", label: "提交", messageIds: ["m"], branches: [
    { id: "yes", label: "已确认", messageIds: ["m"] }, { id: "no", label: "无需操作", messageIds: [] },
  ] }];
  const source = draw(model).source;
  assert.match(source, /else 无需操作\nend/);
  compile(source);
});

test("many-to-many uses a junction table with two foreign keys and no direct many-to-many edge", () => {
  const model = modelFixture("design", "table") as any;
  model.tables[1].relationalConstraints = [model.tables[1].relationalConstraints[0]];
  model.tables.push({ id: "membership", name: "订单条目关联", constraints: [], columns: [
    { id: "orderId", name: "order_id", dataType: "bigint", nullable: false, constraints: [] },
    { id: "itemId", name: "item_id", dataType: "bigint", nullable: false, constraints: [] },
  ], relationalConstraints: [
    { id: "pk", type: "primary-key", columnIds: ["orderId", "itemId"] },
    { id: "orderFk", type: "foreign-key", columnIds: ["orderId"], referenceTableId: "orders", referenceColumnIds: ["id"] },
    { id: "itemFk", type: "foreign-key", columnIds: ["itemId"], referenceTableId: "items", referenceColumnIds: ["id"] },
  ] });
  const artifact = draw(model), derived = deriveTableModel(model);
  assert.equal(derived.relationships.length, 2);
  assert.ok(derived.relationships.every((edge) => edge.type === "one-to-many" && edge.targetTableId === "membership"));
  assert.equal(artifact.renderMapping?.relationships.length, 2);
  compile(artifact.source);
});
