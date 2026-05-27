import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { hasNonNeutralAffinities } from "@/components/archetype/archetype-affinities"
import { ArchetypeAffinityChips } from "@/components/archetype/archetype-affinity-chips"
import { ArchetypeAttributesInline } from "@/components/archetype/archetype-attributes-inline"
import {
  ArchetypeSkillChips,
  ArchetypeSynthesisChip,
} from "@/components/archetype/archetype-skill-chips"
import { ArchetypeTalentChips } from "@/components/archetype/archetype-talents"
import {
  formatMasteryDescription,
  formatTalentLabel,
} from "@/components/archetype/format"
import { DetailSection } from "@/components/shared/detail-section"
import { Prose } from "@/components/shared/prose"
import { hasMasteryBonus, hasUnlockedRank } from "@/lib/game/archetypes/schema"
import type { ArchetypeEntry } from "@/lib/game/archetypes/utils"
import { getMechanic } from "@/lib/game/mechanics"
import { TIER_LABELS } from "@/lib/ui/labels"

// formatTalentLabel re-export retained for any callers still depending on it.
export { formatTalentLabel }

/**
 * The compact card presentation for one Archetype inside the Lineage-grouped
 * list. Surfaces the at-a-glance facts a player skims for — Rank/Tier,
 * simplified Affinities, Attributes, Talents, the Skills unlocked at the
 * current Rank, and the Synthesis Skill when it's at-or-below current Rank.
 * Receives `trigger` so the parent can place a Drawer trigger (or any other
 * affordance) in the card footer without this component knowing about the
 * drawer surface.
 */
export function ArchetypeSummaryRow({
  entry,
  trigger,
}: {
  entry: ArchetypeEntry
  trigger?: React.ReactNode
}) {
  const { archetype, row, isActive } = entry
  const mechanic = archetype.mechanic ? getMechanic(archetype.mechanic) : null
  const unlockedSkills = entry.ranks.filter((ranked) =>
    hasUnlockedRank(row.rank, ranked.rank)
  )
  const synthesisVisible =
    entry.synthesis !== null && hasUnlockedRank(row.rank, entry.synthesis.rank)
  const mastered = hasMasteryBonus(row.rank)

  return (
    <Card selected={isActive}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span>{archetype.name}</span>
          {mechanic ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="outline" className="cursor-help">
                    {mechanic.displayName}
                  </Badge>
                }
              />
              <TooltipContent side="top" className="max-w-sm">
                <Prose inverted className="prose-xs whitespace-normal">
                  {mechanic.description}
                </Prose>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </CardTitle>
        <CardDescription>
          Rank {row.rank}/5 · {TIER_LABELS[archetype.tier]}
        </CardDescription>
        {isActive || mastered ? (
          <CardAction className="flex flex-wrap items-center gap-1.5">
            {isActive ? <Badge>Active</Badge> : null}
            {mastered ? (
              <Badge variant="secondary">
                Mastery: {formatMasteryDescription(archetype.mastery)}
              </Badge>
            ) : null}
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <ArchetypeAttributesInline archetype={archetype} />

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

        {unlockedSkills.length > 0 ? (
          <DetailSection inline title="Skills">
            <ArchetypeSkillChips skills={unlockedSkills} />
          </DetailSection>
        ) : null}

        {synthesisVisible && entry.synthesis ? (
          <DetailSection inline title="Synthesis">
            <ArchetypeSynthesisChip synthesis={entry.synthesis} />
          </DetailSection>
        ) : null}
      </CardContent>

      {trigger ? (
        <CardFooter className="justify-end gap-2">{trigger}</CardFooter>
      ) : null}
    </Card>
  )
}
