// Checks hierarchy, independent disclosure, restored management links and diagram-specific icon choices.
import { I18nextProvider } from "react-i18next";
import { i18n } from "../../../shared/i18n/index";
import { render as renderUi, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { standardDiagramKinds, standardDiagramLabels } from "@uml-platform/contracts";
import { SidebarProvider } from "../../../shared/ui/sidebar";
import { StandardSidebar } from "./standard-sidebar";

it("keeps generated diagrams collapsed until explicitly expanded and opens the conversation independently", async () => {
  const user = userEvent.setup(); const onSelect = vi.fn(); const onDiagram = vi.fn(); const onNavigate = vi.fn();
  const diagrams = standardDiagramKinds.map(kind => ({ id: kind, kind, title: standardDiagramLabels[kind], status: "completed" as const }));
  render(<SidebarProvider><StandardSidebar projectId="p" diagrams={diagrams} view="home" selectedId={null} onSelect={onSelect} onDiagram={onDiagram} onNavigate={onNavigate} /></SidebarProvider>);
  expect(screen.queryByRole("button", { name: "功能结构图" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Agent 聊天" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "Agent 聊天" }).closest("ul")).toBe(screen.getByRole("button", { name: "UML 模型" }).closest("ul"));
  await user.click(screen.getByRole("button", { name: "Agent 聊天" }));
  expect(onSelect).toHaveBeenCalledWith("home");
  expect(screen.queryByRole("button", { name: "功能结构图" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "展开 UML 模型" }));
  const icons = diagrams.map(diagram => screen.getByRole("button", { name: diagram.title }).querySelector("svg")!.getAttribute("class"));
  expect(new Set(icons).size).toBe(8);
  await user.click(screen.getByRole("button", { name: "设计类图" }));
  expect(onDiagram).toHaveBeenCalledWith(diagrams.find(diagram => diagram.kind === "class"));
  await user.click(screen.getByRole("button", { name: "成员" }));
  expect(onNavigate).toHaveBeenCalledWith("/projects/p/members");
  expect(within(screen.getByRole("navigation")).queryByText("链路图")).not.toBeInTheDocument();
  expect(within(screen.getByRole("navigation")).queryByRole("button", { name: "运行历史" })).not.toBeInTheDocument();
});

it("keeps the conversation and diagrams reachable in the icon-only sidebar", async () => {
  const user = userEvent.setup(); const onSelect = vi.fn(); const onDiagram = vi.fn();
  const diagram = { id: "flow-borrow", kind: "activity" as const, title: "借阅流程", status: "completed" as const };
  render(<SidebarProvider defaultOpen={false}><StandardSidebar projectId="p" diagrams={[diagram]} view="home" selectedId={null} onSelect={onSelect} onDiagram={onDiagram} onNavigate={vi.fn()} /></SidebarProvider>);
  expect(screen.queryByRole("menuitem", { name: diagram.title })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "UML 模型" }));
  await user.hover(await screen.findByRole("menuitem", { name: "业务流程图" }));
  expect(screen.getAllByRole("menuitem", { name: "业务流程图" })).toHaveLength(1);
  const target = await screen.findByRole("menuitem", { name: diagram.title });
  target.focus();
  await user.keyboard("{Enter}");
  expect(onDiagram).toHaveBeenCalledWith(diagram);
  await user.click(screen.getByRole("button", { name: "Agent 聊天" }));
  await user.click(await screen.findByRole("menuitem", { name: "Agent 聊天" }));
  expect(onSelect).toHaveBeenCalledWith("home");
});

it("uses second-level categories only for disclosure and opens models from the third level", async () => {
  const user = userEvent.setup(); const onSelect = vi.fn(); const onDiagram = vi.fn();
  const diagrams = [
    { id: "borrow", kind: "activity" as const, title: "借阅流程 · 业务流程图", status: "completed" as const },
    { id: "return", kind: "activity" as const, title: "归还流程 - 业务流程图", status: "running" as const },
  ];
  render(<SidebarProvider><StandardSidebar projectId="p" diagrams={diagrams} view="home" selectedId="borrow" onSelect={onSelect} onDiagram={onDiagram} onNavigate={vi.fn()} /></SidebarProvider>);
  await user.click(screen.getByRole("button", { name: "展开 UML 模型" }));
  expect(screen.queryByRole("button", { name: "借阅流程" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "业务流程图" }));
  expect(onSelect).not.toHaveBeenCalled();
  expect(onDiagram).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "业务流程图" })).toHaveAttribute("aria-expanded", "true");
  const item = screen.getByRole("button", { name: "借阅流程" });
  expect(item).toHaveAttribute("aria-current", "page");
  expect(item.closest("ul")?.parentElement).toHaveAttribute("id", "sidebar-panel-category:activity");
  expect(screen.getByRole("button", { name: "归还流程" }).querySelector(".animate-spin")).toBeInTheDocument();
  await user.click(item);
  expect(onDiagram).toHaveBeenCalledWith(diagrams[0]);
  await user.click(screen.getByRole("button", { name: "业务流程图" }));
  expect(screen.getByRole("button", { name: "业务流程图" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "借阅流程" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "展开 业务流程图" }));
  expect(screen.getByRole("button", { name: "借阅流程" })).toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
});

function render(ui: import("react").ReactElement) {
  return renderUi(ui, { wrapper: ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider> });
}

it("uses the shared success and failure icons for generated tests and documents", () => {
  render(<SidebarProvider><StandardSidebar projectId="p" diagrams={[]} view="home" selectedId={null}
    state={{ tests: [{ id: "test", businessId: "login", title: "登录测试", preconditions: [], steps: ["登录"], expected: "成功" }],
      run: { id: "document-run", operation: "requirementsSpec", status: "failed", startedAt: "now" } }}
    onSelect={vi.fn()} onDiagram={vi.fn()} onNavigate={vi.fn()} /></SidebarProvider>);
  expect(screen.getByRole("button", { name: "测试" }).querySelector('[data-sidebar-status="completed"] svg')).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "说明书" }).querySelector('[data-sidebar-status="failed"] svg')).toBeInTheDocument();
});

it.each([true, false])("opens the overall usecase directly through its current singleton identity (expanded sidebar: %s)", async expanded => {
  const user = userEvent.setup(); const onSelect = vi.fn(); const onDiagram = vi.fn();
  const diagrams = [
    { id: "usecase", kind: "usecase" as const, title: "总体用例图", status: "completed" as const },
  ];
  render(<SidebarProvider defaultOpen={expanded}><StandardSidebar projectId="p" diagrams={diagrams} view="home" selectedId={null} onSelect={onSelect} onDiagram={onDiagram} onNavigate={vi.fn()} /></SidebarProvider>);
  if (expanded) {
    await user.click(screen.getByRole("button", { name: "展开 UML 模型" }));
    expect(screen.queryByRole("button", { name: "展开 用例图" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "用例图" }));
  } else {
    await user.click(screen.getByRole("button", { name: "UML 模型" }));
    await user.click(await screen.findByRole("menuitem", { name: "用例图" }));
  }
  expect(onDiagram).toHaveBeenCalledWith(diagrams[0]);
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByText("学生")).not.toBeInTheDocument();
  expect(screen.queryByText("教师")).not.toBeInTheDocument();
});
