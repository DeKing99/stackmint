// components/file-table.tsx
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  //getFilteredSelectedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@clerk/nextjs";
import { createClerkSupabaseClient } from "@/lib/supabase-client";

export type UploadedFile = {
  id: string;
  file_name: string;
  file_site_id: string;
  file_url: string;
  user_id?: string;
  user_name?: string;
  organization_id?: string;
  created_at?: string;
};

export const columns: ColumnDef<UploadedFile>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "file_name",
    header: "File Name",
    cell: ({ row }) => <div>{row.getValue("file_name")}</div>,
  },
  {
    accessorKey: "file_site_id",
    header: "Site ID",
    cell: ({ row }) => <div>{row.getValue("file_site_id")}</div>,
  },
  {
    accessorKey: "user_name",
    header: "Uploaded By",
    cell: ({ row }) => <div>{row.getValue("user_name")}</div>,
  },
  {
    accessorKey: "created_at",
    header: "Uploaded At",
    cell: ({ row }) =>
      row.getValue("created_at")
        ? new Date(row.getValue("created_at")).toLocaleString()
        : "-",
  },
];

interface DataTableDemoProps {
  organizationId: string;
  siteId?: string | null; // expects file_site_id (not slug)
  onSelectionChange?: (rows: UploadedFile[]) => void;
  pageSize?: number;
}

export function DataTableDemo({
  organizationId,
  siteId,
  onSelectionChange,
  pageSize = 25,
}: DataTableDemoProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [data, setData] = React.useState<UploadedFile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { session } = useSession();

  const supabase = React.useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null)
      ),
    [session]
  );

  React.useEffect(() => {
    let mounted = true;
    if (!organizationId || !siteId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const fetchData = async () => {
      const { data: files, error } = await supabase
        .from("uploaded_esg_files_construction")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("file_site_id", siteId)
        .order("created_at", { ascending: false })
        .limit(pageSize);

      if (!mounted) return;
      if (error) {
        console.error("Error fetching Supabase data:", error);
        setData([]);
      } else {
        setData(files || []);
      }
      setLoading(false);
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [supabase, organizationId, siteId, pageSize]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  // call the parent callback whenever selection changes
  React.useEffect(() => {
    const selected = table
      .getFilteredSelectedRowModel()
      .rows.map((r) => r.original);
    onSelectionChange?.(selected);
  }, [rowSelection, table, onSelectionChange]);

  return (
    <div className="w-full">
      <div className="flex items-center py-4">
        <Input
          placeholder="Filter file names..."
          value={
            (table.getColumn("file_name")?.getFilterValue() as string) ?? ""
          }
          onChange={(event) =>
            table.getColumn("file_name")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center h-24"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center h-24"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="text-muted-foreground flex-1 text-sm">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
