// Verifies design-led coding sources, upstream privacy, scopes and source-only change detection.
import assert from "node:assert/strict";
import test from "node:test";
import {
  snapshotInputFingerprint,
  designInputFingerprint,
} from "@uml-platform/contracts";
import { artifactDirectory, buildContext, compareManifest } from "./implementation-context.js";
import { withImplementationArtifacts } from "./implementation-artifacts.js";
import { contentHash } from "./source-artifacts.js";
const whole = { requirementIds: [], artifactIds: [] };
function fixture() {
  const rule = {
    id: "BORROW",
    category: "业务规则",
    text: "每名学生最多借阅5本；使用 Spring Boot、Vue 和 MySQL",
    relatedDiagrams: ["usecase"],
  };
  const model = {
    diagramKind: "usecase",
    modelId: "borrow",
    title: "借阅",
    summary: "借阅归还",
    notes: [],
    actors: [],
    useCases: [],
    systemBoundaries: [],
    relationships: [],
  };
  const ref = {
    diagramKind: "usecase",
    modelId: "borrow",
    elementId: "borrow",
    elementKind: "usecase",
    label: "借阅",
  };
  const design = {
    diagramKind: "class",
    modelId: "loan",
    title: "借阅实体",
    summary: "借阅设计",
    notes: [],
    classes: [{ id: "borrow", name: "Loan", attributes: [], operations: [] }],
    interfaces: [],
    enums: [],
    relationships: [],
  };
  const requirementModelTraceability = [
    { ruleId: "BORROW", target: ref, reviewStatus: "confirmed" },
  ];
  const state = {
    requirementText: rule.text,
    rules: [rule],
    models: { borrow: model, duplicate: { ...model, modelId: "other" } },
    plantUml: { borrow: "@startuml\n@enduml" },
    designModels: { loan: design },
    requirementModelTraceability,
    designModelTraceability: [
      {
        source: { ...ref, diagramKind: "class", modelId: "loan" },
        targets: [ref],
      },
    ],
    requirementInputFingerprint: "",
    diagramInputFingerprints: { borrow: "" },
    designInputFingerprints: { loan: "" },
    providerConfig: { apiKey: "secret" },
  };
  state.requirementInputFingerprint = snapshotInputFingerprint({
    requirementText: state.requirementText,
    rules: state.rules,
  });
  state.diagramInputFingerprints.borrow = state.requirementInputFingerprint;
  state.designInputFingerprints.loan = designInputFingerprint(
    Object.values(state.models),
    requirementModelTraceability,
  );
  return state;
}
test("coding context keeps full designs and engineering constraints without upstream bodies", () => {
  const state = { ...fixture(), feasibilityInputs: { targetEnvironment: "Spring Boot + Vue + MySQL", teamSkills: "Java" } };
  const before = structuredClone(state);
  const context = buildContext(state, whole);
  const text = JSON.stringify(context);
  assert.match(text, /Spring Boot/);
  assert.ok(context.artifacts.some((artifact) => artifact.id === "design:loan"));
  assert.ok(context.artifacts.every((artifact) => artifact.stage !== "analysis"));
  assert.ok(!context.artifacts.some((artifact) => artifact.id.startsWith("rule:") || artifact.id === "requirements:source"));
  assert.doesNotMatch(text, /每名学生最多借阅5本|apiKey|Sandpack/);
  assert.deepEqual(state, before);
  assert.equal(contentHash({ b: 2, a: 1 }), contentHash({ a: 1, b: 2 }));
});

test("acceptance projection retains test evidence and IDs without review state or provenance", () => {
  const state = { ...fixture(), requirementBaseline: { requirements: [{
    id: "BORROW-ATOMIC", sourceRuleId: "BORROW", sourceFragment: "private-original-fragment", type: "functional",
    actor: "private-actor", subject: "系统", action: "private-action", object: "书", condition: "private-condition",
    outcome: "private-outcome", confidence: 1, status: "accepted", criticality: "high",
    acceptanceCriteria: ["第5本可借，第6本拒绝"], fieldProvenance: {
      acceptanceCriteria: { source: "source-text", status: "accepted", originalValue: "private-provenance", rationale: "private-rationale" },
    },
  }] } };
  const context = buildContext(state, whole);
  const acceptance = context.artifacts.find((artifact) => artifact.id === "requirement:BORROW-ATOMIC")!;
  assert.deepEqual(acceptance.payload.requirement, {
    id: "BORROW-ATOMIC", sourceRuleId: "BORROW", acceptanceCriteria: ["第5本可借，第6本拒绝"],
  });
  assert.doesNotMatch(JSON.stringify(context), /private-original|private-actor|private-action|private-condition|private-outcome|private-provenance|private-rationale/);
});

test("functional and design scopes preserve trace IDs without bringing back requirement models", () => {
  for (const scope of [{ requirementIds: ["BORROW"], artifactIds: [] }, { requirementIds: [], artifactIds: ["design:loan"] }]) {
    const context = buildContext(fixture(), scope);
    assert.ok(context.artifacts.some((artifact) => artifact.id === "design:loan"));
    assert.ok(context.artifacts.every((artifact) => artifact.stage !== "analysis" && !artifact.id.startsWith("rule:")));
    assert.deepEqual(context.unknownIds, []);
    const design = context.artifacts.find((artifact) => artifact.id === "design:loan")!;
    assert.ok((design.payload.upstreamVersions as { artifactId: string }[]).some((version) => version.artifactId === "analysis:borrow"));
    assert.ok(!design.dependencies.some((id) => id.startsWith("analysis:")));
  }
  assert.deepEqual(buildContext(fixture(), { requirementIds: [], artifactIds: ["analysis:borrow"] }).unknownIds, ["analysis:borrow"]);
});

