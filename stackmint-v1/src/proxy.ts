import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// ----------------- Route matchers -----------------
const publicRoutes = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing(.*)",
  "/public(.*)",
  "/api(.*)",
]);

const onboardingRoutes = createRouteMatcher(["/onboarding(.*)"]);
const orgAreaRoutes = createRouteMatcher(["/orgs/(.*)"]);
const billingProtected = createRouteMatcher([
  "/orgs/(.*)/dashboard(.*)",
  "/orgs/(.*)/insights(.*)",
  "/orgs/(.*)/reports(.*)",
  "/orgs/(.*)/collect(.*)",
  "/orgs/(.*)/team(.*)",
]);

// ----------------- Supabase client (server-only) -----------------
// WARNING: Use SERVICE_ROLE_KEY only in server-only code (this middleware runs server-side).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default clerkMiddleware(async (auth, req) => {
  // Clerk auth helpers
  const { userId, orgId, orgRole, redirectToSignIn } = await auth();
  const url = req.nextUrl.clone();

  // 1) Public route access: allow
  if (publicRoutes(req)) return;

  // 2) Not authenticated -> redirect to sign in
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  // 3) If user has no org yet and is trying to access org area -> send to onboarding org-setup
  if (userId && !orgId && orgAreaRoutes(req)) {
    url.pathname = "/onboarding/org-setup";
    return Response.redirect(url);
  }

  // At this point we expect the user to have an org selected (orgId) for org routes.
  // If user has an orgId, load authoritative org record from Supabase.
  let orgRow: any = null;
  if (orgId) {
    const { data, error } = await supabase
      .from("clerk_organisations") // table where we store authoritative org rows
      .select("id, clerk_org_id, slug, billing_active, onboarding_step1, onboarding_step2, headquarter_location_id, locations_id")
      .eq("clerk_org_id", orgId)
      .limit(1)
      .single();

    if (!error && data) orgRow = data;
    // if no orgRow found we will treat as not-onboarded below (redirect to onboarding)
  }

  const isAdmin = orgRole === "org:admin" || orgRole === "org:owner";

  // 4) Prevent non-admins from opening the onboarding routes
  // if (onboardingRoutes(req) && !isAdmin) {
  //   // members should not go through org-setup
  //   url.pathname = "/";
  //   return Response.redirect(url);
  // }
  // 4) Prevent MEMBERS from opening onboarding routes — but allow users with no org yet
  if (onboardingRoutes(req) && orgId && !isAdmin) {
    url.pathname = "/";
    return Response.redirect(url);
  }

  // 5) If user has an org selected but we couldn't find a DB row -> force onboarding to let admin create/configure
  if (orgId && !orgRow) {
    if (orgAreaRoutes(req)) {
      url.pathname = "/onboarding/org-setup";
      return Response.redirect(url);
    }
    return;
  }

  // 6) If admin and org exists but onboarding incomplete -> force onboarding
  // const onboardingComplete = !!orgRow?.onboarding_step1 && !!orgRow?.onboarding_step2;
  // if (isAdmin && orgAreaRoutes(req) && !onboardingComplete && !onboardingRoutes(req)) {
  //   url.pathname = "/onboarding/org-setup";
  //   return Response.redirect(url);
  // }

  if (isAdmin && orgAreaRoutes(req) && !onboardingRoutes(req)) {
    if (!orgRow.onboarding_step1) {
      url.pathname = "/onboarding/org-setup";
      return Response.redirect(url);
    }

    if (orgRow.onboarding_step1 && !orgRow.onboarding_step2) {
      url.pathname = "/onboarding/emission-estimates";
      return Response.redirect(url);
    }
  }

  // 7) Billing enforcement for admin trying to access billing-protected pages
  const billingActive = !!orgRow?.billing_active;
  const onboardingComplete =
    !!orgRow?.onboarding_step1 && !!orgRow?.onboarding_step2;

  if (
    isAdmin &&
    billingProtected(req) &&
    onboardingComplete &&
    !billingActive
  ) {
    url.pathname = `/orgs/${orgRow.slug}/billing`;
    return Response.redirect(url);
  }

  // Otherwise allow the request
  return;
});

export const config = {
  matcher: ["/((?!_next|_static|.*\\..*).*)"],
};
