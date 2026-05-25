import { LockIcon } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"

import { formatTalentLabel } from "@/components/archetype/format"
import { DetailSection } from "@/components/character-sheet/shared/detail-section"
import { getArchetype } from "@/lib/game/archetypes"
import type { TalentKey } from "@/lib/game/talents"

import { ReviewCard } from "./shared"

/**
 * Review summary for Talents — the Origin Archetype's automatic Talents
 * (locked) plus the player's added picks (background-granted training,
 * up to 2). Mirrors the picker's two-tier layout so the player sees the
 * same shape they edited.
 */
export function TalentsSummary({
  shortId,
  originArchetypeKey,
  gainedTalents,
}: {
  shortId: string
  originArchetypeKey: string | null
  gainedTalents: TalentKey[]
}) {
  const archetype = originArchetypeKey ? getArchetype(originArchetypeKey) : null
  const originTalents = archetype?.talents ?? []
  const addedTalents = gainedTalents

  return (
    <ReviewCard
      title="Talents"
      editStepSlug="character-origins"
      shortId={shortId}
    >
      <div className="flex flex-col gap-4">
        {originTalents.length > 0 ? (
          <DetailSection
            title={
              archetype
                ? `From ${archetype.name} (Origin)`
                : "From your Origin Archetype"
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {originTalents.map((talent) => (
                <Badge key={talent} variant="secondary">
                  <LockIcon weight="fill" className="size-3" />
                  {formatTalentLabel(talent)}
                </Badge>
              ))}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection title="Background-granted picks">
          {addedTalents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No additional Talents picked.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {addedTalents.map((talent) => (
                <Badge key={talent} variant="outline">
                  {formatTalentLabel(talent)}
                </Badge>
              ))}
            </div>
          )}
        </DetailSection>
      </div>
    </ReviewCard>
  )
}
