import { Badge } from "@workspace/ui/components/badge"

import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@/lib/game/affinity"
import type { Archetype } from "@/lib/game/archetypes/schema"
import { AFFINITY_DAMAGE_TYPE_LABELS, AFFINITY_LABELS } from "@/lib/ui/labels"

import { DetailSection } from "../detail-section"

export function ArchetypeAffinities({ archetype }: { archetype: Archetype }) {
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
            <AffinityChip key={type} type={type} affinity={affinity} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Other damage types Neutral.
      </p>
    </DetailSection>
  )
}

function AffinityChip({
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
