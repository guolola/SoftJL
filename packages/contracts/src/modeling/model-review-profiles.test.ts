// Exercises a distinct supported structural rule for every stage/model review profile.
import assert from "node:assert/strict";
import test from "node:test";
import { getStageModelSchemas, validateModelInput, validateModelStructure, type ModelingStage } from "./model-semantics.js";
import { getModelReviewProfile } from "./model-review-profiles.js";
import { modelFixture } from "../testing/model-fixtures.js";

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) {
  for (const schema of getStageModelSchemas(stage)) {
    const kind = schema.shape.diagramKind.value;
    test(`${stage}/${kind} has its own profile and rejects its diagram-specific structural defect`, () => {
      const model = modelFixture(stage, kind) as any;
      const profile = getModelReviewProfile(stage, kind);
      assert.equal(profile.id, `${stage}.${kind}`);
      assert.ok(profile.structure.length >= 2 && profile.image.length && profile.content.length);
      assert.deepEqual(validateModelInput(model, stage), []);
      let code: string;
      switch (kind) {
        case "context": model.externalSystems.push({ ...model.people[0], id: "outside" }); model.relationships[0].targetId = "outside"; code = "invalid-endpoints"; break;
        case "function": model.relationships.push({ id: "cycle", type: "decomposition", sourceId: "child", targetId: "root" }); code = "hierarchy-cycle"; break;
        case "usecase": model.useCases[0].primaryActorId = "actor"; model.relationships = []; code = "actor-participation"; break;
        case "class": model.relationships[0].type = "inheritance"; model.relationships.push({ id: "cycle", type: "inheritance", sourceId: "item", targetId: "order" }); code = "hierarchy-cycle"; break;
        case "activity": model.relationships.push({ id: "invalid-final", type: "control_flow", sourceId: "end", targetId: "work" }); code = "final-outgoing"; break;
        case "analysis": case "sequence": model.fragments = [{ id: "choice", type: "alt", label: "分支", messageIds: ["m"], branches: [{ id: "one", label: "条件", messageIds: ["m"] }] }]; code = "fragment-branches"; break;
        case "prototype": case "navigation": model.nodes.forEach((node: any) => node.nodeType = "module"); model.relationships = [{ id: "r1", type: "contains", sourceId: "a", targetId: "b" }, { id: "r2", type: "contains", sourceId: "b", targetId: "a" }]; code = "hierarchy-cycle"; break;
        case "architecture": model.packages[0].parentId = "p"; code = "hierarchy-cycle"; break;
        case "component": model.relationships[0].targetId = "c"; code = "invalid-endpoints"; break;
        case "deployment": model.nodes[0].parentId = "d"; code = "hierarchy-cycle"; break;
        case "table": model.tables[1].relationalConstraints[1].referenceTableId = "unknown"; code = "foreign-table"; break;
        default: throw new Error(`Missing regression for ${kind}`);
      }
      assert.ok(validateModelInput(model, stage).some((issue) => issue.code === code), `${profile.id}: ${code}`);
    });
  }
}
test("stage variants retain their different class and deployment contracts", () => {
  assert.match(getModelReviewProfile("requirements", "class").structure.join("\n"), /不包含对象方法/);
  assert.match(getModelReviewProfile("design", "class").structure.join("\n"), /可包含接口、方法/);
  assert.match(getModelReviewProfile("requirements", "deployment").structure.join("\n"), /components／artifacts 为空/);
  assert.doesNotMatch(getModelReviewProfile("design", "deployment").structure.join("\n"), /components／artifacts 为空/);
  assert.throws(() => getModelReviewProfile("requirements", "table"), /不支持/);
  assert.match(getModelReviewProfile("feasibility", "activity").structure.join("\n"), /只使用.*control_flow/);
  assert.match(getModelReviewProfile("requirements", "activity").structure.join("\n"), /竖向泳道.*只使用.*control_flow/);
  assert.doesNotMatch(getModelReviewProfile("feasibility", "activity").image.join("\n"), /两类终止/);
});
test("class multiplicities reject reversed intervals while recursive type composition remains legal", () => {
  const model = modelFixture("design", "class"); if (model.diagramKind !== "class") throw new Error("fixture");
  model.relationships[0].targetMultiplicity = "5..2";
  assert.ok(validateModelInput(model, "design").some((issue) => issue.code === "multiplicity"));
  model.relationships[0].targetMultiplicity = "0..*"; model.relationships[0].targetId = "order";
  assert.deepEqual(validateModelInput(model, "design"), []);
});

test("schema-only editing respects ordinary sequence contracts without weakening professional sources", () => {
  const model = modelFixture("design", "sequence");
  if (model.diagramKind !== "sequence") throw new Error("fixture");
  const { sourceUseCaseId: _source, ...ordinary } = model;
  assert.deepEqual(validateModelStructure(ordinary, "design", "standard"), []);
  assert.ok(validateModelStructure(ordinary, "design").some(issue => issue.path === "sourceUseCaseId"));
});
