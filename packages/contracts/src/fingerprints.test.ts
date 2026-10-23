// Verifies design fingerprints ignore non-contract metadata while retaining semantic model changes.
import assert from "node:assert/strict";
import test from "node:test";
import { designInputFingerprint } from "./fingerprints.js";
import { activeRequirementModels } from "./requirements/active-requirement-models.js";

function activityModel() {
  return {
    diagramKind: "activity" as const,
    title: "登录流程",
    summary: "验证码登录流程",
    notes: [],
    swimlanes: [],
    nodes: [
      { id: "start", type: "start" as const, name: "开始" },
      {
        id: "send",
        type: "activity" as const,
        name: "发送验证码",
        input: [],
        output: [],
      },
      { id: "end", type: "end" as const, name: "结束" },
    ],
    relationships: [
      {
        id: "flow",
        type: "control_flow" as const,
        sourceId: "start",
        targetId: "send",
        condition: "继续",
      },
    ],
  };
}

test("design fingerprint ignores unknown activity relationship labels", () => {
  const model = activityModel();
  const withEditorOnlyLabel = structuredClone(model) as Record<string, unknown> & {
    relationships: Array<Record<string, unknown>>;
  };
  withEditorOnlyLabel.relationships[0]!.label = "新关系";

  assert.equal(
    designInputFingerprint([withEditorOnlyLabel], []),
    designInputFingerprint([model], []),
  );
});

test("design fingerprint changes when an activity relationship endpoint changes", () => {
  const model = activityModel();
  const changed = structuredClone(model);
  changed.relationships[0]!.targetId = "end";

  assert.notEqual(
    designInputFingerprint([changed], []),
    designInputFingerprint([model], []),
  );
});

test("26 sources canonicalize to 15 across generation, retry and replay, while real changes still stale", () => {
  const usecase = { diagramKind: "usecase", title: "当前用例", actors: [], useCases: Array.from({ length: 9 }, (_, index) => ({ id: `uc-${index}` })), relationships: [] };
  const active = [usecase, ...Array.from({ length: 9 }, (_, index) => ({ diagramKind: "analysis", modelId: `analysis:uc-${index}`, sourceUseCaseId: `uc-${index}` })), ...Array.from({ length: 5 }, (_, index) => ({ ...activityModel(), modelId: `activity-${index}` }))];
  const legacy = [...active, ...Array.from({ length: 11 }, (_, index) => ({ diagramKind: "analysis", modelId: `analysis:UC-${index}` }))];
  assert.equal(legacy.length, 26);
  assert.equal(activeRequirementModels(legacy).length, 15);
  assert.deepEqual(activeRequirementModels(legacy), active);
  assert.equal(designInputFingerprint(legacy, []), designInputFingerprint(active, []));
  const changed = structuredClone(active); changed[1] = { ...changed[1], title: "人工改变分析" };
  assert.notEqual(designInputFingerprint(changed, []), designInputFingerprint(active, []));
  assert.equal(legacy.length, 26);
});
