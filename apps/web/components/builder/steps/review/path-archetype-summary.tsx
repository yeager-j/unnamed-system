import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"

import { hasNonNeutralAffinities } from "@/components/archetype/archetype-affinities"
import { ArchetypeAffinityChips } from "@/components/archetype/archetype-affinity-chips"
import { ArchetypeAttributesInline } from "@/components/archetype/archetype-attributes-inline"
import {
  ArchetypeSkillChips,
  ArchetypeSynthesisChip,
} from "@/components/archetype/archetype-skill-chips"
import { ArchetypeTalentChips } from "@/components/archetype/archetype-talents"
import { formatMasteryDescription } from "@/components/archetype/format"
import { DetailSection } from "@/components/character-sheet/shared/detail-section"
import { getArchetype } from "@/lib/game/archetypes"
import { previewArchetypeSkills } from "@/lib/game/archetypes/preview"
import type { PathChoice } from "@/lib/game/character"
import { getPathStats } from "@/lib/game/stats"
import {
  LINEAGE_LABELS,
  PATH_CHOICE_LABELS,
  TIER_LABELS,
} from "@/lib/ui/labels"

import { ReviewCard } from "./shared"

/**
 * Review hero block — HP/SP path + Origin Archetype. These are the two
 * irreversible choices the player is making, so they sit at the top of the
 * Review screen with the most ink and a prominent stat readout. Reuses the
 * same archetype atom components as the picker card so the visual reads as
 * "this is the card you selected."
 */
export function PathArchetypeSummary({
  shortId,
  pathChoice,
  originArchetypeKey,
}: {
  shortId: string
  pathChoice: PathChoice
  originArchetypeKey: string | null
}) {
  const archetype = originArchetypeKey ? getArchetype(originArchetypeKey) : null
  const pathStats = getPathStats(pathChoice)
  const preview = archetype
    ? previewArchetypeSkills(archetype, pathChoice)
    : null

  return (
    <ReviewCard
      title="Path & Origin"
      description="These two choices are locked in after you finalize — take a moment to make sure they're right."
      editStepSlug="path-and-archetype"
      shortId={shortId}
    >
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            HP / SP Path
          </h3>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-base font-semibold">
              {PATH_CHOICE_LABELS[pathChoice]}
            </p>
            <p className="text-sm text-muted-foreground">
              Starting{" "}
              <span className="font-medium text-foreground tabular-nums">
                {pathStats.startHP} HP
              </span>{" "}
              ·{" "}
              <span className="font-medium text-foreground tabular-nums">
                {pathStats.startSP} SP
              </span>{" "}
              · +{pathStats.hpPerLevel} HP / +{pathStats.spPerLevel} SP per
              level
            </p>
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Origin Archetype
            </h3>
          </div>

          {archetype && preview ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="font-heading text-lg leading-tight font-semibold">
                  {archetype.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {LINEAGE_LABELS[archetype.lineage]} ·{" "}
                  {TIER_LABELS[archetype.tier]}
                </p>
              </div>

              <ArchetypeAttributesInline archetype={archetype} />

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Mastery
                </span>
                <Badge variant="secondary">
                  {formatMasteryDescription(archetype.mastery)}
                </Badge>
              </div>

              {hasNonNeutralAffinities(archetype) ? (
                <DetailSection inline title="Affinities">
                  <ArchetypeAffinityChips archetype={archetype} />
                </DetailSection>
              ) : null}

              {archetype.talents.length > 0 ? (
                <DetailSection inline title="Talents">
                  <ArchetypeTalentChips archetype={archetype} />
                </DetailSection>
              ) : null}

              {preview.ranks.length > 0 ? (
                <DetailSection inline title="Skills">
                  <ArchetypeSkillChips skills={preview.ranks} />
                </DetailSection>
              ) : null}

              {preview.synthesis ? (
                <DetailSection inline title="Synthesis">
                  <ArchetypeSynthesisChip synthesis={preview.synthesis} />
                </DetailSection>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-destructive">
              No Origin Archetype picked yet.
            </p>
          )}
        </section>
      </div>
    </ReviewCard>
  )
}
