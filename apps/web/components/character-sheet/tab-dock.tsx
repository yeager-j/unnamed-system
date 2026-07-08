"use client"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The sheet's context tabs. Combat / Explore / Journal / Inventory /
 * Archetypes is the settled IA (ADR §4 S2, amended in S2b — UNN-558 split the
 * narrative surface into Explore and Journal); an entry joins this list only
 * when its tab ships (S2c–d), so the dock never advertises an empty surface.
 */
export const SHEET_TABS = [
  { key: "combat", label: "Combat" },
  { key: "explore", label: "Explore" },
  { key: "journal", label: "Journal" },
  { key: "inventory", label: "Inventory" },
] as const

export type SheetTabKey = (typeof SHEET_TABS)[number]["key"]

/**
 * The bottom tab dock (design frame `10a`): a full-width bar under both
 * panes, tabs spread evenly and thumb-reachable in a two-handed tablet hold;
 * the active tab carries an indigo top edge + tint. Plain buttons with a
 * `tablist` contract so specs address tabs by role.
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
      className="flex shrink-0 border-t bg-background max-lg:sticky max-lg:bottom-0 max-lg:z-20"
    >
      {SHEET_TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          onClick={() => onSelect(key)}
          className={cn(
            "flex-1 border-t-2 px-4 py-2.5 text-sm font-medium transition-colors",
            active === key
              ? "-mt-px border-primary bg-primary/15 text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
