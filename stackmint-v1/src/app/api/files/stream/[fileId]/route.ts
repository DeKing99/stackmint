import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request, { params }: { params: { fileId: string } }) {
  const { fileId } = await params;
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: file, error } = await supabase
    .from("uploaded_esg_files_construction")
    .select("*")
    .eq("id", fileId)
    .single();

  if (error || !file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (file.organization_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("esg-data-2")
    .download(file.file_url);

  if (downloadError || !fileData) {
    console.error("Download error:", downloadError);
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
  }

  //const mime = file.mime_type || "application/octet-stream";
  const mime = file.mime_type === "text/csv"
  ? "text/plain"
  : file.mime_type || "application/octet-stream";

  console.log("Serving file:", file.file_name, "with mime to see if its the culprit:", file.mime_type);


  // Convert to stream for correct inline rendering
  const stream = fileData.stream();

  return new Response(stream, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.file_name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
