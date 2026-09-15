import { describe, it, expect, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import "@/i18n";
import { ListTable, type ListColumn } from "./ListTable";

interface Row {
  id: number;
  name: string;
}

const columns: ListColumn<Row>[] = [{ header: "Name", cell: (r) => r.name }];

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

const renderTable = (over: Partial<Parameters<typeof ListTable<Row>>[0]> = {}) =>
  render(
    <ListTable<Row>
      title="Items"
      data={rows(3)}
      isLoading={false}
      isError={false}
      errorText="load failed"
      emptyText="nothing here"
      columns={columns}
      rowKey={(r) => r.id}
      searchPlaceholder="Search rows"
      searchText={(r) => r.name}
      {...over}
    />,
  );

const bodyRows = () => {
  const table = screen.getByRole("table");
  // Skip the header row (rowgroup[0] is thead).
  const bodies = within(table).getAllByRole("rowgroup");
  return within(bodies[1]).getAllByRole("row");
};

beforeEach(() => cleanup());

describe("ListTable", () => {
  it("renders a row per item with the in-card count heading", () => {
    renderTable();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Items (3)");
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText("Row 1")).toBeInTheDocument();
  });

  it("filters rows by the search query (case-insensitive)", () => {
    renderTable({ data: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] });
    fireEvent.change(screen.getByLabelText("Search rows"), { target: { value: "ali" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("shows the no-results message when the search matches nothing", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Search rows"), { target: { value: "zzz" } });
    expect(screen.getByText("No results match your search.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("paginates: first page fills, Next advances, Previous disabled on page 1", () => {
    renderTable({ data: rows(3), pageSize: 2 });
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("resets to page 1 when the search query changes", () => {
    renderTable({ data: rows(5), pageSize: 2 });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search rows"), { target: { value: "Row" } });
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", () => {
    renderTable({ data: [] });
    expect(screen.getByText("nothing here")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search rows")).not.toBeInTheDocument();
  });

  it("shows the error state", () => {
    renderTable({ data: undefined, isError: true });
    expect(screen.getByText("load failed")).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    renderTable({ data: undefined, isLoading: true });
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
