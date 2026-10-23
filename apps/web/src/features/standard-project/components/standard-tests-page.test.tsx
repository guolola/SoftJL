// Verifies saved ordinary cases use the shared table without inventing classifications or professional prerequisites.
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createStandardProjectState } from "@uml-platform/contracts";
import { withWorkspaceProviders } from "../../../../tests/helpers/workspace-test-utils";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository/index";
import { StandardTestsPage } from "./standard-tests-page";

it("shows saved classifications and cases without a generation action", async () => {
  const state = createStandardProjectState("图书系统");
  state.diagrams.flow = { id: "flow", kind: "activity", title: "借阅流程", businessId: "borrow", status: "completed" };
  state.tests = [{ id: "t1", businessId: "borrow", title: "借阅图书", preconditions: ["已登录"], steps: ["选择图书", "确认借阅"], expected: "生成借阅记录" }];
  render(withWorkspaceProviders(<StandardTestsPage state={state} />, createMockWorkspaceRepository()));
  expect(await screen.findByText("借阅图书")).toBeInTheDocument();
  expect(screen.getByText("未分类")).toBeInTheDocument();
  expect(screen.getByText("未标注")).toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByText("关联业务与模型")).toBeInTheDocument();
  expect(screen.queryByText("需求阶段用例模型缺失，无法生成测试用例")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
});

it("keeps empty ordinary tests as a results page and explains generation in chat", async () => {
  render(withWorkspaceProviders(<StandardTestsPage state={createStandardProjectState()} />, createMockWorkspaceRepository()));
  expect(await screen.findByTestId("test-summary-grid")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "生成" })).not.toBeInTheDocument();
  expect(screen.getByText(/在聊天中根据项目业务和模型生成测试用例/)).toBeInTheDocument();
});
