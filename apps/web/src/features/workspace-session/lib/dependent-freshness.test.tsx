// Verifies local edits and repository reloads preserve only the affected dependency branches as stale.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { designInputFingerprint, snapshotInputFingerprint, type DiagramModelSpec, type DesignDiagramModelSpec } from "@uml-platform/contracts";
import { modelFixture } from "../../../../../../packages/contracts/dist/testing/model-fixtures";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/mock-repository";
import { createRule, createWorkspaceRecord, withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { useWorkspaceSession } from "../state";

function workspace() {
  const rules = [createRule({ id: "r-data", text: "记录订单数据",  }),
    createRule({ id: "r-ui", text: "浏览订单页面",  })];
  const data = { ...modelFixture("requirements", "class"), modelId: "domain-order" } as DiagramModelSpec;
  const ui = { ...modelFixture("requirements", "prototype"), modelId: "order-pages" } as DiagramModelSpec;
  const designData = { ...modelFixture("design", "class"), modelId: "design-order" } as DesignDiagramModelSpec;
  const designUi = { ...modelFixture("design", "navigation"), modelId: "design-pages" } as DesignDiagramModelSpec;
  const requirementModelTraceability = [
    { ruleId: "r-data", target: { modelId: data.modelId, diagramKind: "class" as const, elementId: "order", elementKind: "class", label: "Order" } },
    { ruleId: "r-ui", target: { modelId: ui.modelId, diagramKind: "prototype" as const, elementId: "a", elementKind: "screen", label: "列表页" } },
  ];
  const fingerprint = snapshotInputFingerprint({ requirementText: "订单需求", rules });
  const designFingerprint = designInputFingerprint([data, ui], requirementModelTraceability);
  return createWorkspaceRecord({ requirementText: "订单需求", rules, rulesVersion: 1,
    requirementInputFingerprint: fingerprint, rulesBasedOnTextVersion: 0,
    models: { "domain-order": data, "order-pages": ui }, requirementModelTraceability,
    generatedDiagramTypes: ["class", "prototype"], diagramVersions: { class: 1, prototype: 1 },
    diagramInputFingerprints: { class: fingerprint, prototype: fingerprint,
      "domain-order": fingerprint, "order-pages": fingerprint },
    designModels: { "design-order": designData, "design-pages": designUi }, generatedDesignDiagramTypes: ["class", "navigation"],
    designInputFingerprints: { "design-order": designFingerprint, "design-pages": designFingerprint },
    designModelTraceability: [
      { source: { modelId: "design-order", diagramKind: "class", elementId: "order", elementKind: "class", label: "Order" }, targets: [requirementModelTraceability[0].target], rationale: "承接订单数据", },
      { source: { modelId: "design-pages", diagramKind: "navigation", elementId: "a", elementKind: "screen", label: "列表页" }, targets: [requirementModelTraceability[1].target], rationale: "承接原型页面", },
    ],
  });
}

describe("dependency-scoped workspace freshness", () => {
  it("keeps another analysis model and its implementation current when they share the same model kinds", async () => {
    const rules = [createRule({ id: "r-a", text: "处理业务 A",  }),
      createRule({ id: "r-b", text: "处理业务 B",  })];
    const models = Object.fromEntries(["a", "b"].map(id => [`analysis:${id}`, {
      ...modelFixture("requirements", "analysis"), modelId: `analysis:${id}`, sourceUseCaseId: id,
    }])) as Record<string, DiagramModelSpec>;
    const designModels = Object.fromEntries(["a", "b"].map(id => [`sequence:${id}`, {
      ...modelFixture("design", "sequence"), modelId: `sequence:${id}`, sourceUseCaseId: id,
    }])) as Record<string, DesignDiagramModelSpec>;
    const trace = ["a", "b"].map(id => ({ ruleId: `r-${id}`, target: { modelId: `analysis:${id}`,
      diagramKind: "analysis" as const, elementId: "m", elementKind: "message", label: "提交订单" } }));
    const fingerprint = snapshotInputFingerprint({ requirementText: "业务需求", rules });
    const designFingerprint = designInputFingerprint(Object.values(models), trace);
    const repository = createMockWorkspaceRepository(createWorkspaceRecord({ requirementText: "业务需求", rules, models,
      requirementModelTraceability: trace, generatedDiagramTypes: ["analysis"], rulesVersion: 1,
      requirementInputFingerprint: fingerprint, diagramInputFingerprints: { analysis: fingerprint,
        "analysis:a": fingerprint, "analysis:b": fingerprint },
      designModels, generatedDesignDiagramTypes: ["sequence"],
      designInputFingerprints: { "sequence:a": designFingerprint, "sequence:b": designFingerprint },
      designModelTraceability: ["a", "b"].map((id, index) => ({ source: { modelId: `sequence:${id}`,
        diagramKind: "sequence", elementId: "m", elementKind: "message", label: "提交订单" },
        targets: [trace[index].target], rationale: "承接对应需求分析", })),
    }));
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.updateRequirementRule("r-a", { text: "调整业务 A" }));
    expect(result.current.staleRequirementModelIds).toEqual(["analysis:a"]);
    expect(result.current.staleDesignModelIds).toEqual(["sequence:a"]);
    expect(result.current.models["analysis:b"]).toEqual(models["analysis:b"]);
  });

  it.each(["edit", "add", "delete"] as const)("invalidates only the fixed mapped branch on %s, including after reload", async (action) => {
    const repository = createMockWorkspaceRepository(workspace());
    const mount = () => renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    const first = mount();
    await waitFor(() => expect(first.result.current.workspaceInitialized).toBe(true));
    act(() => {
      if (action === "edit") first.result.current.updateRequirementRule("r-data", { text: "记录订单与明细数据" });
      else if (action === "delete") first.result.current.deleteRequirementRule("r-data");
      else first.result.current.createRequirementRule({ type: "data" as const, text: "记录订单来源",  });
    });
    expect(first.result.current.staleDiagrams).toEqual(["class"]);
    expect(first.result.current.staleRequirementModelIds).toEqual(["domain-order"]);
    expect(first.result.current.staleDesignModelIds).toEqual(["design-order"]);
    expect(first.result.current.models["order-pages"]).toEqual(workspace().models["order-pages"]);
    first.unmount();
    const second = mount();
    await waitFor(() => expect(second.result.current.workspaceInitialized).toBe(true));
    expect(second.result.current.staleDiagrams).toEqual(["class"]);
    expect(second.result.current.staleDesignModelIds).toEqual(["design-order"]);
  });

  it("only invalidates designs traced to a manually edited requirement model", async () => {
    const initial = workspace();
    const repository = createMockWorkspaceRepository(initial);
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    await act(async () => { await result.current.saveRequirementModelEdit("class", { ...initial.models["domain-order"]!, summary: "已修改订单数据模型" }); });
    expect(result.current.staleDesignModelIds).toEqual(["design-order"]);
    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.rules).toEqual(initial.rules);
    expect((await repository.loadWorkspace()).designInputFingerprints["design-pages"]).toBe(result.current.designInputFingerprints["design-pages"]);
  });

  it("still scopes rule edits when the text editor contains an uncommitted draft", async () => {
    const repository = createMockWorkspaceRepository(workspace());
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.setRequirementText("尚未提交的新需求"));
    act(() => result.current.updateRequirementRule("r-data", { text: "调整数据要求" }));
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.staleRequirementModelIds).toEqual(["domain-order"]);
    expect(result.current.staleDesignModelIds).toEqual(["design-order"]);
  });

  it.each(["未保存的新需求", ""])("keeps published artifacts current while editing the text draft to %s", async (draft) => {
    const repository = createMockWorkspaceRepository(workspace());
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    const fingerprints = result.current.diagramInputFingerprints;
    const designFingerprints = result.current.designInputFingerprints;
    const traceabilityStale = result.current.designTraceabilityStale;
    act(() => result.current.setRequirementText(draft));
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.isRulesStale).toBe(false);
    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.staleDesignModelIds).toEqual([]);
    expect(result.current.diagramInputFingerprints).toEqual(fingerprints);
    expect(result.current.designInputFingerprints).toEqual(designFingerprints);
    expect(result.current.designTraceabilityStale).toBe(traceabilityStale);
    act(() => result.current.setRequirementText("订单需求"));
    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.staleDesignModelIds).toEqual([]);
  });

  it("still invalidates the affected rule branch while an unrelated text draft is pending", async () => {
    const repository = createMockWorkspaceRepository(workspace());
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.setRequirementText("尚未生成的新需求"));
    act(() => result.current.updateRequirementRule("r-data", { text: "记录订单及其明细数据" }));
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.staleRequirementModelIds).toEqual(["domain-order"]);
    expect(result.current.staleDesignModelIds).toEqual(["design-order"]);
    const saved = await repository.loadWorkspace();
    expect(saved.requirementText).toBe("订单需求");
    expect(result.current.requirementInputFingerprint).toBe(snapshotInputFingerprint({ requirementText: saved.requirementText, rules: saved.rules }));
  });

  it("does not certify rules with a missing source receipt after a draft is edited and undone", async () => {
    const initial = workspace();
    initial.requirementInputFingerprint = null;
    const repository = createMockWorkspaceRepository(initial);
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.setRequirementText("未生成的内容"));
    act(() => result.current.setRequirementText("订单需求"));
    expect(result.current.isRulesStale).toBe(true);
    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.staleDesignModelIds).toEqual([]);
  });

  it("preserves existing model states if generating rules from a draft fails", async () => {
    const initial = workspace();
    const repository = createMockWorkspaceRepository(initial);
    repository.startRun = vi.fn(async () => { throw new Error("提取失败"); });
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.setRequirementText("新的业务需求"));
    await act(async () => { await result.current.generateRules(); });
    expect(repository.startRun).toHaveBeenCalledOnce();
    expect(result.current.hasUncommittedRequirementDraft).toBe(true);
    expect(result.current.rules).toEqual(initial.rules);
    expect(result.current.staleDiagrams).toEqual([]);
    expect(result.current.staleDesignModelIds).toEqual([]);
  });

  it("invalidates published models only after rules generation commits the new source", async () => {
    const repository = createMockWorkspaceRepository(workspace());
    const { result } = renderHook(() => useWorkspaceSession(), { wrapper: ({ children }) => withWorkspaceProviders(children, repository) });
    await waitFor(() => expect(result.current.workspaceInitialized).toBe(true));
    act(() => result.current.setRequirementText("新订单系统业务需求"));
    expect(result.current.staleDiagrams).toEqual([]);
    await act(async () => { await result.current.generateRules(); });
    expect(result.current.hasUncommittedRequirementDraft).toBe(false);
    expect(result.current.staleDiagrams).toEqual(["class", "prototype"]);
    expect(result.current.staleDesignModelIds.sort()).toEqual(["design-order", "design-pages"]);
  });
});
