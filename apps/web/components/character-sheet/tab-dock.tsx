"use client"

import {
  BackpackIcon,
  CompassIcon,
  NotebookIcon,
  StarFourIcon,
  SwordIcon,
  type Icon,
} from "@phosphor-icons/react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The sheet's context tabs. Combat / Explore / Journal / Inventory /
 * Archetypes is the settled IA (ADR §4 S2, amended in S2b — UNN-558 split the
 * narrative surface into Explore and Journal); an entry joins this list only
 * when its tab ships (S2c–d), so the dock never advertises an empty surface.
 * Each carries an `icon` — the dock shows icon-only where it's the bottom bar
 * (below `lg`, five text labels overflow), full labels in the desktop split.
 */
export const SHEET_TABS = [
  { key: "combat", label: "Combat", icon: SwordIcon },
  { key: "explore", label: "Explore", icon: CompassIcon },
  { key: "journal", label: "Journal", icon: NotebookIcon },
  { key: "inventory", label: "Inventory", icon: BackpackIcon },
  { key: "archetypes", label: "Archetypes", icon: StarFourIcon },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: Icon }>

export type SheetTabKey = (typeof SHEET_TABS)[number]["key"]

/**
 * The bottom tab dock (design frame `10a`): a full-width bar under both
 * panes, tabs spread evenly and thumb-reachable in a two-handed tablet hold;
 * the active tab carries an indigo top edge + tint. Below `lg` (the bottom-bar
 * layout) each tab is its icon alone — `aria-label` keeps the name for a11y +
 * specs; the split-view dock shows the text label. Plain buttons with a
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
      {SHEET_TABS.map(({ key, label, icon: TabIcon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          aria-label={label}
          onClick={() => onSelect(key)}
          className={cn(
            "flex-1 border-t-2 px-4 py-2.5 text-sm font-medium transition-colors",
            active === key
              ? "-mt-px border-primary bg-primary/15 text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <TabIcon
            aria-hidden
            weight={active === key ? "fill" : "regular"}
            className="mx-auto size-5 lg:hidden"
          />
          <span className="max-lg:hidden">{label}</span>
        </button>
      ))}
    </nav>
  )
}
