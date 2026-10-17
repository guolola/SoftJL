// Checks that model names, recommendations and exclusions resolve only explicit generation choices.
import assert from "node:assert/strict";
import test from "node:test";
import { standardDiagramKinds } from "@uml-platform/contracts";
import { resolveStandardGenerationSelection, standardGenerationIntroduction } from "./standard-generation-scope.js";

test("a pasted requirement does not authorize all models, and model questions do not authorize generation", () => {
  assert.equal(resolveStandardGenerationSelection("高校教室管理系统。管理员维护教室，师生自主预约，系统生成报修工单。", false), undefined);
  assert.equal(resolveStandardGenerationSelection("用例图和类图有什么区别？", true), undefined);
  assert.equal(resolveStandardGenerationSelection("只解释 E-R 图，不要生成", true), undefined);
  assert.match(standardGenerationIntroduction(), /你希望生成哪些模型/);
  assert.match(standardGenerationIntroduction(), /数据库表关系图/);
  assert.match(standardGenerationIntroduction("en"), /Which models/);
});

test("accepts named, numbered, recommended and all-model choices without silently adding excluded types", () => {
  assert.deepEqual(resolveStandardGenerationSelection("只生成用例图和类图", false), ["usecase", "class"]);
  assert.deepEqual(resolveStandardGenerationSelection("不要生成类图，只要用例图", true), ["usecase"]);
  assert.deepEqual(resolveStandardGenerationSelection("只要用例图不要类图", true), ["usecase"]);
  assert.deepEqual(resolveStandardGenerationSelection("不要类图和用例图，只生成架构图", true), ["architecture"]);
  assert.deepEqual(resolveStandardGenerationSelection("1、2、3", true), ["function", "usecase", "activity"]);
  assert.deepEqual(resolveStandardGenerationSelection("按推荐方案", true), ["function", "usecase", "activity"]);
  assert.deepEqual(resolveStandardGenerationSelection("生成全部八类图", true), [...standardDiagramKinds]);
  assert.deepEqual(resolveStandardGenerationSelection("generate a class diagram", false), ["class"]);
  assert.deepEqual(resolveStandardGenerationSelection('只修改用例图：把“教室空闲状态检索”重命名为“查询教室空闲状态”。保留该图其他节点、关系和所有ID，不修改功能结构图、总体架构图或其他产物。', false), ["usecase"]);
  assert.deepEqual(resolveStandardGenerationSelection("用例图修改名称，类图不修改，总体架构图暂不调整", false), ["usecase"]);
});
