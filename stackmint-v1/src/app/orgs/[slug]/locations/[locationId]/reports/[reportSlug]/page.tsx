import { auth } from "@clerk/nextjs/server";
import { PlateEditor } from "@/components/editor/plate-editor";
import { createClient } from "@supabase/supabase-js";

interface PageProps {
  params: {
    org: string;
    locationId: string;
    reportSlug: string;
  };
}

export default async function Page(props: {
  params: Promise<PageProps["params"]>;
}) {
  const params = await props.params;
  //const { isAuthenticated, redirectToSignIn, orgId } = await auth();
  const { userId, orgId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  if (!orgId) return <p>You are not authorized to view this page.</p>;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from("company_reports")
    .select("id, report_content")
    .eq("organization_id", orgId)
    .eq("report_location", params.locationId)
    .eq("report_slug", params.reportSlug)
    .single();

  if (error) {
    console.error("Error fetching report:", error);
    return <p>Error loading report.</p>;
  }

  return (
    <div className="h-screen w-full">
      <PlateEditor docId={data?.id} initialValue={data?.report_content} />
    </div>
  );
}
