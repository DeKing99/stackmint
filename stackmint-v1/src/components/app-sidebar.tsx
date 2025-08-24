"use client";

import * as React from "react";
import {
  //AudioWaveform,
  BookOpen,
  Command,
  //Command,
  Frame,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
} from "lucide-react";

import { NavMain } from "@/components/nav-main";
//import { NavProjects } from "@/components/nav-projects";
import { UserButton, useOrganization } from "@clerk/nextjs";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import Image from "next/image";
//import { IconCommandOff } from "@tabler/icons-react";

// This is sample data.
const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "{organization ? `/orgs/${organization.slug}/dashboard` : '#''}",
      icon: SquareTerminal,
      isActive: true,
      items: [],
    },
    {
      title: "Reports",
      url: "{organization ? `/orgs/${organization.slug}/reports` : '#''}",
      icon: BookOpen,
      items: [],
    },
    {
      title: "Collect",
      url: "{organization ? `/orgs/${organization.slug}/collect` : '#''}",
      icon: PieChart,
      items: [],
    },
    {
      title: "Enviromental",
      url: "#",
      icon: Frame,
      items: [],
    },
    {
      title: "Social",
      url: "#",
      icon: Map,
      items: [],
    },
    {
      title: "Governance",
      url: "#",
      icon: Command,
      items: [],
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
      items: [
        {
          title: "General",
          url: "#",
        },
        {
          title: "Team",
          url: "#",
        },
        {
          title: "Billing",
          url: "#",
        },
        {
          title: "Limits",
          url: "#",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { organization } = useOrganization();
 //<NavProjects projects={data.team} />

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href={organization ? `/orgs/${organization.slug}/dashboard` : "#"}>
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
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex ">
        {/*<SidebarMenuButton> <UserButton /> </SidebarMenuButton>*/}
          <UserButton />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
