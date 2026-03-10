"use client";

import * as React from "react";
import {
  // Building2,
  // BookOpen,
  FolderOpen,
  // MapPin,
  // PieChart,
  // Users,
  SquareTerminal,
  ReceiptText,
  Library,
  LayoutDashboard,
  Blocks,
  Map,
  FileChartPie,
  Settings,
  Users2,
  Building,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
import { UserButton, useAuth, useOrganization } from "@clerk/nextjs";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type UserMetadata = {
  role?: string;
  org_slug?: string;
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { organization } = useOrganization();
  const { orgId, orgRole, sessionClaims } = useAuth();
  const pathname = usePathname();

  const userMetadata =
    (sessionClaims?.user_public_metadata as UserMetadata | undefined) || {};

  const orgPathSegment =
    organization?.slug || userMetadata.org_slug || orgId || "";
  const isOrgAdmin = orgRole === "org:owner" || orgRole === "org:admin";
  const isManager = userMetadata.role === "manager";
  const canManageTeam = isOrgAdmin || isManager;

  const currentLocationId = React.useMemo(() => {
    const match = pathname.match(/\/orgs\/[^/]+\/locations\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const isLocationRoute = Boolean(currentLocationId);
  const locationBase =
    isLocationRoute && currentLocationId
      ? `/orgs/${orgPathSegment}/locations/${currentLocationId}`
      : null;

  const navMain = React.useMemo(() => {
    const items: { title: string; url: string; icon: typeof SquareTerminal }[] =
      [
        {
          title: "Dashboard",
          url: locationBase
            ? `${locationBase}/dashboard`
            : orgPathSegment
              ? `/orgs/${orgPathSegment}/dashboard`
              : "#",
          icon: LayoutDashboard,
        },
        {
          title: "Reports",
          url: locationBase
            ? `${locationBase}/reports`
            : orgPathSegment
              ? `/orgs/${orgPathSegment}/reports`
              : "#",
          icon: FileChartPie,
        },
        {
          title: "Collect",
          url: locationBase
            ? `${locationBase}/collect`
            : orgPathSegment
              ? `/orgs/${orgPathSegment}/collect`
              : "#",
          icon: Library,
        },
      ];

    if (canManageTeam || isOrgAdmin) {
      items.splice(1, 0, {
        title: "Locations",
        url: orgPathSegment ? `/orgs/${orgPathSegment}/locations` : "#",
        icon: Map,
      });
    }

    if (locationBase) {
      items.push({
        title: "Overview",
        url: `${locationBase}/overview`,
        icon: Building,
      });
    } else {
      items.push({
        title: "Files",
        url: orgPathSegment ? `/orgs/${orgPathSegment}/files` : "#",
        icon: FolderOpen,
      });
    }

    if (canManageTeam) {
      items.push({
        title: "Team",
        url: locationBase
          ? `${locationBase}/invite-members`
          : orgPathSegment
            ? `/orgs/${orgPathSegment}/team`
            : "#",
        icon: Users2,
      });
    }

    if (isOrgAdmin && !locationBase) {
      items.push(
        {
          title: "Billing",
          url: orgPathSegment ? `/orgs/${orgPathSegment}/billing` : "#",
          icon: ReceiptText,
        },
        {
          title: "Integrations",
          url: orgPathSegment ? `/orgs/${orgPathSegment}/integrations` : "#",
          icon: Blocks,
        },
      );
    }

    return items;
  }, [canManageTeam, isOrgAdmin, locationBase, orgPathSegment]);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link
                href={
                  organization ? `/orgs/${organization.slug}/dashboard` : "#"
                }
              >
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Image
                    src={organization?.imageUrl || "/next.svg"}
                    alt="Organization Logo"
                    width={24}
                    height={24}
                    className="h-6 w-6 rounded-full"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {organization?.name}
                  </span>
                  <span className="truncate text-xs">Enterprise</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex justify-center">
          <UserButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
