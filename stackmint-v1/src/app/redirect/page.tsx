import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";


export default async function RedirectPage() {
  const { userId, orgId, orgRole, sessionClaims } = await auth();
  if (!userId) return redirect("/sign-in");
  
  // // if user has no org selected → force onboarding
  // const orgs = (await clerkClient()).organizations.getOrganizationMembershipList({ userId })

  // if (orgs.length === 0) {
  // No orgs → force onboarding
  //   return redirect("/onboarding/org-setup");
  // }
  if (!orgId) return redirect("/onboarding/org-setup");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch authoritative org row by clerk_org_id
  const { data: orgRow, error } = await supabase
    .from("clerk_organisations")
    .select(
      "slug, headquarter_location_id, locations_id, onboarding_step1, onboarding_step2"
    )
    .eq("clerk_org_id", orgId)
    .single();

  if (error || !orgRow) {
    // No DB row — treat as uninitialized org
    return redirect("/onboarding/org-setup");
  }

  const { slug, headquarter_location_id, onboarding_step1, onboarding_step2 } =
    orgRow;

  //const slug = orgRow.slug;
  // const hq = orgRow.headquarter_location_id;
  

  const isAdmin = orgRole === "org:admin" || orgRole === "org:owner";
  if (isAdmin) {
    // Step 1 not done: org setup
    if (!onboarding_step1) {
      return redirect("/onboarding/org-setup");
    }

    // Step 2 not done: emissions setup
    if (onboarding_step1 && !onboarding_step2) {
      return redirect("/onboarding/emission-estimates");
    }

    // All done but no HQ? Back to setup
    if (!headquarter_location_id) {
      return redirect("/onboarding/org-setup");
    }

    // All complete → dashboard
    return redirect(`/orgs/${slug}/${headquarter_location_id}/dashboard`);
    // if (headquarter_location_id) return redirect(`/orgs/${slug}/${headquarter_location_id}/dashboard`);
    // // if HQ missing but admin — send to onboarding to fix HQ
    // return redirect("/onboarding/org-setup");
  }

  //for members, check allowed locations from session claims
  const allowed: string[] =
    sessionClaims?.user_public_metadata?.allowed_locations || [];
  // member -> redirect to first allowed location
  if (allowed.length > 0)
    return redirect(`/orgs/${slug}/${allowed[0]}/dashboard`);

  // fallback: no location for member -> 404
  return notFound();
}
