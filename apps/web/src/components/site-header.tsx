import { useRouterState } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AccountSwitcher } from "./account-switcher";
import { PlanetSwitcher } from "./planet-switcher";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 !h-4 !self-auto" />
        {isHome ? (
          <PlanetSwitcher />
        ) : (
          <h1 className="text-base leading-none font-medium">Settings</h1>
        )}
        <div className="ml-auto flex items-center gap-2">
          <AccountSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
