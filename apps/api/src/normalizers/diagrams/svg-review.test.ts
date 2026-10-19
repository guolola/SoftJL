// Checks missing and parallel SVG links independently from visual-provider observations.
import assert from "node:assert/strict";
import test from "node:test";
import type { ModelRenderMapping } from "@uml-platform/contracts";
import { verifySvgMapping } from "./svg-review.js";

const mapping = {
  mode: "native", elements: [{ elementId: "actor", alias: "a" }, { elementId: "case", alias: "b" }],
  relationships: [{ relationshipId: "r1", sourceId: "actor", targetId: "case", statement: "a -- b" }],
} as ModelRenderMapping;
const entities = '<svg><g id="elem_a"/><g id="elem_b"/>';
test("ER cardinality bars never become inheritance; real inheritance and ER omissions still fail", () => {
  for (const [symbol, type] of [["||..o|", "association"], ["||..o{", "crowfoot"]]) {
    const er = structuredClone(mapping); er.relationships[0]!.symbol = symbol;
    er.relationships[0]!.statement = `a ${symbol} b`;
    const svg = `${entities}<g class="link" data-entity-1="a" data-entity-2="b" data-link-type="${type}"/></svg>`;
    assert.deepEqual(verifySvgMapping(svg, er, "table", "table").findings, []);
    assert.equal(verifySvgMapping(`${entities}</svg>`, er, "table", "table").findings[0]?.code, "missing-svg-relationship");
    er.relationships[0]!.symbol = "<|--";
    assert.equal(verifySvgMapping(svg, er, "class", "class").findings[0]?.code, "wrong-svg-relationship-symbol");
  }
});
test("native use case SVG with all association links missing fails deterministic mapping", () => {
  const result = verifySvgMapping(`${entities}</svg>`, mapping, "usecase", "usecase");
  assert.equal(result.identifiable, true);
  assert.deepEqual(result.findings.map((item) => item.code), ["missing-svg-relationship"]);
});
test("parallel relationships require separate SVG links; containment comments are not links", () => {
  const parallel = structuredClone(mapping);
  parallel.relationships.push({ ...parallel.relationships[0]!, relationshipId: "r2" },
    { ...parallel.relationships[0]!, relationshipId: "inside", statement: "' @containment a b" });
  const svg = `${entities}<g class="link" id="link_a_b" data-entity-1="a" data-entity-2="b"/></svg>`;
  assert.deepEqual(verifySvgMapping(svg, parallel, "class", "class").findings.map((item) => item.relationshipId), ["r2"]);
});
test("obsolete activity mappings are rejected rather than treated as current renders", () => {
  assert.throws(() => verifySvgMapping(`${entities}</svg>`, mapping, "activity", "activity"), /must use explicit-graph/);
});

test("current PlantUML qualified names resolve generated IDs for nested nodes and association links", () => {
  const nodes = '<svg><g class="entity" data-qualified-name="a" id="ent0002"/><g class="entity" data-qualified-name="boundary.b" id="ent0004"/>';
  const link = '<g class="link" data-entity-1="ent0002" data-entity-2="ent0004" id="lnk8"/>';
  assert.deepEqual(verifySvgMapping(`${nodes}${link}</svg>`, mapping, "usecase", "usecase"), { identifiable: true, findings: [] });
  assert.deepEqual(verifySvgMapping(`${nodes}</svg>`, mapping, "usecase", "usecase").findings.map((item) => item.code), ["missing-svg-relationship"]);
});

test("SVG comments cannot substitute for a missing node and generated links remain one-to-one", () => {
  const missing = '<svg><g class="entity" data-qualified-name="a" id="ent0002"/><!-- <g data-qualified-name="b" id="ent0004"/> --></svg>';
  assert.ok(verifySvgMapping(missing, mapping, "usecase", "usecase").findings.some((item) => item.elementId === "case"));
  const parallel = structuredClone(mapping);
  parallel.relationships.push({ ...parallel.relationships[0]!, relationshipId: "r2" });
  const svg = '<svg><g data-qualified-name="a" id="ent0002"/><g data-qualified-name="b" id="ent0004"/><g class="link" data-entity-1="ent0004" data-entity-2="ent0002" id="lnk8"/></svg>';
  assert.deepEqual(verifySvgMapping(svg, parallel, "usecase", "usecase").findings.map((item) => item.relationshipId), ["r2"]);
});

test("current sequence messages resolve participant UIDs independently of head and lifeline IDs", () => {
  const nodes = '<svg><g class="participant" data-entity-uid="part1" data-qualified-name="a" id="part1-head"/><g class="participant" data-entity-uid="part2" data-qualified-name="b" id="part2-head"/>';
  const message = '<g class="message" data-entity-1="part1" data-entity-2="part2" id="msg1"/>';
  assert.deepEqual(verifySvgMapping(`${nodes}${message}</svg>`, mapping, "sequence", "sequence"), { identifiable: true, findings: [] });
  assert.deepEqual(verifySvgMapping(`${nodes}</svg>`, mapping, "sequence", "sequence").findings.map((item) => item.code), ["missing-svg-relationship"]);
  assert.deepEqual(verifySvgMapping(`${nodes}<g class="message" data-entity-1="part1" data-entity-2="missing"/></svg>`, mapping, "sequence", "sequence").findings.map((item) => item.code), ["missing-svg-relationship"]);
});

test("direction, relationship symbols, qualified ownership and undecodable identity have distinct evidence", () => {
  const directed = structuredClone(mapping); directed.relationships[0]!.symbol = "-->";
  const reversed = '<svg><g data-qualified-name="a" id="ent1"/><g data-qualified-name="b" id="ent2"/><g class="link" data-entity-1="ent2" data-entity-2="ent1"/></svg>';
  assert.ok(verifySvgMapping(reversed, directed, "context", "context").findings.some((item) => item.relationshipId === "r1"));
  const association = structuredClone(mapping); association.relationships[0]!.symbol = "--";
  const wrongSymbol = '<svg><g data-qualified-name="a" id="ent1"/><g data-qualified-name="b" id="ent2"/><g class="link" data-entity-1="ent1" data-entity-2="ent2" data-link-type="dependency"/></svg>';
  assert.ok(verifySvgMapping(wrongSymbol, association, "usecase", "usecase").findings.some((item) => item.code === "wrong-svg-relationship-symbol"));
  const owned = structuredClone(mapping); owned.elements[1]!.ownerId = "actor";
  const wrongOwner = '<svg><g data-qualified-name="a"/><g data-qualified-name="other.b"/></svg>';
  assert.ok(verifySvgMapping(wrongOwner, owned, "architecture", "architecture").findings.some((item) => item.code === "wrong-svg-owner"));
  const partial = '<svg><g class="entity" data-qualified-name="a"/><g class="entity" id="ent2"/></svg>';
  const check = verifySvgMapping(partial, mapping, "usecase", "usecase");
  assert.deepEqual(check.findings, []); assert.ok(check.inconclusive?.length);
});
