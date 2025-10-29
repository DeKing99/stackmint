import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // use service role key only server-side
);

export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  const { fileId } = await params;
  const { userId, sessionId, isAuthenticated, orgId } =  await auth()  // optional, but good for security

  if (!sessionId || !isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch file metadata from your database
  const { data: file, error } = await supabase
    .from("uploaded_esg_files_construction") // or whatever your table is named
    .select("*")
    .eq("id", fileId)
    .single();

  if (error || !file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  console.log("Fetched file:", file);

  // Optional: validate that the user has access (same org, etc.)
   if (file.organization_id !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Generate a signed URL (valid for 60 seconds)
  const { data: signed } = await supabase.storage
    .from("esg-data-2") // your bucket name
    .createSignedUrl(file.file_url, 60, {
      download: false,
    });

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 });
  }

  console.log("Generated signed URL:", signed.signedUrl);


  return NextResponse.redirect(signed.signedUrl);

}
