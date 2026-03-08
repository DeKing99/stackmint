"use client";

import * as React from "react";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { useAuth, useOrganization, useSession } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { createClerkSupabaseClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UserMetadata = {
  allowed_locations?: string[];
  org_slug?: string;
};

type LocationRecord = {
  id: string;
  location_name: string;
  location_address?: string | null;
};

const LOCATION_NAME_CACHE = new Map<string, string>();
const LOCATION_LIST_CACHE = new Map<string, LocationRecord[]>();

export function RouteContextChip() {
  const pathname = usePathname();
  const router = useRouter();
  const { organization } = useOrganization();
  const { orgId, orgRole, sessionClaims } = useAuth();
  const { session } = useSession();

  const [locationName, setLocationName] = React.useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = React.useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = React.useState(false);
  const [locations, setLocations] = React.useState<LocationRecord[]>([]);

  const userMetadata =
    (sessionClaims?.user_public_metadata as UserMetadata | undefined) || {};
  const allowedLocations = userMetadata.allowed_locations || [];
  const orgPathSegment =
    organization?.slug || userMetadata.org_slug || orgId || "";

  const isOrgAdmin = orgRole === "org:owner" || orgRole === "org:admin";
  const canSwitchLocations = isOrgAdmin || allowedLocations.length > 1;

  const currentLocationId = React.useMemo(() => {
    const match = pathname.match(/\/orgs\/[^/]+\/locations\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const isLocationRoute = Boolean(currentLocationId);

  const supabase = React.useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null),
      ),
    [session],
  );

  React.useEffect(() => {
    if (!isLocationRoute || !currentLocationId || !orgId) {
      setLocationName(null);
      return;
    }

    const cacheKey = `${orgId}:${currentLocationId}`;
    const cachedName = LOCATION_NAME_CACHE.get(cacheKey);
    if (cachedName) {
      setLocationName(cachedName);
      return;
    }

    const fetchLocationName = async () => {
      const { data, error } = await supabase
        .from("company_locations")
        .select("id, location_name")
        .eq("id", currentLocationId)
        .eq("organization_id", orgId)
        .single();

      if (error) {
        setLocationName("Location");
        return;
      }

      const nextName = (data as LocationRecord)?.location_name || "Location";
      LOCATION_NAME_CACHE.set(cacheKey, nextName);
      setLocationName(nextName);
    };

    fetchLocationName();
  }, [currentLocationId, isLocationRoute, orgId, supabase]);

  React.useEffect(() => {
    if (!switchOpen || !isLocationRoute || !orgId || !canSwitchLocations) {
      return;
    }

    const listCacheKey = `${orgId}:${isOrgAdmin ? "admin" : allowedLocations.join(",")}`;
    const cachedList = LOCATION_LIST_CACHE.get(listCacheKey);
    if (cachedList) {
      setLocations(cachedList);
      return;
    }

    const fetchSwitchableLocations = async () => {
      setIsLoadingLocations(true);

      let query = supabase
        .from("company_locations")
        .select("id, location_name, location_address")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (!isOrgAdmin) {
        if (allowedLocations.length === 0) {
          setLocations([]);
          setIsLoadingLocations(false);
          return;
        }
        query = query.in("id", allowedLocations);
      }

      const { data, error } = await query;
      if (error) {
        setLocations([]);
      } else {
        const next = (data || []) as LocationRecord[];
        setLocations(next);
        LOCATION_LIST_CACHE.set(listCacheKey, next);
      }

      setIsLoadingLocations(false);
    };

    fetchSwitchableLocations();
  }, [
    allowedLocations,
    canSwitchLocations,
    isLocationRoute,
    isOrgAdmin,
    orgId,
    supabase,
    switchOpen,
  ]);

  if (isLocationRoute) {
    return (
      <>
        <div className="ml-auto inline-flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
            <MapPin className="size-4" />
            <span>{locationName || "Loading location..."}</span>
          </div>

          {canSwitchLocations && (
            <Button size="sm" onClick={() => setSwitchOpen(true)}>
              Switch
            </Button>
          )}

          {isOrgAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/orgs/${orgPathSegment}/dashboard`)}
            >
              <ArrowLeft className="size-4 mr-1" />
              Return
            </Button>
          )}
        </div>

        <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Switch Location</DialogTitle>
              <DialogDescription>
                Choose a location to continue in that workspace.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">Current location</p>
              <p className="text-sm font-medium">
                {locationName || "Location"}
              </p>
            </div>

            <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
              {isLoadingLocations && (
                <p className="text-sm text-muted-foreground">
                  Loading locations...
                </p>
              )}

              {!isLoadingLocations && locations.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No locations available.
                </p>
              )}

              {!isLoadingLocations &&
                locations.map((location) => (
                  <Button
                    key={location.id}
                    type="button"
                    variant={
                      location.id === currentLocationId
                        ? "secondary"
                        : "outline"
                    }
                    className="w-full h-auto justify-start py-3"
                    onClick={() => {
                      setSwitchOpen(false);
                      router.push(
                        `/orgs/${orgPathSegment}/locations/${location.id}/dashboard`,
                      );
                    }}
                  >
                    <div className="flex items-start gap-3 text-left">
                      <MapPin className="mt-0.5 size-4" />
                      <div>
                        <p className="font-medium leading-5 flex items-center gap-2">
                          {location.location_name}
                          {location.id === currentLocationId && (
                            <span className="text-[10px] uppercase tracking-wide text-primary">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground leading-4 mt-1">
                          {location.location_address || "No address set"}
                        </p>
                      </div>
                    </div>
                  </Button>
                ))}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="ml-auto inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
      <Building2 className="size-4" />
      <span>{organization?.name || "Organization"}</span>
    </div>
  );
}
