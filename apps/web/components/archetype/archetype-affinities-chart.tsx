import {
  AFFINITY_DAMAGE_TYPES,
  type Archetype,
} from "@workspace/game/foundation"

import { DetailSection } from "@/components/shared/detail-section"

import { ArchetypeAffinityChip } from "./archetype-affinity-chips"

/**
 * The full Affinity block: a chip for every non-Neutral Affinity in the
 * Archetype's chart plus the "Other damage types Neutral" reminder. Shared by
 * the live-sheet Archetype detail and the builder's Origin preview drawer.
 */
export function ArchetypeAffinitiesChart({
  archetype,
}: {
  archetype: Archetype
}) {
  const chips = AFFINITY_DAMAGE_TYPES.flatMap((type) => {
    const affinity = archetype.affinities[type]
    if (!affinity || affinity === "neutral") return []
    return [{ type, affinity }]
  })

  return (
    <DetailSection title="Affinities">
      {chips.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          All damage types Neutral.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(({ type, affinity }) => (
            <ArchetypeAffinityChip key={type} type={type} affinity={affinity} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Other damage types Neutral.
      </p>
    </DetailSection>
  )
}
