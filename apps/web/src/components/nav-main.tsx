import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "./ui/sidebar";
import { ImportDialog } from "./import-dialog";

export function NavMain() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Actions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <ImportDialog />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
