// Verifies the shared Studio DataTable 9 shell keeps controls and pagination inside one bordered card.
import type { ColumnDef } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StudioDataTable } from "./studio-data-table";

type Row = { id: string; name: string };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "名称" },
];

describe("StudioDataTable", () => {
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
