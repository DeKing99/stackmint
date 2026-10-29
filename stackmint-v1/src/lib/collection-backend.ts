import { createHmac, createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { hasOrgAdminPower, normalizeAppRole } from "@/utils/roles";

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8001";

export async function forwardCollectionRequest(
  request: Request,
  backendPath: "/collection/completeness" | "/collection/applicability",
  year?: number,
) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    request.method === "PUT" &&
    !hasOrgAdminPower(normalizeAppRole({ orgRole }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Collection API requires server-side Supabase credentials.");
    return NextResponse.json(
      { error: "Collection service is not configured." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let organizationId = orgId;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orgId,
    )
  ) {
    const { data: organization, error: organizationError } = await supabase
      .from("clerk_organisations")
      .select("id")
      .eq("clerk_org_id", orgId)
      .maybeSingle();

    if (organizationError) {
      console.error(
        "Could not resolve collection organization:",
        organizationError,
      );
      return NextResponse.json(
        { error: "Could not resolve organization." },
        { status: 500 },
      );
    }
    if (!organization?.id) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 },
      );
    }
    organizationId = organization.id;
  }

  const body = request.method === "PUT" ? await request.text() : "";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = [
    timestamp,
    request.method.toUpperCase(),
    backendPath,
    organizationId,
    year?.toString() ?? "",
    bodyHash,
  ].join("\n");
  const signature = createHmac("sha256", supabaseKey)
    .update(message)
    .digest("hex");

  const query = new URLSearchParams({
    organization_id: organizationId,
    ...(year === undefined ? {} : { year: year.toString() }),
  });
  const baseUrl =
    process.env.BACKEND_BASE_URL ??
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL ??
    DEFAULT_BACKEND_BASE_URL;

  try {
    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/$/, "")}${backendPath}?${query}`,
      {
        method: request.method,
        headers: {
          "X-Collection-Timestamp": timestamp,
          "X-Collection-Signature": signature,
          ...(request.method === "PUT"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(request.method === "PUT" ? { body } : {}),
        cache: "no-store",
      },
    );
    const responseBody = await upstreamResponse.text();
    return new NextResponse(responseBody, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type":
          upstreamResponse.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Collection backend request failed:", error);
    return NextResponse.json(
      { error: "Collection backend is unreachable." },
      { status: 502 },
    );
  }
}
