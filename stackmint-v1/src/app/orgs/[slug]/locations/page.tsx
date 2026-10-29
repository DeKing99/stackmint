"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession, useOrganization } from "@clerk/nextjs";
import {
  MapPinned,
  ChevronRight,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClerkSupabaseClient } from "@/lib/supabase-client";
import { LocationAddressAutocomplete } from "@/components/location-address-autocomplete";

type Location = {
  id: string;
  location_name: string;
  location_slug: string;
  location_address: string;
  latitude: number | null;
  longitude: number | null;
  created_by: string;
  organization_id: string;
  created_at?: string;
};

type AlertType = "success" | "error" | null;

export default function SitesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [alert, setAlert] = useState<{ type: AlertType; message: string }>({
    type: null,
    message: "",
  });

  const { session } = useSession();
  const { organization } = useOrganization();
  const router = useRouter();

  const supabase = useMemo(
    () =>
      createClerkSupabaseClient(
        () => session?.getToken?.() ?? Promise.resolve(null),
      ),
    [session],
  );

  // Alert helper
  const showAlert = useCallback((type: AlertType, message: string) => {
    setAlert({ type, message });
    if (type === "success") {
      setTimeout(() => setAlert({ type: null, message: "" }), 3000);
    }
  }, []);

  // Slug generator
  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/-+/g, "-");
  }

  // Validate form inputs
  const validateLocationForm = (): string | null => {
    if (!locationName.trim()) {
      return "Location name is required";
    }
    if (!locationAddress.trim()) {
      return "Location address is required";
    }
    if (locationName.trim().length < 2) {
      return "Location name must be at least 2 characters";
    }
    if (locationAddress.trim().length < 5) {
      return "Location address must be at least 5 characters";
    }
    if (locationLat === null || locationLng === null) {
      return "Please select an address suggestion to capture coordinates";
    }
    return null;
  };

  // Create new location
  const handleCreateLocation = async () => {
    const validationError = validateLocationForm();
    if (validationError) {
      showAlert("error", validationError);
      return;
    }

    if (!organization?.id || !session?.user?.id) {
      showAlert("error", "Organization or user information is missing");
      return;
    }

    setIsCreatingLocation(true);

    try {
      const slug = generateSlug(locationName);

      const { data, error } = await supabase
        .from("company_locations")
        .insert([
          {
            location_name: locationName.trim(),
            location_slug: slug,
            location_address: locationAddress.trim(),
            latitude: locationLat,
            longitude: locationLng,
            organization_id: organization.id,
            created_by: session.user.id,
          },
        ])
        .select("*");

      if (error) {
        console.error("Error creating location:", error);
        showAlert("error", `Failed to create location: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        showAlert("error", "Location was created but failed to retrieve data");
        return;
      }

      const newLocation = data[0] as Location;
      setLocations((prev) => [newLocation, ...prev]);
      showAlert(
        "success",
        `Location "${newLocation.location_name}" created successfully`,
      );

      // Reset form
      setModalOpen(false);
      setLocationName("");
      setLocationAddress("");
      setLocationLat(null);
      setLocationLng(null);
    } catch (error) {
      console.error("Unexpected error creating location:", error);
      showAlert(
        "error",
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
    } finally {
      setIsCreatingLocation(false);
    }
  };

  // Fetch existing locations
  useEffect(() => {
    if (!organization?.id) return;

    const fetchLocations = async () => {
      setIsLoadingLocations(true);
      try {
        const { data, error } = await supabase
          .from("company_locations")
          .select("*")
          .eq("organization_id", organization.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching locations:", error);
          showAlert("error", "Failed to load locations");
          return;
        }

        setLocations(data || []);
      } catch (error) {
        console.error("Unexpected error fetching locations:", error);
        showAlert(
          "error",
          "An unexpected error occurred while loading locations",
        );
      } finally {
        setIsLoadingLocations(false);
      }
    };

    fetchLocations();
  }, [supabase, organization?.id, showAlert]);

  return (
    <main className="container mx-auto space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Locations</h1>
          <p className="text-muted-foreground">
            Manage the sites and offices you report data for.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <MapPinned className="mr-2 h-4 w-4" />
          Add new location
        </Button>
      </header>

      {alert.type && (
        <div
          role="alert"
          className={`flex items-center gap-3 border px-4 py-3 ${
            alert.type === "success"
              ? "border-green-300 bg-green-50 text-green-800"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {alert.type === "success" ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <p className="text-sm font-medium">{alert.message}</p>
        </div>
      )}

      {/* Create Location Dialog */}
      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create a new location</DialogTitle>
              <DialogDescription>
                Add a new location by providing the name and address. Search
                for an address to automatically capture its coordinates.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide">
                  Location Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Main Office, Site A, Warehouse"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  disabled={isCreatingLocation}
                  className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide">
                  Location Address *
                </label>
                <LocationAddressAutocomplete
                  value={locationAddress}
                  onChange={(val) => {
                    setLocationAddress(val);
                    // Clear coords when user edits address manually
                    setLocationLat(null);
                    setLocationLng(null);
                  }}
                  onSelect={(address, lat, lng) => {
                    setLocationAddress(address);
                    setLocationLat(lat);
                    setLocationLng(lng);
                  }}
                  disabled={isCreatingLocation}
                />
                {locationLat !== null && locationLng !== null ? (
                  <p className="text-xs text-green-600 mt-1">
                    ✓ Coordinates captured ({locationLat.toFixed(4)},{" "}
                    {locationLng.toFixed(4)})
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start typing to search for an address and select one to
                    capture its coordinates
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setModalOpen(false);
                  setLocationName("");
                  setLocationAddress("");
                  setLocationLat(null);
                  setLocationLng(null);
                }}
                disabled={isCreatingLocation}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateLocation}
                disabled={
                  isCreatingLocation ||
                  !locationName.trim() ||
                  !locationAddress.trim() ||
                  locationLat === null ||
                  locationLng === null
                }
              >
                {isCreatingLocation ? "Creating..." : "Create Location"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Your Locations</h2>
          {!isLoadingLocations && locations.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {locations.length}{" "}
              {locations.length === 1 ? "location" : "locations"}
            </span>
          )}
        </div>

        {isLoadingLocations && (
          <p className="text-sm text-muted-foreground">Loading locations...</p>
        )}

        {!isLoadingLocations && locations.length === 0 && (
          <div className="flex flex-col items-center gap-3 border border-dashed bg-muted/40 px-6 py-12 text-center">
            <MapPinned className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No locations yet. Create your first location to get started.
            </p>
            <Button variant="outline" onClick={() => setModalOpen(true)}>
              Add new location
            </Button>
          </div>
        )}

        {!isLoadingLocations && locations.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((location) => (
              <button
                key={location.id}
                onClick={() =>
                  router.push(
                    `/orgs/${organization?.slug}/locations/${location.id}/dashboard`,
                  )
                }
                className="group flex flex-col justify-between bg-card p-6 text-left text-card-foreground shadow-sm ring-1 ring-foreground/5 transition-all hover:shadow-md hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex-1">
                  <div className="mb-3 flex items-start gap-2">
                    <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <h3 className="font-heading text-lg font-semibold tracking-wider uppercase">
                      {location.location_name}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {location.location_address}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <p className="text-xs text-muted-foreground">
                    Created{" "}
                    {location.created_at
                      ? new Date(location.created_at).toLocaleDateString()
                      : "Recently"}
                  </p>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
