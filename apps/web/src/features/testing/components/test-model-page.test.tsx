// Verifies black-box test generation stays compatible with historical use case models.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UseCaseDiagramSpec } from "@uml-platform/contracts";
import type { WorkspaceRepository } from "../../../services/workspace-repository";
import {
  createRule,
  createWorkspaceRecord,
  withWorkspaceProviders,
} from "../../../test/workspace-test-utils";
import { TestModelPage } from "./test-model-page";

function createRepository(record = createWorkspaceRecord()): WorkspaceRepository {
  return {
    loadWorkspace: vi.fn(async () => record),
    updateRequirementText: vi.fn(async () => {}),
    updateTestGenerationResult: vi.fn(async () => {}),
    startRun: vi.fn(),
    subscribeToRun: vi.fn(),
    getRunSnapshot: vi.fn(),
    renderPlantUml: vi.fn(),
    testProviderSettings: vi.fn(),
    saveRunHistory: vi.fn(),
    listRunHistory: vi.fn(async () => []),
    restoreRunHistory: vi.fn(async () => null),
    deleteRunHistory: vi.fn(async () => []),
    clearRunHistory: vi.fn(async () => {}),
  };
}

describe("TestModelPage", () => {
  it("keeps empty-project prerequisites compact until the user asks for details", async () => {
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TestModelPage />, createRepository()));

    const reopen = await screen.findByRole("button", { name: "有 1 项需要处理" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(reopen);
    const guidance = screen.getByRole("dialog", {
      name: "测试用例暂时无法生成",
    });
    expect(guidance).toHaveTextContent("需求阶段用例模型缺失，无法生成测试用例");
    expect(guidance).not.toHaveTextContent("影响：");
    expect(guidance).not.toHaveTextContent("技术详情");
    expect(
      within(guidance).getByRole("button", { name: "前往需求模型" }),
    ).toBeInTheDocument();
    await user.click(within(guidance).getByRole("button", { name: "我知道了" }));
    expect(reopen).toBeInTheDocument();
    expect(screen.queryByText("需求阶段用例模型缺失，无法生成测试用例")).not.toBeInTheDocument();
  });

  it.each(["usecase", "usecase-home-security"])("generates fallback black-box cases from a use case model stored under %s", async (modelKey) => {
    const legacyUseCaseModel = {
      diagramKind: "usecase",
      modelId: modelKey,
      title: "图书馆用例模型",
      summary: "旧历史模型未携带 eventFlows 字段。",
      notes: [],
      actors: [{ id: "actor_admin", name: "图书管理员", actorType: "human", responsibilities: [] }],
      useCases: [
        {
          id: "uc_borrow",
          name: "借出图书",
          goal: "完成读者借书登记",
          preconditions: ["目标图书可借阅"],
          postconditions: ["生成借阅记录"],
          supportingActorIds: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    } as unknown as UseCaseDiagramSpec;
    const repository = createRepository(
      createWorkspaceRecord({
        rules: [
          createRule({
            id: "r1",
            category: "功能需求",
            text: "系统应支持图书借阅功能，允许读者从图书馆借出图书。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        models: { [modelKey]: legacyUseCaseModel },
      }),
    );

    render(withWorkspaceProviders(<TestModelPage />, repository));

    const statsGrid = await screen.findByTestId("test-summary-grid");
    expect(statsGrid).toHaveClass("grid-cols-2", "xl:grid-cols-4");
    expect(statsGrid).toBeInTheDocument();

    const user = userEvent.setup();
    const generateButton = await screen.findByRole("button", { name: "生成测试用例" });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);

    expect(
      await screen.findByRole("dialog", { name: "测试用例已生成" }),
    ).toHaveTextContent("已生成并保存 1 条测试用例");

    expect(
      await screen.findByText("借出图书 - 正常流程 - 主事件流"),
    ).toBeInTheDocument();
    expect(screen.getByText("tc-uc_borrow-uc_borrow-main")).toBeInTheDocument();
    expect(screen.getByText("生成借阅记录")).toBeInTheDocument();
    expect(repository.updateTestGenerationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        testCases: expect.arrayContaining([
          expect.objectContaining({ id: "tc-uc_borrow-uc_borrow-main" }),
        ]),
      }),
    );
    await user.click(screen.getByRole("button", { name: "我知道了" }));
    const scenarioFilter = screen.getByRole("combobox", { name: "按测试场景筛选" });
    await user.click(scenarioFilter);
    await user.click(await screen.findByRole("option", { name: "异常流程" }));
    expect(screen.queryByText("tc-uc_borrow-uc_borrow-main")).not.toBeInTheDocument();
    expect(screen.getByText("暂无测试用例。")).toBeInTheDocument();
    await user.click(scenarioFilter);
    await user.click(await screen.findByRole("option", { name: "全部场景" }));
    expect(screen.getByText("tc-uc_borrow-uc_borrow-main")).toBeInTheDocument();
    expect(repository.updateTestGenerationResult).toHaveBeenCalledTimes(1);
  });

  it("shows the same save failure after every user retry", async () => {
    const useCaseModel = {
      diagramKind: "usecase",
      title: "预约用例模型",
      summary: "预约流程",
      notes: [],
      actors: [],
      useCases: [{
        id: "uc-book",
        name: "提交预约",
        goal: "提交预约",
        preconditions: [],
        postconditions: ["预约已提交"],
        supportingActorIds: [],
        eventFlows: [],
      }],
      systemBoundaries: [],
      relationships: [],
    } as unknown as UseCaseDiagramSpec;
    const repository = createRepository(
      createWorkspaceRecord({
        rules: [createRule({ id: "r-book", text: "用户可以提交预约。", relatedDiagrams: ["usecase"] })],
        models: { usecase: useCaseModel },
      }),
    );
    vi.mocked(repository.updateTestGenerationResult!).mockRejectedValue(
      new Error("persist failed"),
    );
    const user = userEvent.setup();
    render(withWorkspaceProviders(<TestModelPage />, repository));

    const generateButton = await screen.findByRole("button", { name: "生成测试用例" });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);
    const first = await screen.findByRole("dialog", { name: "测试用例生成失败" });
    expect(first).not.toHaveTextContent("persist failed");
    await user.click(within(first).getByRole("button", { name: "我知道了" }));

    await user.click(generateButton);
    expect(
      await screen.findByRole("dialog", { name: "测试用例生成失败" }),
    ).toBeInTheDocument();
    expect(repository.updateTestGenerationResult).toHaveBeenCalledTimes(2);
  });

  it("restores persisted test assets when the workspace reloads", async () => {
    const repository = createRepository(
      createWorkspaceRecord({
        testGenerationResult: {
          testCases: [
            {
              id: "tc-persisted",
              title: "持久化越权访问用例",
              scenarioType: "exception",
              priority: "P1",
              preconditions: ["存在其他用户的私有预约"],
              testData: ["直接 URL"],
              steps: [
                {
                  order: 1,
                  action: "访问其他用户预约 URL",
                  expectedResult: "返回权限不足",
                },
              ],
              expectedResults: ["不得显示预约详情"],
            },
          ],
          coverageRelations: [
            {
              testCaseId: "tc-persisted",
              requirementIds: ["r10"],
              useCaseIds: ["uc-view"],
              designModelRefs: [],
              coverageStatus: "covered",
              rationale: "持久化覆盖证据",
            },
          ],
        },
      }),
    );

    render(withWorkspaceProviders(<TestModelPage />, repository));

    expect(
      await screen.findByText("持久化越权访问用例"),
    ).toBeInTheDocument();
    expect(screen.getByText("tc-persisted")).toBeInTheDocument();
  });

  it("does not treat a generic usecase diagram hint as semantic coverage", async () => {
    const useCaseModel: UseCaseDiagramSpec = {
      diagramKind: "usecase",
      title: "预约用例",
      summary: "预约主流程",
      notes: [],
      actors: [],
      useCases: [
        {
          id: "uc-book",
          name: "提交预约",
          goal: "提交预约申请",
          preconditions: [],
          postconditions: ["预约进入待审核状态"],
          supportingActorIds: [],
          eventFlows: [],
        },
      ],
      systemBoundaries: [],
      relationships: [],
    };
    const repository = createRepository(
      createWorkspaceRecord({
        rules: [
          createRule({
            id: "r1",
            text: "用户可以提交预约。",
            relatedDiagrams: ["usecase"],
          }),
          createRule({
            id: "r2",
            category: "业务规则",
            text: "审批人必须拒绝重复报销。",
            relatedDiagrams: ["usecase"],
          }),
        ],
        models: { usecase: useCaseModel },
      }),
    );

    render(withWorkspaceProviders(<TestModelPage />, repository));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "生成测试用例" }));

    await waitFor(() =>
      expect(repository.updateTestGenerationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          coverageRelations: expect.arrayContaining([
            expect.objectContaining({
              testCaseId: "tc-requirement-r2",
              requirementIds: ["r2"],
              useCaseIds: [],
              rationale: expect.stringContaining("未伪造用例或设计映射"),
            }),
          ]),
        }),
      ),
    );
  });
});
