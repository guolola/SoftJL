// Validates real provider schemas with the API's JSON Schema compiler and round-trips nullable candidates through backend acceptance.
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { collectModelRefs, deriveTableModel, getStageModelSchemas, contractResponseSchema,
  contextDiagramSpecSchema, feasibilityBusinessFlowSchema, completeFeasibilityImplementationPlanSchema,
  type DiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "@uml-platform/contracts/testing";
import { GENERATE_MODELS_RESPONSE_FORMAT } from "./requirement-model-response-format.js";
import { GENERATE_DESIGN_MODELS_RESPONSE_FORMAT } from "./design-response-formats.js";
import { GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT, GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT,
  GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT } from "./feasibility-response-formats.js";
import { EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT } from "./general-response-formats.js";
import { assertGeneratedModelCandidate, assertFeasibilityCandidate } from "../../../normalizers/modeling/model-candidate-validation.js";
import { modelSourceElements } from "../../../normalizers/traceability/model-source-elements.js";
import { normalizeContractNulls } from "../../../normalizers/structured-output/contract-nulls.js";
import { parseRequirementDiagramModelsResult, parseGeneratedAnalysisModels } from "../../../normalizers/requirements/requirement-model-normalizer.js";
import { parseDesignDiagramModelsResult } from "../../../normalizers/design/design-model-normalizer.js";
import { validateRequirementRules } from "../../../normalizers/requirements/requirement-rule-normalizer.js";
import { splitRequirementInput } from "../../../normalizers/requirements/requirement-source-units.js";
import { librarySeatFeasibilityContext, librarySeatFeasibilityFlow, librarySeatFeasibilityPlan } from "../../../runs/demo/fixtures/library-seat-feasibility-fixture.js";

type Schema = Record<string, any>;

// Emulate strict output: every property is present, with null placeholders for omitted optional fields.
function providerCandidate(schema: Schema, value: any): any {
  if (value === undefined || value === null) return null;
  if (schema.anyOf) {
    const variant = schema.anyOf.find((option: Schema) => option.properties && typeof value === "object" &&
      Object.entries(option.properties).every(([key, field]) => !(field as Schema).enum || value[key] === undefined || (field as Schema).enum.includes(value[key])))
      ?? schema.anyOf.find((option: Schema) => option.type === (Array.isArray(value) ? "array" : typeof value));
    assert.ok(variant, "The fixture must match one declared provider variant");
    return providerCandidate(variant, value);
  }
  if (Array.isArray(value)) return value.map(item => providerCandidate(schema.items, item));
  if (schema.properties) return Object.fromEntries(Object.entries(schema.properties).map(([key, field]) => [key, providerCandidate(field as Schema, value[key])]));
  return value;
}

test("all model families accept strict-schema candidates including null placeholders on their first backend validation", async t => {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, useDefaults: false, removeAdditional: false, allErrors: true } } });
  t.after(() => app.close());
  const rule = { id: "R1", type: "functional" as const, text: "用户提交订单。", sourceFragment: "用户提交订单。" };
  const usecase = modelFixture("requirements", "usecase") as DiagramModelSpec;
  const upstream = modelFixture("requirements", "prototype");
  if (upstream.diagramKind !== "prototype") throw new Error("fixture");
  upstream.nodes.forEach(node => { node.sourceRequirementIds = [rule.id]; });
  const upstreamRef = collectModelRefs([upstream], true).refs[0]!;
  const cases: Array<{ name: string; schema: Schema; candidate: unknown; accept: (value: unknown) => void }> = [];
  for (const stage of ["requirements", "design"] as const) for (const contract of getStageModelSchemas(stage)) {
    const kind = contract.shape.diagramKind.value;
    const model = modelFixture(stage, kind);
    if (model.diagramKind === "analysis") {
      model.fragments = [{ id: "optional", type: "opt", label: "可选处理", messageIds: ["m"],
        branches: [{ id: "branch", label: "执行处理", messageIds: ["m"] }] }];
      model.activations = [{ id: "active", participantId: "b", startMessageId: "m", endMessageId: "m" }];
      for (const element of modelSourceElements(model)) element.value.sourceElementIds = ["case"];
    }
    if (kind === "context") for (const element of modelSourceElements(model)) element.value.sourceRequirementIds = [rule.id];
    const models = [model];
    const format = stage === "requirements" ? GENERATE_MODELS_RESPONSE_FORMAT : GENERATE_DESIGN_MODELS_RESPONSE_FORMAT;
    const candidate = stage === "requirements" ? { models, requirementModelTraceability: kind === "analysis" ? []
      : collectModelRefs(models, true).refs.map(target => ({ ruleId: rule.id, target })) }
      : { models, designModelTraceability: collectModelRefs(models.map(item => item.diagramKind === "table" ? deriveTableModel(item) : item), true).refs
        .map(source => ({ source, targets: [upstreamRef] })) };
    cases.push({ name: `${stage}/${kind}`, schema: format.json_schema.schema, candidate,
      accept(value) {
        const raw = JSON.stringify(value);
        assertGeneratedModelCandidate(raw, { stage, kinds: [kind], rules: [rule], upstream: stage === "design" ? [upstream] : kind === "analysis" ? [usecase] : undefined });
        if (stage === "design") parseDesignDiagramModelsResult(raw, [upstream]);
        else if (kind === "analysis") parseGeneratedAnalysisModels(raw);
        else parseRequirementDiagramModelsResult(raw, [rule]);
      } });
  }
  const feasibilityRules = Array.from({ length: 11 }, (_, i) => ({ id: `r${i + 1}`, type: "functional" as const, text: `规则 ${i + 1}` }));
  for (const [kind, schema, format, candidate] of [
    ["context", contextDiagramSpecSchema, GENERATE_FEASIBILITY_CONTEXT_RESPONSE_FORMAT, librarySeatFeasibilityContext],
    ["business-flow", feasibilityBusinessFlowSchema, GENERATE_FEASIBILITY_BUSINESS_FLOW_RESPONSE_FORMAT, librarySeatFeasibilityFlow],
    ["implementation", completeFeasibilityImplementationPlanSchema, GENERATE_FEASIBILITY_IMPLEMENTATION_RESPONSE_FORMAT, librarySeatFeasibilityPlan],
  ] as const) cases.push({ name: `feasibility/${kind}`, schema: format.json_schema.schema, candidate,
    accept(value) {
      const cleaned = normalizeContractNulls(value, contractResponseSchema(schema));
      assertFeasibilityCandidate(cleaned, { schema, kind, rules: feasibilityRules, upstream: [librarySeatFeasibilityContext] });
      schema.parse(cleaned);
    } });
  cases.push({ name: "requirements/rules", schema: EXTRACT_REQUIREMENT_RULES_RESPONSE_FORMAT.json_schema.schema,
    candidate: { rules: [{ ...rule, id: "r1" }] }, accept(value) { validateRequirementRules(value, { sourceText: rule.text, units: splitRequirementInput(rule.text) }); } });
  for (const [index, entry] of cases.entries()) app.post(`/schema/${index}`, { schema: { body: entry.schema } }, async () => ({ valid: true }));
  await app.ready();
  for (const [index, entry] of cases.entries()) {
    const candidate = providerCandidate(entry.schema, entry.candidate);
    const response = await app.inject({ method: "POST", url: `/schema/${index}`, payload: candidate });
    assert.equal(response.statusCode, 200, `${entry.name}: ${response.body}`);
    assert.doesNotThrow(() => entry.accept(candidate), entry.name);
  }
  assert.equal(cases.length, 19);
});

