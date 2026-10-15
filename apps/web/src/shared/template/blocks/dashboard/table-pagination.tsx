// Shares the dashboard's localized record counts and page controls across account tables.
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "../../../ui/button";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "../../../ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../ui/select";
import { usePagination } from "./use-pagination";

export function DashboardTablePagination({ total, page, pageSize, onPageChange, onPageSizeChange, t }: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  t: (key: string, options?: Record<string, string | number>) => string;
}) {
  // Keep one disabled page for empty lists, and clamp stale page indexes after a refresh.
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage, totalPages: pageCount, paginationItemsToDisplay: 2,
  });
  return <div className="flex items-center justify-between gap-3 px-6 py-4 max-sm:flex-col md:max-lg:flex-col">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{t("dashboard.table.perPage")}</span>
      <Select value={String(pageSize)} onValueChange={(value) => { if (value) onPageSizeChange(Number(value)); }}>
        <SelectTrigger aria-label={t("dashboard.table.pageSize")} className="w-20" size="sm"><SelectValue /></SelectTrigger>
        <SelectContent>{[5, 10, 25, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <p className="text-muted-foreground text-sm whitespace-nowrap" aria-live="polite">
      {t("dashboard.table.pageSummary", {
        start: total === 0 ? 0 : (currentPage - 1) * pageSize + 1,
        end: Math.min(currentPage * pageSize, total), total,
      })}
    </p>
    <div>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <Button type="button" className="disabled:pointer-events-none disabled:opacity-50" variant="ghost"
              onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}
              aria-label={t("dashboard.table.previousPage")}>
              <ChevronLeftIcon aria-hidden="true" />{t("dashboard.table.previous")}
            </Button>
          </PaginationItem>
          {showLeftEllipsis && <PaginationItem><PaginationEllipsis /></PaginationItem>}
          {pages.map((value) => <PaginationItem key={value}>
            <Button type="button" size="icon"
              className={value === currentPage ? undefined : "bg-primary/10 text-primary hover:bg-primary/20 focus-visible:ring-primary/20 dark:focus-visible:ring-primary/40"}
              onClick={() => onPageChange(value)} aria-current={value === currentPage ? "page" : undefined}>
              {value}
            </Button>
          </PaginationItem>)}
          {showRightEllipsis && <PaginationItem><PaginationEllipsis /></PaginationItem>}
          <PaginationItem>
            <Button type="button" className="disabled:pointer-events-none disabled:opacity-50" variant="ghost"
              onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount}
              aria-label={t("dashboard.table.nextPage")}>
              {t("dashboard.table.next")}<ChevronRightIcon aria-hidden="true" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  </div>;
}
