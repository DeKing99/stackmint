// app/orgs/[org]/[locationSlug]/reports/[report]/page.tsx
import { Toaster } from "sonner";
import { auth } from "@clerk/nextjs/server";
import { PlateEditor } from "@/components/editor/plate-editor";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@clerk/nextjs/server"; // safer for server
// ^ don’t use useSession() here, it’s a client hook

interface PageProps {
  params: {
    org: string;
    locationSlug: string; // 👈 add this
    reportSlug: string;       // 👈 this is your report slug
  };
}

export default async function Page(props: { params: Promise<PageProps["params"]> }) {

  const params = await props.params;
  //const { isAuthenticated, redirectToSignIn, orgId } = await auth();
  const { userId, orgId, redirectToSignIn} = await auth();
  if (!userId) return redirectToSignIn();
  if (!orgId) return <p>You are not authorized to view this page.</p>;


  // ⚠️ can't use useSession in a server component
  // if you need Supabase auth on the server, you can use a service role key
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // now params.locationSlug is available
  const { data, error } = await supabase
    .from("construction_sites_reports")
    .select("id, report_content")
    .eq("organization_id", orgId)
    .eq("report_location", params.locationSlug) // 👈 fix here
    .eq("report_slug", params.reportSlug)
    .single();
    console.log("Fetched report data:", data);

  if (error) {
    console.error("Error fetching report:", error);
    return <p>Error loading report.</p>;
  }

  return (
    <div className="h-screen w-full">
      <PlateEditor docId={data?.id} initialValue={data?.report_content}/>
      {/* <PlateEditor docId={data?.id} initialValue={data?.report_content} /> */}
      {/* <Toaster /> */}
    </div>
  );
}
