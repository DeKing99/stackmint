import { NextRequest } from "next/server";
import { forwardCollectionRequest } from "@/lib/collection-backend";

export async function GET(request: NextRequest) {
  return forwardCollectionRequest(request, "/collection/applicability");
}

export async function PUT(request: NextRequest) {
  return forwardCollectionRequest(request, "/collection/applicability");
}
