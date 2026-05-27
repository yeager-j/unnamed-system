import { Badge } from "@workspace/ui/components/badge"

import type { Archetype } from "@/lib/game/archetypes/schema"
import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@/lib/game/combat/affinity"
import { AFFINITY_DAMAGE_TYPE_LABELS, AFFINITY_LABELS } from "@/lib/ui/labels"

/**
 * The single Affinity chip used by both the compact summary row and the
 * full-block chart. Surfaced on its own so the two contexts share one chip
 * style instead of redeclaring the Badge JSX in two places.
 */
export function ArchetypeAffinityChip({
  type,
  affinity,
}: {
  type: AffinityDamageType
  affinity: Exclude<Affinity, "neutral">
}) {
  return (
    <Badge
      variant="outline"
      className={
        affinity === "weak" ? "border-destructive/30 text-destructive" : ""
      }
    >
      {AFFINITY_DAMAGE_TYPE_LABELS[type]} {AFFINITY_LABELS[affinity]}
    </Badge>
  )
}

/**
 * Compact horizontal list of non-Neutral Affinity chips for an Archetype.
 * Renders nothing when the Archetype's chart is fully Neutral — the caller
 * (a section header it would sit under) decides whether to omit the section
 * entirely or show its own fallback.
 */
export function ArchetypeAffinityChips({
  archetype,
}: {
  archetype: Archetype
}) {
  const chips = AFFINITY_DAMAGE_TYPES.flatMap((type) => {
    const affinity = archetype.affinities[type]
    if (!affinity || affinity === "neutral") return []
    return [{ type, affinity }]
  })
  if (chips.length === 0) return null
  return (
    <>
      {chips.map(({ type, affinity }) => (
        <ArchetypeAffinityChip key={type} type={type} affinity={affinity} />
      ))}
    </>
  )
}
