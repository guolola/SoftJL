// Proves source encoding is reversible for every supported model, including conditions and nested fragments.
import assert from "node:assert/strict";
import test from "node:test";
import { getStageModelSchemas, type ModelingStage } from "@uml-platform/contracts";
import { modelFixture } from "../../contracts/src/testing/model-fixtures.js";
import { compactPromptData, expandPromptData } from "./prompt-data.js";
for (const stage of ["requirements", "design", "feasibility"] as ModelingStage[]) for (const schema of getStageModelSchemas(stage)) {
  test(`${stage}/${schema.shape.diagramKind.value} source packing preserves every business field`, () => {
    const source = modelFixture(stage, schema.shape.diagramKind.value);
    source.notes.push("金额不少于5000元时需要审核；权限不足时拒绝并保留记录。");
    assert.deepEqual(expandPromptData(compactPromptData(source)), source);
    assert.ok(JSON.stringify(compactPromptData(source)).length <= JSON.stringify(source).length);
  });
}
