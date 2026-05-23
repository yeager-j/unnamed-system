"use client"

import { useEffect } from "react"

import type { SheetTabKey } from "@/components/character-sheet/sheet-tab-keys"

/**
 * Mirrors the active sheet tab in the URL's `?tab=` query whenever it
 * changes. Uses `history.replaceState` instead of the Next router so a tab
 * switch doesn't re-render the route (which would tear down all tab state);
 * the URL is purely cosmetic so the view stays shareable.
 */
export function useTabUrlSync(tab: SheetTabKey): void {
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?tab=${tab}`
    )
  }, [tab])
}
