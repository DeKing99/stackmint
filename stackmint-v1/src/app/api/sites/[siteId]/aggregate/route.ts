// app/api/sites/[siteId]/aggregate/route.ts
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: { siteId: string } }) {
  const { siteId } = params;

  // server-side fetch, bypass browser
  const backendUrl = `http://localhost:8001/sites/${siteId}/aggregate`; // your FastAPI
  try {
    const res = await fetch(backendUrl);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("API fetch error:", err);
    return NextResponse.json({ error: "Backend fetch failed" }, { status: 500 });
  }
}
