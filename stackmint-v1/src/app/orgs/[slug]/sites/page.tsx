"use client"

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@supabase/supabase-js";
import { useSession, useOrganization } from "@clerk/nextjs";
import { MapPinned, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation";
//import { useSession } from "@clerk/clerk-react"; // Ensure you have Clerk set up for authentication
//import { supabase } from "@/lib/supabaseClient"; // Adjust path based on your setup

type Site = {
  id: string; // Assuming you have an ID field
  site_name: string;
  site_slug: string;
  site_location: string;
}

export default function SitesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteLocation, setSiteLocation] = useState("");
  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [sites, setSites] = useState<Site[]>([]); // Replace `any` with your Site type


  const { session } = useSession();
  const { organization } = useOrganization();
  const router = useRouter();
  
  
  function createClerkSupabaseClient() {
      return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          async accessToken() {
            return session?.getToken() ?? null;
          },
        }
      );
    }

  const supabase = createClerkSupabaseClient();

  // Slug generator
  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");
  }

  // Create new site
  const handleCreateSite = async () => {
    if (!siteName || !siteLocation) return;

    setIsCreatingSite(true);

    const slug = generateSlug(siteName);
    const { data, error } = await supabase
      .from("construction_sites") // replace with your actual table name
      .insert([
        {
          site_name: siteName,
          site_slug: slug,
          site_location: siteLocation,
          organization_id: organization?.id, // Assuming you have an organization ID
          created_by: session?.user.id, // Assuming you have a user ID from Clerk
        },
      ]);
    // Log the data and error for debugging
    console.log("Creating site with data:", siteName, slug, siteLocation, organization?.id, session?.user.id)
    if (error) {
      console.error("Error creating site:", error);
    } else {
      console.log("Site created:", data);
      setSites((prev) => [...prev, ...(data || [])]);
    }

    setIsCreatingSite(false);
    setModalOpen(false);
    setSiteName("");
    setSiteLocation("");
  };

  // Fetch existing sites
  useEffect(() => {
    if (!organization) return;
    const fetchSites = async () => {

      //console.log("Organization id", organization)
      const { data, error } = await supabase.from("construction_sites").select("*").eq("organization_id", organization?.id);

      if (error) {
        console.error("Error fetching sites:", error);
      } else {
        setSites(data || []);
      }
    };

    fetchSites();
  }, [supabase, organization])


  

  return (
    <>
      <Button
        className="px-4 py-2 text-sm font-medium text-white rounded-lg"
        onClick={() => setModalOpen(true)}
      >
        Add new site
      </Button>

      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new construction site</DialogTitle>
              <DialogDescription>
                Enter the site name and location below.
              </DialogDescription>
            </DialogHeader>

            <input
              type="text"
              placeholder="Enter site name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full border rounded p-2 mt-2"
            />

            <input
              type="text"
              placeholder="Enter site location"
              value={siteLocation}
              onChange={(e) => setSiteLocation(e.target.value)}
              className="w-full border rounded p-2 mt-2"
            />

            <Button
              className="mt-4 w-full"
              onClick={handleCreateSite}
              disabled={isCreatingSite}
            >
              {isCreatingSite ? "Creating Site..." : "Create Site"}
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Display list of created sites */}
      <div className="mt-8 space-y-6">
        <div className="mt-8 space-y-4">
          <h2 className="text-xl">Your Sites</h2>

          {sites.length === 0 && (
            <p className="text-sm text-muted-foreground">No sites yet.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sites.map((site) => (
              <button
                key={site.id}
                onClick={() => router.push(`/orgs/${organization?.slug}/sites/${site.site_slug}`)} // handle navigation here
                className="group relative flex flex-col justify-between border rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition-all text-left w-full h-40 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <div>
                  <p className="text-lg text-muted-foreground">
                    {site.site_name} <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-hover:text-primary transition-colors" />
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center">
                    <MapPinned className="inline-block mr-1 h-4 w-4" />
                    {site.site_location}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
