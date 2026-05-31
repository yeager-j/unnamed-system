"use client"

import { cn } from "@workspace/ui/lib/utils"

import type { AtlasLineage } from "@/lib/game/archetypes"
import { LINEAGE_DISPLAY } from "@/lib/ui/labels"
import { LINEAGE_ICONS } from "@/lib/ui/lineage-icons"

/**
 * The Atlas's left rail: every Lineage with its unlocked-progress count, the
 * selected one highlighted. Clicking a Lineage swaps the tree. All twelve show
 * — including those with no Archetypes yet — so the full shape of the system is
 * visible as a planning surface.
 */
export function AtlasSidebar({
  lineages,
  selectedLineage,
  onSelect,
}: {
  lineages: AtlasLineage[]
  selectedLineage: string
  onSelect: (lineage: string) => void
}) {
  return (
    <nav aria-label="Lineages" className="flex flex-col gap-1">
      <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Lineages
      </h2>
      {lineages.map((entry) => {
        const selected = entry.lineage === selectedLineage
        const display = LINEAGE_DISPLAY[entry.lineage]
        const Icon = LINEAGE_ICONS[display.icon]
        return (
          <button
            key={entry.lineage}
            type="button"
            onClick={() => onSelect(entry.lineage)}
            aria-current={selected ? "true" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 px-2 py-1.5 text-left text-sm transition-colors",
              "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              selected && "bg-accent font-medium"
            )}
          >
            <span className="flex items-center gap-2">
              <Icon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              {display.label}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {entry.progress.owned}/{entry.progress.total}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
