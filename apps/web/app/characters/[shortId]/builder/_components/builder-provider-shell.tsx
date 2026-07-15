"use client"

import { usePathname } from "next/navigation"
import { type ReactNode } from "react"

import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import { AnimusDocumentProvider } from "@/components/animus/animus-context"
import { WriterSidebar } from "@/components/animus/writer-sidebar"
import type { LoadedCharacter } from "@/domain/character/load"
import { EntityWriteProvider } from "@/domain/entity/use-entity-write"

import { BuilderAnimusSidebarHeader } from "./movements/animus/writer-sidebar-header"

/**
 * Mounts the Movement 3 writer's left rail at the builder layout level so
 * the rail and its open document persist across intra-builder navigation
 * (Next 16 doesn't remount layouts on child segment change).
 *
 * `SidebarProvider`'s `open` is locked to `true` on `/animus` and `false`
 * elsewhere — `Sidebar`'s default `collapsible="offcanvas"` slides it
 * fully off-canvas when closed so `SidebarInset` reclaims the full width
 * on Movements 1/2/4. `onOpenChange` is a no-op because desktop collapse
 * is not a player affordance on Movement 3 (the rail IS the navigation);
 * the mobile drawer is a separate `openMobile` channel inside the
 * provider, toggled by `SidebarTrigger` in the writer pane.
 *
 * `AnimusDocumentProvider` wraps the whole subtree so the active
 * document selection survives a back-and-forth to a sibling movement.
 */
export function BuilderProviderShell({
  loaded,
  children,
}: {
  loaded: LoadedCharacter
  children: ReactNode
}) {
  const pathname = usePathname() ?? ""
  const isAnimus = pathname.endsWith("/animus")

  return (
    <AnimusDocumentProvider>
      <EntityWriteProvider loaded={loaded}>
        <SidebarProvider
          open={isAnimus}
          onOpenChange={() => {}}
          className="min-h-[calc(100svh-3.5rem)]"
        >
          {/* The default `fixed inset-y-0 h-svh` positions the sidebar from the
              very top of the viewport, which would slide it under the
              site-wide 56px sticky `<header>`. Push it down by that much so
              the top entry (Backstory) sits below the chrome. The mobile
              `<Sheet>` variant is unaffected — it's its own portal. */}
          <Sidebar
            variant="floating"
            className="top-14 h-[calc(100svh-3.5rem)]"
          >
            {isAnimus ? (
              <WriterSidebar header={<BuilderAnimusSidebarHeader />} />
            ) : null}
          </Sidebar>
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      </EntityWriteProvider>
    </AnimusDocumentProvider>
  )
}
