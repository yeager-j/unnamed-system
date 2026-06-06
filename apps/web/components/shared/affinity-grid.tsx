import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@workspace/game/foundation"
import { cn } from "@workspace/ui/lib/utils"

import { AFFINITY_DAMAGE_TYPE_LABELS, AFFINITY_LABELS } from "@/lib/ui/labels"

/**
 * The read-only Affinity chart (PRD §6.1 / §7.1): all 11 charted damage types
 * with their resolved Affinity spelled out as a word (legible without color),
 * Weak tinted as the value most worth spotting, Neutral as "—". A sparse chart
 * is fine — an absent damage type renders Neutral — so this serves both a
 * character's full chart and a catalog enemy's partial one. Pure render, no
 * re-derivation; shared by the sheet's Affinities card and the combat drawer.
 *
 * `columnsClassName` sets the grid track count: the default fans all 11 across a
 * full-width row at desktop; a narrow surface (the drawer) passes a fixed low
 * count, since Tailwind's responsive prefixes track the *viewport*, not the
 * container.
 */
export function AffinityGrid({
  chart,
  columnsClassName = "grid-cols-4 sm:grid-cols-6 lg:grid-cols-11",
}: {
  chart: Partial<Record<AffinityDamageType, Affinity>>
  columnsClassName?: string
}) {
  return (
    <dl className={cn("grid gap-x-2 gap-y-3 text-center", columnsClassName)}>
      {AFFINITY_DAMAGE_TYPES.map((type) => {
        const affinity = chart[type] ?? "neutral"
        return (
          <div key={type} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">
              {AFFINITY_DAMAGE_TYPE_LABELS[type]}
            </dt>
            <dd>
              {affinity === "neutral" ? (
                <span className="text-muted-foreground" aria-label="Neutral">
                  —
                </span>
              ) : (
                <span
                  className={
                    affinity === "weak"
                      ? "font-medium text-destructive"
                      : "font-medium"
                  }
                >
                  {AFFINITY_LABELS[affinity]}
                </span>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