test("analysis provenance cannot be null, omitted or empty in the schema sent to providers", async t => {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, useDefaults: false, removeAdditional: false } } });
  t.after(() => app.close());
  const variants = (GENERATE_MODELS_RESPONSE_FORMAT.json_schema.schema as Schema).properties.models.items.anyOf;
  const analysis = variants.find((variant: Schema) => variant.properties.diagramKind.enum[0] === "analysis");
  const elements = [analysis.properties.participants.items, analysis.properties.messages.items, analysis.properties.fragments.items,
    analysis.properties.fragments.items.properties.branches.items, analysis.properties.activations.items];
  for (const element of elements) {
    assert.equal(element.properties.sourceElementIds.type, "array");
    assert.equal(element.properties.sourceElementIds.minItems, 1);
    assert.ok(element.required.includes("sourceElementIds"));
  }
  app.post("/analysis", { schema: { body: analysis } }, async () => ({ valid: true }));
  const source = modelFixture("requirements", "analysis");
  for (const element of modelSourceElements(source)) element.value.sourceElementIds = ["case"];
  const candidate = providerCandidate(analysis, source);
  for (const invalid of [undefined, null, []]) {
    const broken = structuredClone(candidate);
    if (invalid === undefined) delete broken.participants[0].sourceElementIds;
    else broken.participants[0].sourceElementIds = invalid;
    assert.equal((await app.inject({ method: "POST", url: "/analysis", payload: broken })).statusCode, 400);
  }
  for (const change of [
    (value: any) => { value.notes = "错误的字符串"; },
    (value: any) => { value.messages[0].parameters = "错误的字符串"; },
    (value: any) => { value.diagramKind = "requirements"; },
    (value: any) => { value.messages[0].type = "response"; },
  ]) {
    const broken = structuredClone(candidate); change(broken);
    assert.equal((await app.inject({ method: "POST", url: "/analysis", payload: broken })).statusCode, 400);
  }
});
