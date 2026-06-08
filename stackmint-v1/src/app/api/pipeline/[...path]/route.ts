import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PIPELINE_PATHS = new Set(["preflight", "update-upload-state"]);
const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8001";

function resolveBackendBaseUrl(): string {
  const configuredBaseUrl =
    process.env.BACKEND_BASE_URL ??
    process.env.NEXT_PUBLIC_BACKEND_BASE_URL ??
    DEFAULT_BACKEND_BASE_URL;

  return configuredBaseUrl.replace(/\/$/, "");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;

  if (path.length !== 1 || !ALLOWED_PIPELINE_PATHS.has(path[0])) {
    return NextResponse.json({ error: "Unsupported pipeline route." }, { status: 404 });
  }

  const bodyText = await request.text();
  const backendUrl = `${resolveBackendBaseUrl()}/pipeline/${path[0]}`;

  try {
    const upstreamResponse = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
      },
      body: bodyText,
      cache: "no-store",
    });

    const responseBody = await upstreamResponse.text();
    return new NextResponse(responseBody, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type":
          upstreamResponse.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Pipeline backend is unreachable.",
        detail: error instanceof Error ? error.message : "Unknown proxy error",
      },
      { status: 502 },
    );
  }
}
