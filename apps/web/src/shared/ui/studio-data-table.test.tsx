// Verifies the shared Studio DataTable 9 shell keeps controls and pagination inside one bordered card.
import type { ColumnDef } from "@tanstack/react-table";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n/i18n";

import { StudioDataTable } from "./studio-data-table";

type Row = { id: string; name: string };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "名称" },
];

describe("StudioDataTable", () => {
  afterEach(async () => { await act(async () => { await i18n.changeLanguage("zh-CN"); }); });

  it("switches pagination and empty-state text with the interface language", async () => {
    await act(async () => { await i18n.changeLanguage("en"); });
    const { rerender } = render(<StudioDataTable columns={columns} data={Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Record ${i + 1}` }))} />);
    expect(screen.getByLabelText("Rows per page")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–10 of 12 records")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Record 11")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    rerender(<StudioDataTable columns={columns} data={[]} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage("zh-CN"); });
    expect(screen.getByLabelText("每页条数")).toBeInTheDocument();
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });
  it("keeps toolbar, table and pagination in one fully bordered shell", async () => {
    const onSearch = vi.fn();
    const data = Array.from({ length: 12 }, (_, index) => ({
      id: String(index + 1),
      name: `记录 ${index + 1}`,
    }));

    render(
      <StudioDataTable
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        search={{ value: "", onChange: onSearch, placeholder: "搜索记录" }}
        filters={<button type="button">筛选</button>}
        actions={<button type="button">新增</button>}
      />,
    );

    const shell = document.querySelector('[data-slot="studio-data-table"]');
    expect(shell).toHaveClass("rounded-xl", "border", "overflow-hidden");
    expect(shell).toContainElement(screen.getByPlaceholderText("搜索记录"));
    expect(shell).toContainElement(screen.getByRole("button", { name: "筛选" }));
    expect(shell).toContainElement(screen.getByRole("button", { name: "新增" }));
    expect(shell).toContainElement(screen.getByRole("table"));
    expect(shell).toContainElement(screen.getByRole("navigation", { name: "pagination" }));
    expect(screen.getByTestId("studio-data-table-filters")).toHaveClass("min-w-0", "flex-nowrap");
    const pageControls = screen.getByTestId("studio-data-table-page-controls");
    expect(pageControls).toHaveClass("shrink-0", "flex-nowrap");
    expect(within(pageControls).getByLabelText("每页条数")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("搜索记录"), "A");
    expect(onSearch).toHaveBeenLastCalledWith("A");

    expect(screen.getByText("记录 1")).toBeInTheDocument();
    expect(screen.queryByText("记录 11")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("记录 11")).toBeInTheDocument();
    expect(within(shell as HTMLElement).getByLabelText("11-12 / 12")).toBeInTheDocument();
  });
});
