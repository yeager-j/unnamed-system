import { cn } from "@workspace/ui/lib/utils"

import type { AffinityStripCell } from "@/domain/character/view/affinity-strip"
import { AFFINITY_DAMAGE_TYPE_LABELS, AFFINITY_LABELS } from "@/lib/ui/labels"

import { SectionLabel } from "../section-label"

/**
 * The affinity strip atop the Combat tab (design frame `10a`): one bordered
 * cell per resistible damage type — Weak carries the destructive tone, Resist
 * (and the stronger null/repel/drain) the cool tone, Neutral a quiet dash.
 * Display-only — affinities derive from the active Archetype + effects.
 */
export function AffinityStrip({ cells }: { cells: AffinityStripCell[] }) {
  return (
    <section aria-label="Affinities" className="flex flex-col gap-2">
      <SectionLabel>Affinities</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {cells.map((cell) => {
          const weak = cell.affinity === "weak"
          const guarded =
            cell.affinity !== "weak" && cell.affinity !== "neutral"
          return (
            <div
              key={cell.type}
              className={cn(
                "flex aspect-square w-12 flex-col items-center justify-center gap-1 rounded-md border-2 px-1.5 transition-colors duration-300 ease-out",
                weak && "border-destructive/60 bg-destructive/5",
                guarded && "border-teal-400/50 bg-teal-400/5"
              )}
            >
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {AFFINITY_DAMAGE_TYPE_LABELS[cell.type]}
              </span>
              <span
                className={cn(
                  "text-xs font-extrabold",
                  weak && "text-destructive",
                  guarded && "text-teal-300",
                  cell.affinity === "neutral" && "text-muted-foreground"
                )}
              >
                {cell.affinity === "neutral"
                  ? "—"
                  : AFFINITY_LABELS[cell.affinity]}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
