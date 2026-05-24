import { Badge } from "@workspace/ui/components/badge"

import type { Archetype } from "@/lib/game/archetypes/schema"

import { DetailSection } from "../character-sheet/shared/detail-section"
import { formatTalentLabel } from "./format"

/**
 * Section-block list of Talents an Archetype grants. Used in the full detail
 * surface (live sheet, builder drawer). Returns `null` when the Archetype
 * grants no Talents so the section vanishes cleanly.
 */
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

/**
 * Compact-row chip variant of {@link ArchetypeTalents}: just the badges,
 * no section frame. Surfaced for callers (compact summary row, builder
 * Origin card) that compose their own section frame.
 */
export function ArchetypeTalentChips({ archetype }: { archetype: Archetype }) {
  if (archetype.talents.length === 0) return null
  return (
    <>
      {archetype.talents.map((talent) => (
        <Badge key={talent} variant="secondary">
          {formatTalentLabel(talent)}
        </Badge>
      ))}
    </>
  )
}
