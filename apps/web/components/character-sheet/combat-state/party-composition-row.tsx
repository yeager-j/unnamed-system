import type { Lineage } from "@/lib/game/archetypes/schema"
import type { PartyComposition } from "@/lib/game/character"

import { LINEAGE_LABELS } from "../archetypes/lineage-labels"

/**
 * Read-only display of the allied Lineage counts present in the current
 * combat encounter — read by the `perPartyLineage` Attack Roll scaler (Magic
 * Circle, Ailment Boost). One row per Lineage with a non-zero count; an
 * em-dash when the map is empty or null.
 *
 * Scaffolding: this whole sub-block is temporary. Remove once the party
 * editor / initiative tracker lands and owns the authoritative composition;
 * the field's data shape does not need to change.
 */
export function PartyCompositionRow({
  composition,
}: {
  composition: PartyComposition | null
}) {
  // TODO(UNN-192): remove this read-only block when the party editor /
  // initiative tracker lands.
  const entries = Object.entries(composition ?? {})
    .filter(([, count]) => typeof count === "number" && count > 0)
    .sort(([a], [b]) => a.localeCompare(b)) as [Lineage, number][]
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Party
      </p>
      {entries.length === 0 ? (
        <p
          aria-label="No party composition"
          className="text-sm text-muted-foreground"
        >
          —
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {entries.map(([lineage, count]) => (
            <li
              key={lineage}
              className="flex items-baseline justify-between gap-2"
            >
              <span>{LINEAGE_LABELS[lineage]}</span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
