import { NextRequest, NextResponse } from "next/server";
import { forwardCollectionRequest } from "@/lib/collection-backend";

export async function GET(request: NextRequest) {
  const yearParam = request.nextUrl.searchParams.get("year");
  const year =
    yearParam === null
      ? new Date().getUTCFullYear()
      : Number(yearParam);

  if (
    (yearParam !== null && !/^\d{4}$/.test(yearParam)) ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100
  ) {
    return NextResponse.json(
      { error: "Year must be between 1900 and 2100." },
      { status: 400 },
    );
  }

  return forwardCollectionRequest(
    request,
    "/collection/completeness",
    year,
  );
}
