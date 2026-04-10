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
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import {
  Brain,
  ChevronDown,
  CircleAlert,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { activityTypes } from "@/lib/activity_types_schema";

export type UploadedFile = {
  id: string;
  file_name: string;
  company_location_id?: string | null;
  file_site_id?: string | null;
  file_url?: string | null;
  uploaded_by?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  organization_id?: string | null;
  created_at?: string | null;
  uploaded_at?: string | null;
  activity_type?: string | null;
  inferred_activity_type?: string | null;
  inference_confidence?: number | null;
  inference_second_best_type?: string | null;
  inference_second_best_score?: number | null;
  activity_type_review_status?: string | null;
  activity_type_review_reason?: string | null;
  parsing_status?: string | null;
};

const activityTypeLabels = new Map(
  activityTypes.map((activityType) => [activityType.value, activityType.label]),
);

function formatActivityType(value?: string | null): string {
  if (!value) {
    return "Unassigned";
  }

  return activityTypeLabels.get(value) ?? value.replaceAll("_", " ");
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
}

function formatConfidence(value?: number | null): string {
  if (typeof value !== "number") {
    return "No score";
  }

  return `${Math.round(value * 100)}% confidence`;
}

function isPendingReview(file: UploadedFile): boolean {
  return (
    file.activity_type_review_status === "pending_review" ||
    file.parsing_status === "pending_review"
  );
}

function getReviewBadgeVariant(
  status?: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pending_review":
      return "destructive";
    case "manual_override":
      return "secondary";
    case "approved":
    case "auto_accepted":
      return "default";
    default:
      return "outline";
  }
}

function getReviewBadgeLabel(file: UploadedFile): string {
  if (isPendingReview(file)) {
    return "Needs review";
  }

  switch (file.activity_type_review_status) {
    case "manual_override":
      return "Manual override";
    case "approved":
      return "Reviewed";
    case "auto_accepted":
      return "Auto accepted";
    default:
      return file.parsing_status
        ? file.parsing_status.replaceAll("_", " ")
        : "Queued";
  }
}

interface DataTableDemoProps {
  organizationId: string;
  locationId?: string | null;
  siteId?: string | null;
  onSelectionChange?: (rows: UploadedFile[]) => void;
  pageSize?: number;
}

