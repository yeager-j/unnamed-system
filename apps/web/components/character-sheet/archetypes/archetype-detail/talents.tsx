import { Badge } from "@workspace/ui/components/badge"

import type { Archetype } from "@/lib/game/archetypes/schema"

import { DetailSection } from "../detail-section"
import { formatTalentLabel } from "../format"

export function ArchetypeTalents({ archetype }: { archetype: Archetype }) {
  if (archetype.talents.length === 0) return null
  return (
    <DetailSection title="Talents">
      <div className="flex flex-wrap gap-1.5">
        {archetype.talents.map((talent) => (
          <Badge key={talent} variant="secondary">
            {formatTalentLabel(talent)}
          </Badge>
        ))}
      </div>
    </DetailSection>
  )
}
