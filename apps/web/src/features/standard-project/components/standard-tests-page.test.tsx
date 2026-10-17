// Verifies saved ordinary cases use the shared table without inventing classifications or professional prerequisites.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { createStandardProjectState } from "@uml-platform/contracts";
import { withWorkspaceProviders } from "../../../test/workspace-test-utils";
import { createMockWorkspaceRepository } from "../../../services/workspace-repository";
import { StandardTestsPage } from "./standard-tests-page";

it("shows legacy classifications honestly and generates through the ordinary action", async () => {
  const state = createStandardProjectState("图书系统"); const onGenerate = vi.fn();
  state.diagrams.flow = { id: "flow", kind: "activity", title: "借阅流程", businessId: "borrow", status: "completed" };
  state.tests = [{ id: "t1", businessId: "borrow", title: "借阅图书", preconditions: ["已登录"], steps: ["选择图书", "确认借阅"], expected: "生成借阅记录" }];
  render(withWorkspaceProviders(<StandardTestsPage state={state} disabled={false} onGenerate={onGenerate} />, createMockWorkspaceRepository()));
  expect(await screen.findByText("借阅图书")).toBeInTheDocument();
  expect(screen.getByText("未分类")).toBeInTheDocument();
  expect(screen.getByText("未标注")).toBeInTheDocument();
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByText("关联业务与模型")).toBeInTheDocument();
  expect(screen.queryByText("需求阶段用例模型缺失，无法生成测试用例")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "生成" }));
  expect(onGenerate).toHaveBeenCalledOnce();
});

it("keeps ordinary generation disabled with an inline reason in a read-only or busy project", async () => {
  render(withWorkspaceProviders(<StandardTestsPage state={createStandardProjectState()} disabled onGenerate={vi.fn()} />, createMockWorkspaceRepository()));
  expect(await screen.findByRole("button", { name: "生成" })).toBeDisabled();
  expect(screen.getByText("当前不能生成，请等待任务结束或检查项目编辑权限。")).toBeInTheDocument();
});
