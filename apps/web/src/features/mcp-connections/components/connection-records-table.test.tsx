// Verifies payment-style records retain an empty table and credential revocation guards.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AppI18nProvider } from "../../../shared/i18n/i18n-provider";
import { ConnectionRecordsTable } from "./connection-records-table";
import type { Connection } from "../services/mcp-api";

const connection: Connection = { id: "pat-1", name: "我的工具", kind: "pat", projectIds: [], projectScope: "account", createdAt: "2026-01-01", expiresAt: "2099-01-01", revokedAt: null, lastUsedAt: null };

it("shows the payment order table headers and empty row before any connections exist", () => {
  render(<AppI18nProvider><ConnectionRecordsTable connections={[]} projects={[]} disabled={false} stale={false} onRevoke={vi.fn()} /></AppI18nProvider>);
  const table = screen.getByRole("table", { name: "连接记录" });
  expect(table).toHaveClass("min-w-[760px]", "text-left", "leading-5");
  expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
  expect(table.querySelector("thead")).toHaveClass("bg-muted/40");
  expect(within(table).getByText("还没有外部工具连接。")).toHaveAttribute("colspan", "6");
  expect(screen.getByText("0 条")).toBeInTheDocument();
  expect(screen.getByText("显示第 0–0 条，共 0 条")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "前往上一页" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "前往下一页" })).toBeDisabled();
});

it("pages connection records, revokes the visible credential, and clamps the page after refresh", async () => {
  const user = userEvent.setup();
  const onRevoke = vi.fn();
  const records = Array.from({ length: 11 }, (_, index) => ({ ...connection, id: `pat-${index}`, name: `工具 ${index + 1}` }));
  const view = (connections: Connection[]) => <AppI18nProvider><ConnectionRecordsTable connections={connections} projects={[]} disabled={false} stale={false} onRevoke={onRevoke} /></AppI18nProvider>;
  const { rerender } = render(view(records));
  expect(screen.getByText("显示第 1–5 条，共 11 条")).toBeInTheDocument();
  expect(screen.queryByText("工具 6")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "前往下一页" }));
  expect(screen.getByText("显示第 6–10 条，共 11 条")).toBeInTheDocument();
  expect(screen.queryByText("工具 1")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "撤销 工具 6" }));
  expect(onRevoke).toHaveBeenCalledWith(records[5]);
  await user.click(screen.getByRole("button", { name: "前往下一页" }));
  expect(screen.getByText("显示第 11–11 条，共 11 条")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "前往下一页" })).toBeDisabled();
  rerender(view(records.slice(0, 2)));
  expect(screen.getByText("工具 1", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByText("显示第 1–2 条，共 2 条")).toBeInTheDocument();
  rerender(view(records));
  expect(screen.getByText("显示第 1–5 条，共 11 条")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("combobox", { name: "每页显示条数" }));
  await user.click(await screen.findByRole("option", { name: "25" }));
  expect(screen.getByText("显示第 1–11 条，共 11 条")).toBeInTheDocument();
  expect(screen.getByText("工具 11", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "前往下一页" })).toBeDisabled();
});

it("shows account scope and passes the selected connection to revocation while guarding revoked records", async () => {
  const user = userEvent.setup();
  const onRevoke = vi.fn();
  render(<AppI18nProvider><ConnectionRecordsTable connections={[connection, { ...connection, id: "revoked", name: "旧工具", revokedAt: "2026-01-02" }]} projects={[]} disabled={false} stale={false} onRevoke={onRevoke} /></AppI18nProvider>);
  expect(screen.getAllByText("账号可访问的全部项目")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "撤销 我的工具" }));
  expect(onRevoke).toHaveBeenCalledWith(connection);
  expect(screen.getByRole("button", { name: "撤销 旧工具" })).toBeDisabled();
});
