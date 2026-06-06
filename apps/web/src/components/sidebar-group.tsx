import { Link, useRouterState } from "@tanstack/react-router";
import { LucideIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

export type SidebarNavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

type SidebarNavGroupProps = {
  title: string;
  items: ReadonlyArray<SidebarNavItem>;
};

export function SidebarNavGroup({ title, items }: SidebarNavGroupProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