export function DataTableDemo({
  organizationId,
  locationId,
  siteId,
  onSelectionChange,
  pageSize = 25,
}: DataTableDemoProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [data, setData] = React.useState<UploadedFile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("all");
  const [reviewTarget, setReviewTarget] = React.useState<UploadedFile | null>(
    null,
  );
  const [reviewActivityType, setReviewActivityType] = React.useState("");
  const [reviewSaving, setReviewSaving] = React.useState(false);
  const { session } = useSession();

  const supabase = React.useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null),
      ),
    [session],
  );

  const fetchData = React.useCallback(async () => {
    if (!organizationId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const activeLocationId = locationId || siteId || null;

    let resolvedOrganizationId = organizationId;
    if (organizationId.startsWith("org_")) {
      const { data: orgRow } = await supabase
        .from("clerk_organisations")
        .select("id")
        .eq("clerk_org_id", organizationId)
        .maybeSingle();

      if (orgRow?.id) {
        resolvedOrganizationId = orgRow.id;
      }
    }

    let query = supabase
      .from("company_raw_uploads")
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .order("uploaded_at", { ascending: false });

    if (activeLocationId) {
      query = query.eq("company_location_id", activeLocationId);
    }

    const { data: files, error } = await query.limit(pageSize);

    if (error) {
      console.error("Error fetching Supabase data:", error);
      setData([]);
    } else {
      setData((files as UploadedFile[]) || []);
    }
    setLoading(false);
  }, [supabase, organizationId, locationId, siteId, pageSize]);

  React.useEffect(() => {
    let mounted = true;

    const run = async () => {
      await fetchData();
      if (!mounted) {
        return;
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [fetchData]);

  const pendingReviewCount = React.useMemo(
    () => data.filter((file) => isPendingReview(file)).length,
    [data],
  );
  const autoAcceptedCount = React.useMemo(
    () =>
      data.filter(
        (file) => file.activity_type_review_status === "auto_accepted",
      ).length,
    [data],
  );
  const manualOverrideCount = React.useMemo(
    () =>
      data.filter(
        (file) => file.activity_type_review_status === "manual_override",
      ).length,
    [data],
  );

  const filteredData = React.useMemo(() => {
    if (activeTab === "review") {
      return data.filter((file) => isPendingReview(file));
    }
    return data;
  }, [activeTab, data]);

  const openReviewSheet = React.useCallback((file: UploadedFile) => {
    setReviewTarget(file);
    setReviewActivityType(
      file.activity_type || file.inferred_activity_type || "",
    );
  }, []);

  const closeReviewSheet = React.useCallback(() => {
    setReviewTarget(null);
    setReviewActivityType("");
  }, []);

  const handleReviewSubmit = React.useCallback(async () => {
    if (!reviewTarget) {
      return;
    }

    if (!reviewActivityType) {
      toast.error("Select an activity type before queueing this upload.");
      return;
    }

    setReviewSaving(true);

    const nextReviewStatus =
      reviewActivityType === reviewTarget.inferred_activity_type
        ? "approved"
        : "manual_override";

    const payload = {
      activity_type: reviewActivityType,
      parsing_status: "pending",
      activity_type_review_status: nextReviewStatus,
      activity_type_review_reason:
        nextReviewStatus === "approved"
          ? "Approved after review."
          : "Activity type overridden during review.",
    };

    const { error } = await supabase
      .from("company_raw_uploads")
      .update(payload)
      .eq("id", reviewTarget.id);

    if (error) {
      console.error("Review update failed:", error);
      toast.error(`Could not queue upload: ${error.message}`);
      setReviewSaving(false);
      return;
    }

    setData((current) =>
      current.map((file) =>
        file.id === reviewTarget.id
          ? {
              ...file,
              ...payload,
            }
          : file,
      ),
    );
    toast.success("Upload queued for processing.");
    setReviewSaving(false);
    closeReviewSheet();
  }, [closeReviewSheet, reviewActivityType, reviewTarget, supabase]);

  const columns = React.useMemo<ColumnDef<UploadedFile>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
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
        header: "File",
        cell: ({ row }) => {
          const file = row.original;
          return (
            <div className="space-y-1">
              <div className="font-medium text-foreground">
                {file.file_name}
              </div>
              <div className="text-xs text-muted-foreground">
                {file.uploaded_by || "Unknown uploader"}
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const file = row.original;
          return (
            <div className="flex flex-col gap-2">
              <Badge
                variant={getReviewBadgeVariant(
                  file.activity_type_review_status,
                )}
              >
                {getReviewBadgeLabel(file)}
              </Badge>
              <span className="text-xs text-muted-foreground capitalize">
                {file.parsing_status?.replaceAll("_", " ") || "pending"}
              </span>
            </div>
          );
        },
      },
      {
        id: "activity_type_display",
        header: "Classification",
        cell: ({ row }) => {
          const file = row.original;
          const resolvedType =
            file.activity_type || file.inferred_activity_type;
          return (
            <div className="space-y-1">
              <div className="font-medium">
                {formatActivityType(resolvedType)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatConfidence(file.inference_confidence)}
              </div>
              {file.inference_second_best_type ? (
                <div className="text-xs text-muted-foreground">
                  Next best:{" "}
                  {formatActivityType(file.inference_second_best_type)}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "company_location_id",
        header: "Location",
        cell: ({ row }) => (
          <div>
            {(row.getValue("company_location_id") as string) ||
              row.original.file_site_id ||
              "-"}
          </div>
        ),
      },
      {
        accessorKey: "uploaded_at",
        header: "Uploaded",
        cell: ({ row }) => formatTimestamp(row.original.uploaded_at),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const file = row.original;
          return isPendingReview(file) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openReviewSheet(file)}
            >
              Review
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openReviewSheet(file)}
            >
              Inspect
            </Button>
          );
        },
      },
    ],
    [openReviewSheet],
  );

  const table = useReactTable({
    data: filteredData,
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

  React.useEffect(() => {
    const selected = table
      .getFilteredSelectedRowModel()
      .rows.map((row) => row.original);
    onSelectionChange?.(selected);
  }, [rowSelection, table, onSelectionChange]);

  return (
    <>
      <div className="w-full space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200/80 bg-gradient-to-br from-white to-slate-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-emerald-600" />
                Auto Accepted
              </CardTitle>
              <CardDescription>
                Files classified with enough confidence to continue
                automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{autoAcceptedCount}</div>
            </CardContent>
          </Card>

          <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleAlert className="size-4 text-amber-600" />
                Needs Review
              </CardTitle>
              <CardDescription>
                Low-confidence uploads waiting for a human confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="text-3xl font-semibold">{pendingReviewCount}</div>
              {pendingReviewCount > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab("review")}
                >
                  Open queue
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-blue-200/80 bg-gradient-to-br from-blue-50 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-blue-600" />
                Manual Overrides
              </CardTitle>
              <CardDescription>
                Uploads where a reviewer explicitly chose the activity type.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">
                {manualOverrideCount}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
          <TabsList>
            <TabsTrigger value="all">All uploads</TabsTrigger>
            <TabsTrigger value="review">
              Review queue
              {pendingReviewCount > 0 ? (
                <Badge
                  variant="secondary"
                  className="ml-1 bg-white/80 text-slate-900"
                >
                  {pendingReviewCount}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {activeTab === "review" && pendingReviewCount > 0 ? (
              <Card className="border-amber-200 bg-amber-50/60 shadow-none">
                <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium text-slate-900">
                      Review queue is active
                    </div>
                    <p className="text-sm text-slate-600">
                      Confirm the suggested activity type or override it, then
                      send the upload back into processing.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const firstPending = data.find((file) =>
                        isPendingReview(file),
                      );
                      if (firstPending) {
                        openReviewSheet(firstPending);
                      }
                    }}
                  >
                    Review next upload
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <div className="flex items-center py-4">
              <Input
                placeholder="Filter file names..."
                value={
                  (table.getColumn("file_name")?.getFilterValue() as string) ??
                  ""
                }
                onChange={(event) =>
                  table
                    .getColumn("file_name")
                    ?.setFilterValue(event.target.value)
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
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
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
                                header.getContext(),
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
                        className="h-24 text-center"
                      >
                        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          Loading uploads...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={
                          row.getIsSelected() ? "selected" : undefined
                        }
                        className={
                          isPendingReview(row.original) ? "bg-amber-50/40" : ""
                        }
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        {activeTab === "review"
                          ? "No uploads are waiting for review."
                          : "No results."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-end space-x-2 py-2">
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
          </TabsContent>
        </Tabs>
      </div>

      <Sheet
        open={!!reviewTarget}
        onOpenChange={(open) => !open && closeReviewSheet()}
      >
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Brain className="size-4 text-sky-600" />
              Activity Type Review
            </SheetTitle>
            <SheetDescription>
              Confirm the inferred classification before this upload returns to
              the parsing queue.
            </SheetDescription>
          </SheetHeader>

          {reviewTarget ? (
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
              <Card className="gap-4 border-slate-200/80 bg-slate-50/70 py-4 shadow-none">
                <CardHeader className="pb-0">
                  <CardTitle className="text-base">
                    {reviewTarget.file_name}
                  </CardTitle>
                  <CardDescription>
                    Uploaded {formatTimestamp(reviewTarget.uploaded_at)} by{" "}
                    {reviewTarget.uploaded_by || "Unknown user"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Suggested type
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {formatActivityType(reviewTarget.inferred_activity_type)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatConfidence(reviewTarget.inference_confidence)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Second best
                    </div>
                    <div className="mt-1 font-medium text-slate-900">
                      {formatActivityType(
                        reviewTarget.inference_second_best_type,
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {typeof reviewTarget.inference_second_best_score ===
                      "number"
                        ? `${Math.round(reviewTarget.inference_second_best_score * 100) / 100} score`
                        : "No alternate score"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">
                  Final activity type
                </label>
                <select
                  value={reviewActivityType}
                  onChange={(event) =>
                    setReviewActivityType(event.target.value)
                  }
                  className="bg-background w-full rounded-xl border border-slate-200 px-3 py-3 text-sm shadow-sm outline-none transition focus:border-sky-400"
                >
                  <option value="">Select activity type</option>
                  {activityTypes.map((activityType) => (
                    <option key={activityType.value} value={activityType.value}>
                      {activityType.label}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">
                  {reviewActivityType
                    ? activityTypes.find(
                        (activityType) =>
                          activityType.value === reviewActivityType,
                      )?.description
                    : reviewTarget.activity_type_review_reason ||
                      "Choose the inferred type to approve it, or override it before queueing the upload."}
                </p>
              </div>
            </div>
          ) : null}

          <SheetFooter className="border-t border-slate-200 bg-white">
            <Button
              variant="outline"
              onClick={closeReviewSheet}
              disabled={reviewSaving}
            >
              Close
            </Button>
            <Button
              onClick={handleReviewSubmit}
              disabled={reviewSaving || !reviewTarget}
            >
              {reviewSaving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Queueing...
                </span>
              ) : (
                "Queue for processing"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
