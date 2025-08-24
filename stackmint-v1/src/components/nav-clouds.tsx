"use client";
import * as React from "react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";

import { ForwardRefExoticComponent, RefAttributes } from "react";
import { IconProps, Icon } from "@tabler/icons-react";

type CloudSubItem = {
  title: string;
  url: string;
};

type CloudItem = {
  title: string;
  icon: ForwardRefExoticComponent<IconProps & RefAttributes<Icon>>;
  url: string;
  items: CloudSubItem[];
};

interface NavCloudsProps {
  items: CloudItem[];
}

export function NavClouds({ items }: NavCloudsProps) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  return (
    <SidebarMenu>
      {items.map((section, i) => {
        const Icon = section.icon;
        const isOpen = openIndex === i;

        return (
          <div key={section.title}>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Icon className="!size-5" />
                  <span>{section.title}</span>
                </div>
                <IconChevronRight
                  className={`!size-4 transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
              </SidebarMenuButton>
            </SidebarMenuItem>

            {isOpen && (
              <div className="ml-8 flex flex-col space-y-1">
                {section.items.map((item) => (
                  <Link
                    key={item.title}
                    href={item.url}
                    className="block px-2 py-1 hover:bg-muted rounded"
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </SidebarMenu>
  );
}
