import { Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { HistorySheet } from "@/components/history-sheet";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AccountsProvider } from "@/lib/accounts-context";

export default function App() {
  return (
    <AccountsProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            <main className="flex min-h-0 flex-1 flex-col">
              <Outlet />
            </main>
          </div>
        </SidebarInset>
        <HistorySheet />
      </SidebarProvider>
    </AccountsProvider>
  );
}
