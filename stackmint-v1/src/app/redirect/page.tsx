"use client";

import * as React from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

type UserMetadata = {
  allowed_locations?: string[];
  org_slug?: string;
};

export default function RedirectPage() {
  const router = useRouter();
  const { isLoaded, userId, orgId, orgSlug, orgRole, sessionClaims } =
    useAuth();

  React.useEffect(() => {
    if (!isLoaded) return;

    if (!userId) {
      router.replace("/sign-in");
      return;
    }

    if (!orgId) {
      router.replace("/no-access");
      return;
    }

    const userMetadata =
      (sessionClaims?.user_public_metadata as UserMetadata | undefined) || {};
    const allowedLocations = userMetadata.allowed_locations || [];
    const orgPathSegment = orgSlug || userMetadata.org_slug || orgId;
    const isOrgAdmin = orgRole === "org:owner" || orgRole === "org:admin";

    if (isOrgAdmin) {
      router.replace(`/orgs/${orgPathSegment}/dashboard`);
      return;
    }

    if (allowedLocations.length > 0) {
      router.replace(
        `/orgs/${orgPathSegment}/locations/${allowedLocations[0]}/dashboard`,
      );
      return;
    }

    router.replace("/no-access");
  }, [isLoaded, orgId, orgRole, orgSlug, router, sessionClaims, userId]);

  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span>Preparing your workspace...</span>
      </div>
    </div>
  );
}
