"use client"

import {
  MapTrifoldIcon,
  StackIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { stageMapsPath } from "@/lib/paths"

/**
 * The Stage's shared authoring-library shell (UNN-587). Authored Maps and Sets
 * live in the inset; campaign-owned runtime material stays behind the explicit
 * My Campaigns boundary in the footer. Editor routes sit outside this layout so
 * their canvases can remain full-bleed.
 */
export function StageLibraryShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const mapsPath = stageMapsPath()

  return (
    <SidebarProvider
      open
      onOpenChange={() => {}}
      className="min-h-[calc(100svh-3.5rem)] flex-1"
    >
      <Sidebar variant="inset" className="top-14 h-[calc(100svh-3.5rem)]">
        <SidebarHeader className="gap-1 px-4 pt-6 pb-4">
          <Link
            href={mapsPath}
            className="font-display text-3xl font-semibold text-sidebar-foreground"
          >
            Stage
          </Link>
          <p className="text-sm text-sidebar-foreground/70">
            Your campaign-agnostic authoring library.
          </p>
        </SidebarHeader>

        <SidebarContent>
          <nav aria-label="Authoring library">
            <SidebarGroup>
              <SidebarGroupLabel>Authoring</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href={mapsPath} />}
                      isActive={pathname === mapsPath}
                      aria-current={pathname === mapsPath ? "page" : undefined}
                    >
                      <MapTrifoldIcon />
                      <span>Maps</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <StackIcon />
                      <span>Sets</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>Soon</SidebarMenuBadge>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>

        <SidebarSeparator />
        <SidebarFooter className="gap-2 px-4 py-4">
          <p className="text-xs text-sidebar-foreground/65">
            Running material belongs to a campaign.
          </p>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/campaigns" />}>
                <UsersThreeIcon />
                <span>My Campaigns</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger aria-label="Open authoring library" />
          <span className="font-heading text-sm font-medium">Stage</span>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
