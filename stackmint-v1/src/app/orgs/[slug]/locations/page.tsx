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

type Location = {
  id: string;
  location_name: string;
  location_slug: string;
  location_address: string;
  created_by: string;
  organization_id: string;
  created_at?: string;
};

type AlertType = "success" | "error" | null;

export default function SitesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
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
    <>
      {/* Alert Banner */}
      {alert.type && (
        <div
          className={`px-4 py-3 rounded-lg mb-4 flex items-center gap-3 ${
            alert.type === "success"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-red-100 text-red-800 border border-red-300"
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

      <Button
        className="px-4 py-2 text-sm font-medium text-white rounded-lg"
        onClick={() => setModalOpen(true)}
      >
        <MapPinned className="h-4 w-4 mr-2" />
        Add new location
      </Button>

      {/* Create Location Dialog */}
      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create a new location</DialogTitle>
              <DialogDescription>
                Add a new location by providing the name and address. You can
                update the address with Google Maps integration later.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Location Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Main Office, Site A, Warehouse"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  disabled={isCreatingLocation}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Location Address *
                </label>
                <input
                  type="text"
                  placeholder="e.g., 123 Main Street, City, State 12345"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  disabled={isCreatingLocation}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tip: You can integrate Google Maps API later for address
                  lookup
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setModalOpen(false);
                  setLocationName("");
                  setLocationAddress("");
                }}
                disabled={isCreatingLocation}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateLocation}
                disabled={isCreatingLocation}
              >
                {isCreatingLocation ? "Creating..." : "Create Location"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Locations List */}
      <div className="mt-8 space-y-6">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Your Locations</h2>

          {isLoadingLocations && (
            <p className="text-sm text-gray-600">Loading locations...</p>
          )}

          {!isLoadingLocations && locations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No locations yet. Create your first location to get started.
            </p>
          )}

          {!isLoadingLocations && locations.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {locations.map((location) => (
                <button
                  key={location.id}
                  onClick={() =>
                    router.push(
                      `/orgs/${organization?.slug}/locations/${location.id}/dashboard`,
                    )
                  }
                  className="group relative flex flex-col justify-between border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all text-left h-auto focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <div className="flex-1">
                    <div className="flex items-start gap-2 mb-3">
                      <MapPinned className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        {location.location_name}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      {location.location_address}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      Created{" "}
                      {location.created_at
                        ? new Date(location.created_at).toLocaleDateString()
                        : "Recently"}
                    </p>
                    <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-primary transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
