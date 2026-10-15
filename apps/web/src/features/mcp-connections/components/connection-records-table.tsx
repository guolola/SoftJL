// Presents revocable MCP credentials using the payment order table's layout and responsive scrolling.
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../../shared/ui/table";
import { DashboardTablePagination } from "../../../shared/template/blocks/dashboard/table-pagination";
import { connectionStatus } from "../model/connection-status";
import type { Connection } from "../services/mcp-api";

export function ConnectionRecordsTable({ connections, projects, disabled, stale, onRevoke }: {
  connections: Connection[];
  projects: { id: string; name: string }[];
  disabled: boolean;
  stale: boolean;
  onRevoke: (connection: Connection) => void;
}) {
  const { t, i18n } = useTranslation();
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(connections.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  const visibleConnections = connections.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const formatTime = (value: string) => new Date(value).toLocaleString(i18n.resolvedLanguage || i18n.language);
  return <Card as="section" className="min-w-0 gap-0 overflow-hidden border py-0 ring-0">
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0 space-y-1">
        <h2 className="font-display text-xl font-semibold leading-7 text-foreground">{t("mcp.records")}</h2>
      </div>
      <Badge variant="secondary">{t("mcp.recordCount", { count: connections.length })}</Badge>
    </div>
    <div className="max-w-full overflow-hidden">
      <Table aria-label={t("mcp.records")} className="min-w-[760px] text-left text-sm leading-5">
        <TableHeader className="bg-muted/40 text-muted-foreground"><TableRow>
          {["name", "overview", "scope", "lastUsed", "expires", "actions"].map((column) => <TableHead key={column} className="px-5 py-3 font-medium">{t(`mcp.${column}`)}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody className="divide-y divide-border text-muted-foreground">
          {connections.length ? visibleConnections.map((connection) => {
            const status = connectionStatus(connection);
            const variant = stale ? "secondary" : status === "connected" ? "success" : status === "pending" || status === "expired" ? "warning" : "secondary";
            return <TableRow key={connection.id} className="transition-colors hover:bg-muted/30">
              <TableCell className="max-w-48 whitespace-normal break-words px-5 py-3"><p className="font-medium text-foreground">{connection.name}</p><p className="text-xs">{connection.kind === "oauth" ? t("mcp.oauth") : t("mcp.pat")}</p></TableCell>
              <TableCell className="px-5 py-3"><Badge variant={variant}>{status === "connected" && !stale && <CheckCircle2 aria-hidden="true" />}{t(stale ? "mcp.stale" : `mcp.status.${status}`)}</Badge></TableCell>
              <TableCell className="max-w-64 whitespace-normal break-words px-5 py-3">{connection.projectScope === "account" ? t("mcp.allProjects") : connection.projectIds.map((id) => projects.find((project) => project.id === id)?.name ?? id).join(" · ")}</TableCell>
              <TableCell className="px-5 py-3">{connection.lastUsedAt ? formatTime(connection.lastUsedAt) : t("mcp.neverUsed")}</TableCell>
              <TableCell className="px-5 py-3">{formatTime(connection.expiresAt)}</TableCell>
              <TableCell className="px-5 py-3"><Button variant="outline" className="h-9 px-3 text-xs" disabled={disabled || Boolean(connection.revokedAt)} onClick={() => onRevoke(connection)}>{t("mcp.revoke")}<span className="sr-only"> {connection.name}</span></Button></TableCell>
            </TableRow>;
          }) : <TableRow><TableCell colSpan={6} className="px-5 py-8 text-center text-sm leading-6">{t("mcp.empty")}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    <div className="border-t border-border">
      <DashboardTablePagination total={connections.length} page={currentPage} pageSize={pageSize} onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} t={t} />
    </div>
  </Card>;
}
