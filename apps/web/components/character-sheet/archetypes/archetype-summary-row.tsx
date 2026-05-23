import { Badge } from "@workspace/ui/components/badge"
import { Item } from "@workspace/ui/components/item"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { AFFINITY_DAMAGE_TYPES } from "@/lib/game/affinity"
import type { ArchetypeEntry } from "@/lib/game/archetypes/entries"
import {
  ATTRIBUTE_KEYS,
  hasMasteryBonus,
  hasUnlockedRank,
} from "@/lib/game/archetypes/schema"
import { getMechanic } from "@/lib/game/mechanics"
import {
  AFFINITY_DAMAGE_TYPE_LABELS,
  AFFINITY_LABELS,
  ATTRIBUTE_LABELS,
} from "@/lib/ui/labels"

import { Prose } from "../prose"
import { DetailSection } from "./detail-section"
import {
  formatMasteryDescription,
  formatModifier,
  formatTalentLabel,
} from "./format"
import { TIER_LABELS } from "./lineage-labels"

/**
 * The compact row presentation for one Archetype inside the Lineage-grouped
 * list. Surfaces the at-a-glance facts a player skims for — Rank/Tier,
 * simplified Affinities, Attributes, Talents, and the Skills unlocked at the
 * current Rank (plus the Synthesis Skill when it's at-or-below current Rank).
 * Receives `trigger` as the right-aligned slot so the parent can place a
 * Drawer trigger (or any other affordance) without this component knowing
 * about the drawer surface.
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
  const affinityChips = AFFINITY_DAMAGE_TYPES.flatMap((type) => {
    const affinity = archetype.affinities[type]
    if (!affinity || affinity === "neutral") return []
    return [{ type, affinity }]
  })

  return (
    <Item variant="outline" className="flex-col items-stretch gap-2 p-4">
      <div className="flex w-full flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{archetype.name}</span>
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
          <span className="text-xs text-muted-foreground">
            Rank {row.rank}/5 · {TIER_LABELS[archetype.tier]}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isActive ? <Badge>Active</Badge> : null}
          {hasMasteryBonus(row.rank) ? (
            <Badge variant="secondary">
              Mastery: {formatMasteryDescription(archetype.mastery)}
            </Badge>
          ) : null}
          {trigger}
        </div>
      </div>

      <DetailSection inline title="Attributes">
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {ATTRIBUTE_KEYS.map((key) => (
            <div key={key} className="flex items-baseline gap-1">
              <dt className="text-muted-foreground">{ATTRIBUTE_LABELS[key]}</dt>
              <dd className="font-medium tabular-nums">
                {formatModifier(archetype.attributes[key])}
              </dd>
            </div>
          ))}
        </dl>
      </DetailSection>

      {affinityChips.length > 0 ? (
        <DetailSection inline title="Affinities">
          {affinityChips.map(({ type, affinity }) => (
            <Badge
              key={type}
              variant="outline"
              className={
                affinity === "weak"
                  ? "border-destructive/30 text-destructive"
                  : ""
              }
            >
              {AFFINITY_DAMAGE_TYPE_LABELS[type]} {AFFINITY_LABELS[affinity]}
            </Badge>
          ))}
        </DetailSection>
      ) : null}

      {archetype.talents.length > 0 ? (
        <DetailSection inline title="Talents">
          {archetype.talents.map((talent) => (
            <Badge key={talent} variant="secondary">
              {formatTalentLabel(talent)}
            </Badge>
          ))}
        </DetailSection>
      ) : null}

      {unlockedSkills.length > 0 || synthesisVisible ? (
        <DetailSection inline title="Skills">
          {unlockedSkills.map((ranked) => (
            <Badge key={ranked.key} variant="outline">
              {ranked.name}
            </Badge>
          ))}
          {synthesisVisible && entry.synthesis ? (
            <Badge variant="outline" className="border-primary">
              Synthesis: {entry.synthesis.name}
            </Badge>
          ) : null}
        </DetailSection>
      ) : null}
    </Item>
  )
}
