import { useRouterState } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AccountSwitcher } from "./account-switcher";
import { ThemeToggle } from "./theme-toggle";

function getPageTitle(pathname: string): string {
  switch (pathname) {
    case "/settings":
      return "Settings";
    default:
      return "OGame Agent";
  }
}

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 !h-4 !self-auto" />
        <h1 className="text-base font-medium leading-none">{getPageTitle(pathname)}</h1>
        <div className="ml-auto flex items-center gap-2">
          <AccountSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
