import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { hasOrgAdminPower, normalizeAppRole } from "@/utils/roles";

export default async function RedirectPage() {
  const { userId, sessionClaims, orgRole, orgId, orgSlug } = await auth();

  // 1️⃣ Not authenticated → sign in
  if (!userId) {
    return redirect("/sign-in");
  }

  // 2️⃣ Extract metadata used for location-scoped access only
  const userMetadata = sessionClaims?.user_public_metadata as
    | {
        allowed_locations?: string[];
        org_slug?: string;
      }
    | undefined;

  const role = normalizeAppRole({ orgRole });
  const allowedLocations = userMetadata?.allowed_locations || [];
  const orgPathSegment = orgSlug || userMetadata?.org_slug || orgId;

  // 3️⃣ Validation: must have an active org
  if (!orgId) {
    return redirect("/no-access");
  }

  // 4️⃣ Org admins/owners → org dashboard
  if (hasOrgAdminPower(role)) {
    return redirect(`/orgs/${orgPathSegment}/dashboard`);
  }

  // 5️⃣ Manager or Member → redirect to first allowed location
  if (role === "manager" || role === "member") {
    // Check if user has allowed locations
    if (!allowedLocations || allowedLocations.length === 0) {
      return redirect("/no-access");
    }

    const firstLocation = allowedLocations[0];
    return redirect(
      `/orgs/${orgPathSegment}/locations/${firstLocation}/dashboard`,
    );
  }

  // 6️⃣ Unknown role → no access
  return redirect("/no-access");
}
