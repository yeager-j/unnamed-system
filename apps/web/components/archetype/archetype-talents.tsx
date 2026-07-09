import { Badge } from "@workspace/ui/components/badge"

import { DetailSection } from "@/components/shared/detail-section"

import { formatTalentLabel } from "./format"

/**
 * Section-block list of Talents an Archetype grants. Used in the full detail
 * surface (live sheet, builder drawer). Returns `null` when the Archetype
 * grants no Talents so the section vanishes cleanly.
 */
/** The structural slice these widgets read — both engines' catalog Archetypes
 *  satisfy it (v1 narrows talents to `TalentKey[]`, v2 keeps open strings). */
interface TalentsSlice {
  talents: readonly string[]
}

export function ArchetypeTalents({ archetype }: { archetype: TalentsSlice }) {
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