test("internal upstream changes still invalidate design freshness and old upstream manifests are removed", () => {
  const state = fixture();
  const before = buildContext(state, whole);
  state.rules[0].text = "每名学生最多借阅8本";
  const after = buildContext(state, whole);
  assert.equal(after.artifacts.find((artifact) => artifact.id === "design:loan")?.version.freshness, "stale");
  assert.ok(compareManifest(before.manifest, after.manifest).some((change) => change.artifactId === "design:loan"));
  const legacy = { artifactId: "analysis:borrow", contentHash: "old", inputFingerprint: null, freshness: "unknown" as const };
  assert.ok(compareManifest([...before.manifest, legacy], after.manifest).some((change) => change.artifactId === legacy.artifactId && change.change === "deleted"));
  assert.doesNotMatch(JSON.stringify(after), /每名学生最多借阅8本/);
});

test("UI and document changes cannot enter or invalidate coding inputs", () => {
  const state = fixture();
  const initial = buildContext(state, whole);
  assert.deepEqual(buildContext({ ...state, activeTab: "code", progress: 0.5,
    documents: [{ title: "private-document", paragraphs: ["private-body"] }], documentLibrary: { version: 2 },
  }, whole), initial);
});

test("historical design reviews stay private while saved model/source edits remain visible", () => {
  const state = { ...fixture(), autoGeneratedUpstreamReviews: { generated: {
    artifactId: "loan", artifactType: "design-model", status: "pending",
  } }, manualModelEditStatus: { loan: { status: "dirty" } } };
  const before = structuredClone(state);
  const design = buildContext(state, whole).artifacts.find((artifact) => artifact.id === "design:loan")!;
  assert.equal("reviewStatus" in design, false);
  assert.equal("reviewStatus" in artifactDirectory(design), false);
  assert.equal(design.sourceConsistency, "conflict");
  assert.deepEqual(state, before);
});

test("repaired and unresolved review records cannot alter MCP payloads, tasks or versions", () => {
  const state = { ...fixture(), requirementBaseline: { requirements: [{
    id: "BORROW-ATOMIC", sourceRuleId: "BORROW", sourceFragment: "借阅", type: "functional",
    actor: "学生", subject: "系统", action: "借阅", object: "书", condition: null,
    outcome: "保存记录", confidence: 1, status: "accepted", criticality: "high",
    acceptanceCriteria: ["第5本可借，第6本拒绝"], fieldProvenance: {},
  }] } };
  const initial = withImplementationArtifacts(buildContext(state, whole), "project");
  for (const status of ["pending", "rejected", "conflict", "accepted", "legacy-review-value"]) {
    const withReviews = { ...state,
      autoGeneratedUpstreamReviews: { design: { artifactId: "loan", artifactType: "design-model", status, issues: ["private-review-opinion"] } },
      visualReviews: { "design:loan": { status: "pending_review", issues: ["private-review-opinion"],
        findings: [{ observation: "private-finding" }], repairAttempts: status === "accepted" ? 1 : 0,
        repairHistory: [{ status, reason: "private-repair-reason" }], confirmedAt: "private-confirmation" } },
      requirementReviewCandidates: { BORROW: { status, repairRationale: "private-candidate" } },
      requirementQualityReport: { summary: "private-quality-opinion" },
      requirementBaseline: { requirements: [{ ...state.requirementBaseline.requirements[0],
        status,
        fieldProvenance: { acceptanceCriteria: { source: "legacy-review-source", status, rationale: "private-field-review" } },
      }] },
      designModelTraceability: state.designModelTraceability.map((trace) => ({ ...trace,
        reviewStatus: status, mappingSource: "auto-filled-pending-review", confidence: "low", rationale: "private-trace-opinion",
      })),
    };
    const before = structuredClone(withReviews);
    const context = withImplementationArtifacts(buildContext(withReviews, whole), "project");
    assert.deepEqual(context, initial);
    assert.doesNotMatch(JSON.stringify(context), /private-|reviewStatus|fieldProvenance|repairHistory|source-review|trace-review|acceptance-criteria-unconfirmed/);
    assert.deepEqual(withReviews, before);
  }
  const changed = structuredClone(state);
  changed.designModels.loan.classes[0].name = "UpdatedLoan";
  assert.notEqual(buildContext(changed, whole).version, buildContext(state, whole).version);
});

test("design dependency cycles terminate without exporting analysis bodies", () => {
  const state = fixture();
  state.designModels = { loan: state.designModels.loan, second: { ...state.designModels.loan, modelId: "second" } } as typeof state.designModels;
  const ref = (id: string) => ({ diagramKind: "class", modelId: id, elementId: id, elementKind: "class", label: id });
  const source = { diagramKind: "usecase", elementId: "borrow", elementKind: "usecase", label: "borrow" };
  state.designModelTraceability = [
    { source: ref("loan"), targets: [source], upstreamDesignRefs: [ref("second")] },
    { source: ref("second"), targets: [source], upstreamDesignRefs: [ref("loan")] },
  ] as typeof state.designModelTraceability;
  const context = buildContext(state, { requirementIds: [], artifactIds: ["design:loan"] });
  assert.ok(context.artifacts.some((artifact) => artifact.id === "design:second"));
  assert.ok(context.artifacts.every((artifact) => artifact.stage !== "analysis"));
});

test("missing design explains the prerequisite and does not expose a raw requirement fallback", () => {
  const context = buildContext({ requirementText: "从需求自行设计", rules: fixture().rules }, whole);
  assert.deepEqual(context.artifacts, []);
  assert.ok(context.issues.some((issue) => issue.includes("请先在平台补齐设计")));
  assert.doesNotMatch(JSON.stringify(context), /从需求自行设计/);
});
