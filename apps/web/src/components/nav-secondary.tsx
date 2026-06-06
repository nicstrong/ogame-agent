import { Link, useRouterState } from "@tanstack/react-router";
import { type LucideIcon, SettingsIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";

const navSecondary: Array<{ title: string; url: string; icon: LucideIcon }> = [
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

export function NavSecondary() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupContent>
        <SidebarMenu>
          {navSecondary.map((item) => (
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
