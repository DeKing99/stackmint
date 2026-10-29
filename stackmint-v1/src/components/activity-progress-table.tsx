"use client";

import Link from "next/link";
import { useState } from "react";
// getting the activity types from the schema which is not bad maybe ill change so ti get is fromsupabase opr maybe not since we will be passing the requiered ones anyways.
import { activityTypes } from "@/lib/activity_types_schema";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PAGE_SIZE = 8;

type ActivityStatus =
  | "complete"
  | "in_progress"
  | "missing"
  | "not_applicable"
  | "unavailable";

const STATUS_META: Record<
  ActivityStatus,
  { label: string; textClass: string; barClass: string }
> = {
  complete: {
    label: "Complete",
    textClass: "text-green-600",
    barClass: "[&>div]:bg-green-600",
  },
  in_progress: {
    label: "In progress",
    textClass: "text-amber-600",
    barClass: "[&>div]:bg-amber-500",
  },
  missing: {
    label: "Missing",
    textClass: "text-red-600",
    barClass: "[&>div]:bg-red-600",
  },
  not_applicable: {
    label: "Not applicable",
    textClass: "text-muted-foreground",
    barClass: "[&>div]:bg-muted-foreground",
  },
  unavailable: {
    label: "Unavailable",
    textClass: "text-muted-foreground",
    barClass: "[&>div]:bg-muted-foreground",
  },
};

function getStatus(percentage: number): ActivityStatus {
  if (percentage >= 100) return "complete";
  if (percentage > 0) return "in_progress";
  return "missing";
}

type ActivityProgressTableProps = {
  slug: string;
  /** Completion percentage keyed by activity type; null means not applicable. */
  completion?: Record<string, number | null>;
  /** Activity type values to show; defaults to every known type. */
  requiredActivityValues?: string[];
  id?: string;
};

export default function ActivityProgressTable({
  slug,
  completion = {},
  requiredActivityValues,
  id,
}: ActivityProgressTableProps) {
  const rows = activityTypes.filter(
    (a) => !requiredActivityValues || requiredActivityValues.includes(a.value),
  );

  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Activity data status</CardTitle>
        <CardDescription>
          Status is shown only when a completion calculation is available.
          Click an activity to open its timeline in a new tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="table" className="w-full">
          <div
            role="row"
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_6rem] gap-4 border-b pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            <span role="columnheader">Activity</span>
            <span role="columnheader">Progress</span>
            <span role="columnheader" className="text-right">
              Status
            </span>
          </div>
          {visibleRows.map((a) => {
            const value = completion[a.value];
            const percentage =
              typeof value === "number" && Number.isFinite(value)
                ? Math.min(100, Math.max(0, value))
                : null;
            const status: ActivityStatus =
              value === null
                ? "not_applicable"
                : percentage === null
                  ? "unavailable"
                  : getStatus(percentage);
            const meta = STATUS_META[status];

            return (
              <Link
                key={a.value}
                role="row"
                href={`/orgs/${slug}/collect/timeline/${a.value}`}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_6rem] items-center gap-4 border-b py-3 transition-colors hover:bg-muted/50"
              >
                <span role="cell" className="truncate font-medium">
                  {a.label}
                </span>
                <span role="cell" className="flex items-center gap-3">
                  {percentage === null ? (
                    <span className="text-sm text-muted-foreground">
                      {meta.label}
                    </span>
                  ) : (
                    <>
                      <Progress
                        value={percentage}
                        className={`h-2 rounded-none ${meta.barClass}`}
                      />
                      <span className="w-10 text-right text-sm tabular-nums">
                        {Math.round(percentage)}%
                      </span>
                    </>
                  )}
                </span>
                <span
                  role="cell"
                  className={`text-right text-sm font-medium ${meta.textClass}`}
                >
                  {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
        {pageCount > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {currentPage + 1} of {pageCount} ({rows.length} activities)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount - 1}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
