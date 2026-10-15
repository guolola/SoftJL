// Verifies the shared AdminCN page scaffolding behaves as the business surfaces rely on.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTextIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  EmptyState,
  PageHeader,
  StatCard,
  TablePagination,
  TableToolbar,
} from "./page";

describe("PageHeader", () => {
  it("renders title, description and actions", () => {
    render(
      <PageHeader
        title="系统需求"
        description="维护项目需求描述"
        actions={<button type="button">新建</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("系统需求");
    expect(screen.getByText("维护项目需求描述")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建" })).toBeInTheDocument();
  });

  it("does not duplicate the visible description in a generic notice", () => {
    render(<PageHeader title="项目历史" description="查看项目操作记录" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "页面提示" })).not.toBeInTheDocument();
    expect(screen.getByText("查看项目操作记录")).toBeVisible();
  });

  it("places the notice beside the title before its badge and keeps the description below", () => {
    const { container } = render(
      <PageHeader
        title="需求模型"
        notice={<button type="button" aria-label="查看提示">提示</button>}
        titleAccessory={<span>3 个模型</span>}
        description="检查需求模型的状态"
        actions={<button type="button">生成模型</button>}
      />,
    );

    const header = container.firstElementChild!;
    const titleRow = header.firstElementChild!.firstElementChild!;
    expect(Array.from(titleRow.children).map((element) => element.textContent)).toEqual(["需求模型", "提示", "3 个模型"]);
    expect(header.firstElementChild!.lastElementChild).toHaveTextContent("检查需求模型的状态");
    expect(header.lastElementChild).toHaveTextContent("生成模型");
  });
});

describe("TableToolbar", () => {
  it("emits search changes and exposes rows-per-page control", async () => {
    const onSearchChange = vi.fn();
    render(
      <TableToolbar
        search=""
        onSearchChange={onSearchChange}
        searchPlaceholder="搜索规则..."
        rowsPerPage={10}
        onRowsPerPageChange={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText("搜索规则..."), "R");
    expect(onSearchChange).toHaveBeenLastCalledWith("R");
    expect(screen.getByLabelText("每页条数")).toBeInTheDocument();
  });
});

describe("TablePagination", () => {
  it("announces the visible range and navigates pages", async () => {
    const onPageChange = vi.fn();
    render(
      <TablePagination total={25} page={1} pageCount={3} pageSize={10} onPageChange={onPageChange} />,
    );

    expect(screen.getByLabelText("1-10 / 25")).toBeInTheDocument();
    expect(screen.getByLabelText("上一页")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "第 2 页" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("disables navigation for single-page results", () => {
    render(<TablePagination total={3} page={1} pageCount={1} pageSize={10} onPageChange={vi.fn()} />);

    expect(screen.getByLabelText("1-3 / 3")).toBeInTheDocument();
    expect(screen.getByLabelText("下一页")).toBeDisabled();
  });
});

describe("EmptyState", () => {
  it("renders icon, copy and action", () => {
    render(
      <EmptyState
        icon={FileTextIcon}
        title="暂无文档"
        description="上传或生成第一份说明书"
        action={<button type="button">新建文档</button>}
      />,
    );

    expect(screen.getByText("暂无文档")).toBeInTheDocument();
    expect(screen.getByText("上传或生成第一份说明书")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新建文档" })).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("renders value, label, trend and badge", () => {
    render(
      <StatCard
        icon={<FileTextIcon />}
        value="12"
        label="需求规则"
        trend="up"
        change="8%"
        badge="已确认"
      />,
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("需求规则")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.getByText("已确认")).toBeInTheDocument();
  });
});
