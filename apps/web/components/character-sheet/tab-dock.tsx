"use client"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The sheet's context tabs. Combat / Explore / Inventory / Archetypes is the
 * settled IA (ADR §4 S2); an entry joins this list only when its tab ships
 * (S2b–d), so the dock never advertises an empty surface.
 */
export const SHEET_TABS = [{ key: "combat", label: "Combat" }] as const

export type SheetTabKey = (typeof SHEET_TABS)[number]["key"]

/**
 * The bottom tab dock (design handoff "Layout"): the four context tabs live
 * under the content column, thumb-reachable in a two-handed tablet hold. Plain
 * buttons with a `tablist` contract so specs address tabs by role.
 */
export function SheetDock({
  active,
  onSelect,
}: {
  active: SheetTabKey
  onSelect: (tab: SheetTabKey) => void
}) {
  return (
    <nav
      role="tablist"
      aria-label="Sheet sections"
      className="sticky bottom-0 z-10 flex justify-center gap-1 rounded-lg border bg-card/95 p-1 backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      {SHEET_TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          onClick={() => onSelect(key)}
          className={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:max-w-40",
            active === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
