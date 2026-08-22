import { Card, CardContent } from "@/components/ui/card";
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
export interface DataColumn<T> {
  /** Already-`t()`-resolved header text. */
  header: string;
  align?: "start" | "end";
  /** Renders the cell for a row. */
  cell: (row: T) => React.ReactNode;
  /** Adds `tabular-nums` to the cell (numeric columns). */
  numeric?: boolean;
  className?: string;
}

/**
 * A small generic table wrapped in a Card. Encapsulates the app's table
 * conventions once (horizontal scroll, logical alignment, tabular numbers) so
 * panels stay declarative and RTL-safe by construction. Shows `empty` when
 * there are no rows.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => React.Key;
  empty: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center">{empty}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={i} className={cn(col.align === "end" && "text-end")}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={rowKey(row, index)}>
                {columns.map((col, i) => (
                  <TableCell
                    key={i}
                    className={cn(
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
      </CardContent>
    </Card>
  );
}
