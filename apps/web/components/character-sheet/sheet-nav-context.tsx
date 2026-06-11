"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import { useTabUrlSync } from "@/hooks/use-tab-url-sync"

import { type SheetTabKey } from "./sheet-tab-keys"

/**
 * Lifts the active-sheet-tab state out of {@link SheetTabs} so both the tab
 * strip and the command palette can drive it (Command Palette ADR, Decision 6).
 * The four tabs are in-memory client state — not routing — so a navigation
 * command can't `router.push(?tab=)` to switch them; it calls
 * {@link SheetNavContextValue.setActiveTab} here instead. The URL is still
 * mirrored cosmetically via {@link useTabUrlSync} so a view stays shareable.
 */
interface SheetNavContextValue {
  activeTab: SheetTabKey
  setActiveTab: (tab: SheetTabKey) => void
}

const SheetNavContext = createContext<SheetNavContextValue | null>(null)

export function SheetNavProvider({
  defaultTab,
  children,
}: {
  defaultTab: SheetTabKey
  children: ReactNode
}) {
  const [activeTab, setActiveTab] = useState<SheetTabKey>(defaultTab)
  useTabUrlSync(activeTab)

  return (
    <SheetNavContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </SheetNavContext.Provider>
  )
}

/**
 * Reads the active tab and its setter. Throws outside a {@link SheetNavProvider}
 * so a forgotten wrapper fails loudly (same idiom as `useCharacter`).
 */
export function useSheetNav(): SheetNavContextValue {
  const value = useOptionalSheetNav()
  if (!value) {
    throw new Error("useSheetNav must be used within a SheetNavProvider")
  }
  return value
}

/**
 * Like {@link useSheetNav}, but returns `null` outside a provider. For sheet
 * components that are reused on surfaces without tab navigation (the encounter
 * watch view renders `SheetHeader` bare), where a tab-switching affordance
 * should disappear rather than crash (UNN-385).
 */
export function useOptionalSheetNav(): SheetNavContextValue | null {
  return useContext(SheetNavContext)
}
