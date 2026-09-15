import { useMemo, useState } from "react";
import type { Key, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A declarative column. `align: "end"` right-aligns (numbers) — RTL-safe via logical `text-end`. */
export interface ListColumn<T> {
  /** Already-`t()`-resolved header text. */
  header: string;
  align?: "start" | "end";
  /** Renders the cell for a row. */
  cell: (row: T) => ReactNode;
  /** Adds `tabular-nums` to the cell (numeric columns). */
  numeric?: boolean;
  className?: string;
}

interface ListTableProps<T> {
  /** Already-`t()`-resolved page title. */
  title: string;
  /** Optional muted subtitle under the title. */
  subtitle?: string;
  /** The full, already-fetched dataset (client-side searched + paginated here). */
  data: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Already-`t()`-resolved error text. */
  errorText: string;
  /** Already-`t()`-resolved empty-state text (shown when there is no data at all). */
  emptyText: string;
  columns: ListColumn<T>[];
  rowKey: (row: T) => Key;
  /** Already-`t()`-resolved search-box placeholder / aria-label. */
  searchPlaceholder: string;
  /** Concatenated searchable fields for the case-insensitive client-side filter. */
  searchText: (row: T) => string;
  /** Optional header action (e.g. an Add button, gated by the screen). */
  action?: ReactNode;
  /** Rows per page. Defaults to 25. */
  pageSize?: number;
}

/**
 * A full list-screen table: title + subtitle + an elevated search bar + a
 * bigger, paginated table inside a Card whose header shows `Title (N)` and whose
 * footer shows `N total / Previous / Page X of Y / Next`. Search and pagination
 * are client-side over `data`. RTL-safe and theme-token driven by construction
 * so all list screens look identical.
 */
export function ListTable<T>({
  title,
  subtitle,
  data,
  isLoading,
  isError,
  errorText,
  emptyText,
  columns,
  rowKey,
  searchPlaceholder,
  searchText,
  action,
  pageSize = 25,
}: ListTableProps<T>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const rows = data ?? [];

  const filtered = useMemo(() => {
    const source = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((row) => searchText(row).toLowerCase().includes(q));
  }, [data, query, searchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp so a shrinking result set (search / deletion) never strands us past the end.
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const hasData = rows.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
        </div>
        {action}
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 py-10">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {isError && <p className="text-destructive">{errorText}</p>}

      {!isLoading && !isError && !hasData && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">{emptyText}</CardContent>
        </Card>
      )}

      {!isLoading && !isError && hasData && (
        <>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="bg-card border-input shadow-card h-14 rounded-xl ps-11 text-base"
            />
          </div>

          <Card className="gap-0 overflow-hidden py-0">
            {/* Card header — mirrors the reference "Title (N)" heading. */}
            <div className="border-b px-4 py-4">
              <h2 className="text-lg font-semibold">
                {title} <span className="text-muted-foreground">({rows.length})</span>
              </h2>
            </div>

            {filtered.length === 0 ? (
              <CardContent className="text-muted-foreground py-12 text-center">
                {t("common.noResults")}
              </CardContent>
            ) : (
              <CardContent className="p-0">
                {/* Table scrolls inside its own container on narrow screens — the
                    page itself never overflows sideways. */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        {columns.map((col, i) => (
                          <TableHead
                            key={i}
                            className={cn("py-4", col.align === "end" && "text-end")}
                          >
                            {col.header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((row) => (
                        <TableRow key={rowKey(row)}>
                          {columns.map((col, i) => (
                            <TableCell
                              key={i}
                              className={cn(
                                "py-4",
                                col.align === "end" && "text-end",
                                col.numeric && "tabular-nums",
                                col.className,
                              )}
                            >
                              {col.cell(row)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
                  <span className="text-muted-foreground text-sm">
                    {t("common.totalCount", { count: filtered.length })}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft className="size-4 rtl:rotate-180" />
                      {t("common.previous")}
                    </Button>
                    <span className="text-sm">
                      {t("common.pageOf", { page: currentPage, pages: pageCount })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {t("common.next")}
                      <ChevronRight className="size-4 rtl:rotate-180" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
