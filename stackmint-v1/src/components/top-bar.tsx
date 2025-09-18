"use client";

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
import { useRouter, usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

type Site = {
  id: string;
  site_name: string;
  site_slug: string;
  site_location: string;
};

export function TopBar() {
  const [modalOpen, setModalOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [siteLocation, setSiteLocation] = useState("");
  const [isCreatingSite, setIsCreatingSite] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);

  const { session } = useSession();
  const { organization } = useOrganization();
  const router = useRouter();
  const pathname = usePathname();

  // Extract the current site slug from the URL: /orgSlug/siteSlug/dashboard
  const currentSiteSlug = pathname?.split("/")[2];
  const activeSite = sites.find((s) => s.site_slug === currentSiteSlug);

  // Supabase client with Clerk token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      async accessToken() {
        return session?.getToken() ?? null;
      },
    }
  );

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");

  // Fetch sites for current organization
  useEffect(() => {
    if (!organization) return;

    const fetchSites = async () => {
      const { data, error } = await supabase
        .from("construction_sites")
        .select("*")
        .eq("organization_id", organization.id);

      if (error) {
        console.error("Error fetching sites:", error);
      } else {
        setSites(data || []);
      }
    };

    fetchSites();
  }, [organization?.id]);

  // Handle creating a new site/location
  const handleCreateSite = async () => {
    if (!siteName || !siteLocation || !organization) return;

    setIsCreatingSite(true);

    const slug = generateSlug(siteName);
    const { data, error } = await supabase
      .from("construction_sites")
      .insert([
        {
          site_name: siteName,
          site_slug: slug,
          site_location: siteLocation,
          organization_id: organization.id,
          created_by: session?.user.id,
        },
      ])
      .select()
      .single(); // return inserted row

    if (error) {
      console.error("Error creating site:", error);
      setIsCreatingSite(false);
      return;
    }

    setSites((prev) => [...prev, data]);
    setModalOpen(false);
    setSiteName("");
    setSiteLocation("");
    setIsCreatingSite(false);

    // Redirect to new site's dashboard
    router.push(`/orgs/${organization.slug}/${slug}/insights`);
  };

  // Handle switching sites
  const handleSelectSite = (siteSlug: string) => {
    if (organization) {
      router.push(`/orgs/${organization.slug}/${siteSlug}/insights`);
    }
  };

  return (
    <div className="w-full h-12 bg-white border-b flex items-center justify-between px-4">
      {/* Left: Site Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            {activeSite ? activeSite.site_name : "Select Location"}
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60">
          {sites.map((site) => (
            <DropdownMenuItem
              key={site.id}
              onClick={() => handleSelectSite(site.site_slug)}
              className={
                site.site_slug === currentSiteSlug
                  ? "bg-gray-100 font-semibold"
                  : ""
              }
            >
              {site.site_name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setModalOpen(true)}>
            + Add New Location
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right: Org + Links */}
      <div className="flex items-center gap-6 text-sm">
        <span className="font-medium">{organization?.name || "Organization"}</span>
        <a href="#" className="hover:underline">
          English
        </a>
        <a href="#" className="hover:underline">
          Support
        </a>
        <a href="#" className="hover:underline">
          Profile
        </a>
      </div>

      {/* Modal for Creating Site */}
      {modalOpen && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a new location</DialogTitle>
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
              {isCreatingSite ? "Creating..." : "Create Location"}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
