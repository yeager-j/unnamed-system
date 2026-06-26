"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import type { RestMode } from "./rest-dialog"

/**
 * Lifts the open-state of the two genuinely multi-step owner dialogs — Rest
 * (UNN-156) and Level-up (UNN-157) — out of {@link HeaderOwnerActions} so the
 * sibling command palette can open them too (UNN-281). Same precedent as
 * {@link SheetNavProvider} (Command Palette ADR, Decision 6: state "lifted… so
 * both the tab strip and the command palette can drive it").
 *
 * The palette's other UNN-281 actions (Spark, Award Victory, Switch Archetype)
 * live entirely inside the palette as submenus and need nothing here — only the
 * two dialogs, which can't reasonably be inlined, route through this context.
 */

/** The dialog openers a command's `run` calls via {@link CommandContext.surfaces}. */
export interface SheetCommandSurfaces {
  openRest: (mode: RestMode) => void
  openLevelUp: () => void
}

interface SheetCommandSurfacesContextValue extends SheetCommandSurfaces {
  rest: { open: boolean; mode: RestMode }
  setRestOpen: (open: boolean) => void
  levelUp: { open: boolean }
  setLevelUpOpen: (open: boolean) => void
}

const SheetCommandSurfacesContext =
  createContext<SheetCommandSurfacesContextValue | null>(null)

export function SheetCommandSurfacesProvider({
  children,
}: {
  children: ReactNode
}) {
  const [rest, setRest] = useState<{ open: boolean; mode: RestMode }>({
    open: false,
    mode: "full",
  })
  const [levelUpOpen, setLevelUpOpen] = useState(false)

  const value: SheetCommandSurfacesContextValue = {
    rest,
    setRestOpen: (open) => setRest((previous) => ({ ...previous, open })),
    openRest: (mode) => setRest({ open: true, mode }),
    levelUp: { open: levelUpOpen },
    setLevelUpOpen,
    openLevelUp: () => setLevelUpOpen(true),
  }

  return (
    <SheetCommandSurfacesContext.Provider value={value}>
      {children}
    </SheetCommandSurfacesContext.Provider>
  )
}

/**
 * Reads the dialog open-state + openers. Throws outside a
 * {@link SheetCommandSurfacesProvider} (same idiom as `useSheetNav`).
 */
export function useSheetCommandSurfaces(): SheetCommandSurfacesContextValue {
  const value = useOptionalSheetCommandSurfaces()
  if (!value) {
    throw new Error(
      "useSheetCommandSurfaces must be used within a SheetCommandSurfacesProvider"
    )
  }
  return value
}

/**
 * Like {@link useSheetCommandSurfaces}, but returns `null` outside a provider.
 * For the header components reused on surfaces without the provider (the
 * encounter watch view renders an owner's `SheetHeader` bare), where the
 * dialogs fall back to local open-state rather than crashing — mirroring
 * {@link useOptionalSheetNav}.
 */
export function useOptionalSheetCommandSurfaces(): SheetCommandSurfacesContextValue | null {
  return useContext(SheetCommandSurfacesContext)
}
