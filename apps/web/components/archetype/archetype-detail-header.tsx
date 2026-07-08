import type { ElementType, ReactNode } from "react"

import {
  MASTERY_RANK,
  type Archetype,
} from "@workspace/game-v2/archetypes/archetype"
import { cn } from "@workspace/ui/lib/utils"

import { OriginLineageIndicator } from "@/components/shared/origin-lineage-indicator"
import { LINEAGE_LABELS, TIER_LABELS, TIER_ROMAN_LABELS } from "@/lib/ui/labels"

/**
 * The shared detail header for an Archetype — name, then a
 * `{Lineage} · {Tier}` line (Tier as roman + label, e.g. `I Initiate`),
 * with the Rank appended only when given. Every surface that opens a full
 * Archetype view renders this so the title typography and Tier formatting
 * can't drift: the Lineage Atlas detail panel, the Archetypes-tab "Show
 * details" drawer, and the Active Archetype card.
 *
 * Presentational only — it never reaches into `character-sheet/` or
 * `builder/`. The `titleAs` / `subtitleAs` slots let each surface supply its
 * own accessibility wrapper (a dialog's Title/Description, a Card's Title) so
 * the kit stays decoupled from those frameworks while the heading semantics
 * stay correct.
 */
export function ArchetypeDetailHeader({
  archetype,
  rank,
  origin,
  titleAs: Title = "h2",
  subtitleAs: Subtitle = "p",
  trailing,
  className,
}: {
  archetype: Pick<Archetype, "name" | "tier" | "lineage">
  /** Appends `· Rank n/5`. Omit for planning views (the Atlas) that don't pin a Rank. */
  rank?: number
  origin?: boolean
  /** Element the name renders as — pass the surface's title wrapper for a11y. Defaults to `h2`. */
  titleAs?: ElementType
  /** Element the `{Lineage} · {Tier}` line renders as — pass the surface's description wrapper. Defaults to `p`. */
  subtitleAs?: ElementType
  /** Top-right slot for status badges (Locked / Active / Mastery). */
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      {origin && <OriginLineageIndicator />}
      <div className="flex items-center gap-3">
        <Title className="font-display text-2xl font-semibold">
          {archetype.name}
        </Title>
        {trailing}
      </div>
      <Subtitle className="mt-1 text-sm text-muted-foreground">
        {LINEAGE_LABELS[archetype.lineage]} ·{" "}
        <span>Tier {TIER_ROMAN_LABELS[archetype.tier]}</span> (
        {TIER_LABELS[archetype.tier]})
        {rank != null ? ` · Rank ${rank}/${MASTERY_RANK}` : null}
      </Subtitle>
    </div>
  )
}
