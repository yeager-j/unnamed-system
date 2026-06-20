"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { createPortal } from "react-dom"

import { Sidebar, SidebarProvider } from "@workspace/ui/components/sidebar"

/** The run console's three mutually-exclusive phases over the same Map Instance. */
export type DungeonConsolePhase = "play" | "setup" | "combat"

const DungeonSidebarSlotContext = createContext<HTMLElement | null>(null)

/**
 * Portals its children into the persistent {@link DungeonConsoleShell} sidebar
 * slot. Each phase body still owns its optimistic hook and renders its sidebar
 * header + content through this, landing them in the DOM inside the shell's single
 * `<Sidebar>` (so `group-data-[collapsible=icon]:*` selectors resolve) while
 * keeping them in the React tree at the body's call site (so `useSidebar()`
 * resolves to the shell's provider). Renders nothing until the slot mounts — the
 * slot lives in the persistent shell, so it resolves once and stays non-null
 * across the phase fork (no empty-sidebar flash).
 */
export function DungeonSidebarSlot({
  children,
}: {
  children: React.ReactNode
}) {
  const slot = useContext(DungeonSidebarSlotContext)
  return slot ? createPortal(children, slot) : null
}

/**
 * The persistent shell above the run console's phase fork (UNN-488). It owns the
 * **single** `SidebarProvider` + `<Sidebar>` that all three phases share, so the
 * width-bearing element stays mounted across Play/Setup ↔ Combat — letting the
 * `--sidebar-width` 16rem ↔ 22rem change ease (shadcn's `transition-[width]`)
 * instead of snapping on a remount. The active phase body is rendered as
 * `children` and {@link DungeonSidebarSlot}-portals its own sidebar contents in.
 *
 * `collapsible` is `icon` in Play (the avatar rail) and `offcanvas` in Setup/Combat
 * — never `none`, whose branch renders a transition-less div. When the sidebar is
 * open the width is purely `--sidebar-width` regardless, so `collapsible` only
 * changes the collapse affordance, never the animated width.
 */
export function DungeonConsoleShell({
  phase,
  children,
}: {
  phase: DungeonConsolePhase
  children: React.ReactNode
}) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const slotRef = useCallback(
    (node: HTMLDivElement | null) => setSlot(node),
    []
  )

  // The persistent provider carries collapse across the fork, so a DM who
  // collapsed during Play would otherwise enter an offcanvas phase with the rail
  // fully hidden. Reset to open whenever we enter a non-Play phase — the render-
  // phase "reset state on prop change" pattern, so there's no frame where the rail
  // is hidden (an effect would commit the collapsed state first).
  const [open, setOpen] = useState(true)
  const [lastPhase, setLastPhase] = useState(phase)
  if (phase !== lastPhase) {
    setLastPhase(phase)
    if (phase !== "play") setOpen(true)
  }

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      style={
        {
          "--sidebar-width": phase === "combat" ? "22rem" : "16rem",
        } as React.CSSProperties
      }
      className="[&_[data-slot=sidebar-container]]:duration-500 [&_[data-slot=sidebar-container]]:ease-in-out [&_[data-slot=sidebar-gap]]:duration-500 [&_[data-slot=sidebar-gap]]:ease-in-out"
    >
      <Sidebar
        variant="inset"
        collapsible={phase === "play" ? "icon" : "offcanvas"}
      >
        <div ref={slotRef} className="flex min-h-0 w-full flex-1 flex-col" />
      </Sidebar>

      <DungeonSidebarSlotContext.Provider value={slot}>
        {children}
      </DungeonSidebarSlotContext.Provider>
    </SidebarProvider>
  )
}
