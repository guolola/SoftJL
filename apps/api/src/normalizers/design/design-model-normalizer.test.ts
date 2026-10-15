// Preserves design semantics and reports malformed models for structured repair.
import assert from "node:assert/strict";
import test from "node:test";
import { modelFixture } from "../../../../../packages/contracts/src/testing/model-fixtures.js";
import { deriveTableModel } from "@uml-platform/contracts";
import { parseDesignDiagramModelsOnly, parseDesignTraceabilityCoverageResult, parseDesignTraceabilityCoverageForSources } from "./design-model-normalizer.js";
const parse = (model: unknown) => parseDesignDiagramModelsOnly(JSON.stringify({ models: [model] })).models[0]!;
test("design parsing preserves all models and derives physical relational views", () => {
  for (const kind of ["architecture", "sequence", "navigation", "class", "component", "deployment", "table"]) {
    const model = modelFixture("design", kind);
    assert.deepEqual(parse(model), model.diagramKind === "table" ? deriveTableModel(model) : model);
  }
});
test("design activity is rejected; independent navigation is accepted", () => {
  assert.throws(() => parse(modelFixture("requirements", "activity")), /当前阶段不支持/);
  assert.equal(parse(modelFixture("design", "navigation")).diagramKind, "navigation");
});
test("invalid alt is reported, never downgraded to opt", () => {
  const model = modelFixture("design", "sequence") as any;
  model.fragments = [{ id: "f", type: "alt", label: "选择", messageIds: ["m"] }];
  assert.throws(() => parse(model), /fragment-branches/);
  assert.equal(model.fragments[0].type, "alt");
});
test("a legitimate loop can encompass all messages", () => {
  const model = modelFixture("design", "sequence") as any;
  model.fragments = [{ id: "f", type: "loop", label: "每个订单", condition: "仍有待处理订单", messageIds: ["m"] }];
  assert.deepEqual(parse(model), model);
});
test("invalid deployment links fail without removing legal artifact dependencies", () => {
  const model = modelFixture("design", "deployment") as any;
  model.artifacts = [{ id: "a", name: "a.jar" }, { id: "b", name: "b.jar" }];
  model.relationships.push({ id: "deps", type: "dependency", sourceId: "a", targetId: "b" });
  assert.deepEqual(parse(model), model);
  model.relationships[1].type = "communication";
  assert.throws(() => parse(model), /invalid-endpoints/);
});
test("unknown class enums, missing required names and stale package references report fields", () => {
  const model = modelFixture("design", "class") as any;
  model.classes[0].classKind = "controller"; assert.throws(() => parse(model), /classKind/);
  delete model.classes[0].classKind; delete model.title; assert.throws(() => parse(model), /title/);
  const architecture = modelFixture("design", "architecture") as any; architecture.components[0].packageId = "bad";
  assert.throws(() => parse(architecture), /missing-reference/);
});
test("parseDesignTraceabilityCoverageResult ignores nullable optional refs", () => {
  const designModels = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_add_book",
          sourceUseCaseId: "uc_add_book",
          sourceUseCaseName: "新增图书",
          title: "新增图书顺序图",
          summary: "新增图书顺序图的对象交互流程。",
          notes: [],
          participants: [
            {
              id: "librarian",
              name: "图书管理员",
              participantType: "actor",
            },
          ],
          messages: [],
          fragments: [],
        },
      ],
    }),
  ).models;
  const requirementModels = [
    {
      diagramKind: "usecase" as const,
      title: "图书馆用例",
      summary: "图书馆管理",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc_add_book",
          name: "新增图书",
          goal: "新增一本书",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    },
  ];

  const coverage = parseDesignTraceabilityCoverageResult(
    JSON.stringify({
      designModelTraceability: [
        {
          source: {
            modelId: null,
            diagramKind: "sequence",
            elementId: "librarian",
            elementKind: "participant",
            label: "图书管理员",
          },
          targets: [
            {
              modelId: null,
              diagramKind: "usecase",
              elementId: "uc_add_book",
              elementKind: "usecase",
              label: "新增图书",
            },
          ],
          upstreamDesignRefs: null,
        },
      ],
    }),
    designModels,
    requirementModels,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.traceability[0]?.source.elementId, "librarian");
});

test("parseDesignTraceabilityCoverageResult keeps valid entries when nearby trace refs are malformed", () => {
  const designModels = parseDesignDiagramModelsOnly(
    JSON.stringify({
      models: [
        {
          diagramKind: "sequence",
          modelId: "sequence:uc_add_book",
          sourceUseCaseId: "uc_add_book",
          sourceUseCaseName: "新增图书",
          title: "新增图书顺序图",
          summary: "新增图书顺序图的对象交互流程。",
          notes: [],
          participants: [
            {
              id: "librarian",
              name: "图书管理员",
              participantType: "actor",
            },
          ],
          messages: [],
          fragments: [],
        },
      ],
    }),
  ).models;
  const requirementModels = [
    {
      diagramKind: "usecase" as const,
      title: "图书馆用例",
      summary: "图书馆管理",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc_add_book",
          name: "新增图书",
          goal: "新增一本书",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    },
  ];

  const coverage = parseDesignTraceabilityCoverageResult(
    JSON.stringify({
      designModelTraceability: [
        {
          source: {
            modelId: null,
            diagram: "sequence-diagram",
            refId: "librarian",
            elementKind: null,
            label: null,
          },
          targets: [
            {
              modelId: null,
              diagramType: "use-case-diagram",
              targetId: "uc_add_book",
              elementKind: null,
              label: null,
            },
          ],
          upstreamDesignRefs: null,
        },
        {
          source: {
            diagramKind: "requirements",
            elementId: "missing-source",
          },
          targets: [],
        },
      ],
    }),
    designModels,
    requirementModels,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.traceability[0]?.source.diagramKind, "sequence");
  assert.equal(coverage.traceability[0]?.source.elementId, "librarian");
  assert.equal(coverage.traceability[0]?.targets[0]?.diagramKind, "usecase");
  assert.equal(coverage.traceability[0]?.targets[0]?.elementId, "uc_add_book");
  assert.equal(coverage.missingSources.length, 0);
});

test("parseDesignTraceabilityCoverageForSources accepts a single-object traceability payload", () => {
  const requiredSources = [
    {
      modelId: "sequence:uc_add_book",
      diagramKind: "sequence" as const,
      elementId: "librarian",
      elementKind: "participant",
      label: "图书管理员",
    },
  ];
  const requirementModels = [
    {
      diagramKind: "usecase" as const,
      title: "图书馆用例",
      summary: "图书馆管理",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc_add_book",
          name: "新增图书",
          goal: "新增一本书",
          preconditions: [],
          postconditions: [],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    },
  ];

  const coverage = parseDesignTraceabilityCoverageForSources(
    JSON.stringify({
      designModelTraceability: {
        source: {
          modelID: "sequence:uc_add_book",
          diagram: "sequence-diagram",
          refId: "librarian",
        },
        targets: [
          {
            diagram: "use-case-diagram",
            refId: "uc_add_book",
          },
        ],
      },
    }),
    requiredSources,
    requirementModels,
  );

  assert.equal(coverage.traceability.length, 1);
  assert.equal(coverage.missingSources.length, 0);
});
