// Validates the legal-case baseline and injects structural faults for every supported review profile.
import test from "node:test";
import assert from "node:assert/strict";
import { getStageModelSchemas, validateModelInput, type ModelingStage } from "./model-semantics.js";
import { modelReviewFixtures } from "./testing/model-review-fixtures.js";

for (const stage of ["feasibility", "requirements", "design"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  const kind = schema.shape.diagramKind.value;
  test(`${stage}.${kind}: legal complex cases pass and missing references/illegal relation types are detected`, () => {
    for (const { name, model } of modelReviewFixtures(stage, kind)) assert.deepEqual(validateModelInput(model, stage).filter((item) => item.severity === "error"), [], name);
    const model: any = structuredClone(modelReviewFixtures(stage, kind)[0]!.model);
    const relationships = "messages" in model ? model.messages : model.relationships;
    relationships[0].targetId = "missing-target";
    assert.ok(validateModelInput(model, stage).some((item) => item.severity === "error"));
    const wrongType: any = structuredClone(modelReviewFixtures(stage, kind)[0]!.model);
    ("messages" in wrongType ? wrongType.messages : wrongType.relationships)[0].type = "unsupported-relation";
    assert.ok(validateModelInput(wrongType, stage).some((item) => item.severity === "error"));
    const duplicate: any = structuredClone(modelReviewFixtures(stage, kind)[0]!.model);
    const collections: Record<string, string> = { context: "people", function: "nodes", usecase: "actors", class: "classes", activity: "nodes", analysis: "participants", sequence: "participants", architecture: "components", component: "components", deployment: "nodes", prototype: "nodes", navigation: "nodes", table: "tables" };
    const collection = duplicate[collections[kind]!]; collection.push(structuredClone(collection[0]));
    assert.ok(validateModelInput(duplicate, stage).some((item) => item.severity === "error"), "duplicate identities cannot pass");
    const illegal: any = structuredClone(modelReviewFixtures(stage, kind)[0]!.model);
    const edge = "messages" in illegal ? illegal.messages[0] : illegal.relationships[0];
    if (kind === "context") edge.targetId = edge.sourceId;
    else if (kind === "function") illegal.relationships.push({ ...edge, id: "cycle", sourceId: edge.targetId, targetId: edge.sourceId });
    else if (kind === "usecase") edge.sourceId = edge.targetId;
    else if (kind === "class") { illegal.enums.push({ id: "enum", name: "Status", literals: ["READY"] }); edge.type = "inheritance"; edge.targetId = "enum"; }
    else if (kind === "activity") edge.targetId = "start";
    else if (kind === "analysis" || kind === "sequence") illegal.fragments.push({ id: "invalid-alt", type: "alt", label: "只有一个分支", messageIds: ["m"], branches: [{ id: "only", label: "分支", messageIds: ["m"] }] });
    else if (kind === "architecture" || kind === "component") [edge.sourceId, edge.targetId] = [edge.targetId, edge.sourceId];
    else if (kind === "prototype" || kind === "navigation") edge.type = "contains";
    else if (kind === "deployment") illegal.nodes[0].parentId = "e";
    else if (kind === "table") illegal.tables[1].relationalConstraints[1].referenceColumnIds = [];
    assert.ok(validateModelInput(illegal, stage).some((item) => item.severity === "error"), "invalid endpoint roles, ownership cycles, fragment operands or relational constraints cannot pass");
  });
}
