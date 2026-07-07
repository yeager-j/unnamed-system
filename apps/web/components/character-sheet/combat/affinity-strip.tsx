import { cn } from "@workspace/ui/lib/utils"

import type { AffinityStripCell } from "@/lib/character/view/affinity-strip"
import { AFFINITY_DAMAGE_TYPE_LABELS, AFFINITY_LABELS } from "@/lib/ui/labels"

/**
 * The affinity strip atop the Combat tab (design handoff): 11 damage-type
 * cells, Weak tinted destructive, Resist (and the stronger null/repel/drain)
 * cool, Neutral a quiet dash. Display-only — affinities derive from the
 * active Archetype + effects.
 */
export function AffinityStrip({ cells }: { cells: AffinityStripCell[] }) {
  return (
    <section
      aria-label="Affinities"
      className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-6 lg:grid-cols-11"
    >
      {cells.map((cell) => (
        <div
          key={cell.type}
          className={cn(
            "flex flex-col items-center gap-0.5 bg-card px-1 py-1.5",
            cell.affinity === "weak" && "bg-destructive/15",
            (cell.affinity === "resist" ||
              cell.affinity === "null" ||
              cell.affinity === "repel" ||
              cell.affinity === "drain") &&
              "bg-sp/15"
          )}
        >
          <span className="text-[10px] text-muted-foreground uppercase">
            {AFFINITY_DAMAGE_TYPE_LABELS[cell.type]}
          </span>
          <span
            className={cn(
              "text-[11px] font-semibold",
              cell.affinity === "weak" && "text-destructive",
              cell.affinity !== "weak" &&
                cell.affinity !== "neutral" &&
                "text-sp"
            )}
          >
            {cell.affinity === "neutral" ? "—" : AFFINITY_LABELS[cell.affinity]}
          </span>
        </div>
      ))}
    </section>
  )
}
