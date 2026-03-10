import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { hasOrgAdminPower, normalizeAppRole } from "@/utils/roles";

// ============================================
// Route Matchers
// ============================================

const publicRoutes = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing(.*)",
  "/public(.*)",
  "/api(.*)",
  "/no-access",
]);

const adminRoutes = createRouteMatcher(["/admin(.*)"]);
const orgAreaRoutes = createRouteMatcher(["/orgs/(.*)"]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ============================================
// Helper Functions
// ============================================

/**
 * Extract locationId from a route like:
 * /orgs/acme/locations/leeds-site/dashboard
 */
function extractLocationId(pathname: string): string | null {
  const match = pathname.match(/\/orgs\/[^/]+\/locations\/([^/]+)/);
  return match ? match[1] : null;
}

function extractOrgPathSegment(pathname: string): string | null {
  const match = pathname.match(/^\/orgs\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Check if route is org-level but NOT location-level.
 * Examples:
 * /orgs/acme/dashboard → true
 * /orgs/acme/settings → true
 * /orgs/acme/locations/hq/dashboard → false
 */
function isOrgLevelRoute(pathname: string): boolean {
  return pathname.startsWith("/orgs/") && !pathname.includes("/locations/");
}

/**
 * Check if route is location-level.
 * Examples:
 * /orgs/acme/locations/hq/dashboard → true
 */
function isLocationRoute(pathname: string): boolean {
  return pathname.includes("/locations/");
}

// ============================================
// Middleware
// ============================================

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims, redirectToSignIn, orgRole, orgId, orgSlug } = await auth();
  const pathname = req.nextUrl.pathname;

  // 1️⃣ Public routes: allow access
  if (publicRoutes(req)) {
    return;
  }

  // 2️⃣ Not authenticated: redirect to sign in
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  // 3️⃣ Admin routes: only owners can access
  if (adminRoutes(req)) {
    const role = normalizeAppRole({ orgRole });
    if (!hasOrgAdminPower(role)) {
      const url = req.nextUrl.clone();
      url.pathname = "/no-access";
      return Response.redirect(url);
    }
    return; // Allow owners to access admin routes
  }

  // 4️⃣ Extract metadata used for location-scoped access only
  const userMetadata = sessionClaims?.user_public_metadata as {
    allowed_locations?: string[];
    org_slug?: string;
  } | undefined;

  const role = normalizeAppRole({ orgRole });
  const allowedLocations = userMetadata?.allowed_locations || [];
  const orgPathSegment =
    extractOrgPathSegment(pathname) || orgSlug || userMetadata?.org_slug || orgId || "";

  // 4b. Guardrail: org segment must match the active org slug when available.
  if (orgAreaRoutes(req) && orgSlug && extractOrgPathSegment(pathname) && extractOrgPathSegment(pathname) !== orgSlug) {
    const url = req.nextUrl.clone();
    url.pathname = "/no-access";
    return Response.redirect(url);
  }

  // 5️⃣ Org area routes: enforce access control
  if (orgAreaRoutes(req)) {
    // 5a. User must have an active org context
    if (!orgId) {
      const url = req.nextUrl.clone();
      url.pathname = "/no-access";
      return Response.redirect(url);
    }

    // 5a-bis. Guardrail: path org slug must match authoritative org slug from DB.
    const pathOrgSegment = extractOrgPathSegment(pathname);
    if (pathOrgSegment) {
      const { data: orgRow, error: orgError } = await supabase
        .from("clerk_organisations")
        .select("slug")
        .eq("clerk_org_id", orgId)
        .maybeSingle();

      if (orgError || !orgRow || orgRow.slug !== pathOrgSegment) {
        const url = req.nextUrl.clone();
        url.pathname = "/no-access";
        return Response.redirect(url);
      }
    }

    // 5b. Check if this is an org-level route (not a location route)
    if (isOrgLevelRoute(pathname)) {
      // Only org admins/owners can access org-level pages
      if (!hasOrgAdminPower(role)) {
        // Redirect non-owners to their first allowed location
        if (allowedLocations.length > 0) {
          const url = req.nextUrl.clone();
          url.pathname = `/orgs/${orgPathSegment}/locations/${allowedLocations[0]}/dashboard`;
          return Response.redirect(url);
        }

        // No allowed locations: no access
        const url = req.nextUrl.clone();
        url.pathname = "/no-access";
        return Response.redirect(url);
      }
    }

    // 5c. Check if this is a location-level route
    if (isLocationRoute(pathname)) {
      const locationId = extractLocationId(pathname);

      if (!locationId) {
        // Malformed URL
        const url = req.nextUrl.clone();
        url.pathname = "/no-access";
        return Response.redirect(url);
      }

      // Ensure location exists and belongs to the active org.
      const { data: locationRow, error: locationError } = await supabase
        .from("company_locations")
        .select("id")
        .eq("id", locationId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (locationError || !locationRow) {
        const url = req.nextUrl.clone();
        url.pathname = "/no-access";
        return Response.redirect(url);
      }

      // Org admins/owners have access to all locations
      if (hasOrgAdminPower(role)) {
        return; // Allow
      }

      // Managers and members must have this location in their allowed list
      if (!allowedLocations.includes(locationId)) {
        const url = req.nextUrl.clone();
        url.pathname = "/no-access";
        return Response.redirect(url);
      }
    }
  }

  // Otherwise allow the request
  return;
});

export const config = {
  matcher: ["/((?!_next|_static|.*\\..*).*)"],
};
