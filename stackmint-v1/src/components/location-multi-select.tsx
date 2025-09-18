"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Site = {
  id: string;
  site_name: string;
};

type Props = {
  sites: Site[];
  selectedSites: string[]; // just IDs
  setSelectedSites: (ids: string[]) => void;
};

export function LocationMultiSelect({
  sites,
  selectedSites,
  setSelectedSites,
}: Props) {
  const toggleSite = (siteId: string, checked: boolean) => {
    if (checked) {
      setSelectedSites([...selectedSites, siteId]);
    } else {
      setSelectedSites(selectedSites.filter((id) => id !== siteId));
    }
  };

  const selectedNames = sites
    .filter((s) => selectedSites.includes(s.id))
    .map((s) => s.site_name);

  return (
    <div className="space-y-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            {selectedNames.length > 0
              ? `${selectedNames[0]}${
                  selectedNames.length > 1 ? ` +${selectedNames.length - 1}` : ""
                }`
              : "Select locations"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Locations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {sites.map((site) => (
            <DropdownMenuCheckboxItem
              key={site.id}
              checked={selectedSites.includes(site.id)}
              onCheckedChange={(checked) => toggleSite(site.id, !!checked)}
            >
              {site.site_name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Show all names under button */}
      {selectedNames.length > 0 && (
        <p className="text-xs text-neutral-400">
          {selectedNames.join(", ")}
        </p>
      )}
    </div>
  );
}
