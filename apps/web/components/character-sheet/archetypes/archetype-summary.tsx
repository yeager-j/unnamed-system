"use client"

import { useEffect, useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"
import { Item } from "@workspace/ui/components/item"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { AFFINITY_DAMAGE_TYPES } from "@/lib/game/affinity"
import {
  ATTRIBUTE_KEYS,
  hasMasteryBonus,
  hasUnlockedRank,
} from "@/lib/game/archetypes/schema"
import { getMechanic } from "@/lib/game/mechanics"
import { Prose } from "../prose"
import { DetailSection } from "./detail-section"
import {
  AFFINITY_LABELS,
  ATTRIBUTE_FULL_LABELS,
  DAMAGE_TYPE_LABELS,
  formatMasteryDescription,
  formatModifier,
  formatTalentLabel,
} from "./format"
import { LINEAGE_LABELS, TIER_LABELS } from "./lineage-labels"
import type { ArchetypeEntry } from "@/lib/game/archetypes/entries"

/**
 * One Archetype's compact row in the Lineage-grouped list. Built on the
 * shadcn {@link Item} primitive so each entry is one bordered row inside an
 * {@link ItemGroup}, denser than a per-card layout. Surfaces the at-a-glance
 * facts a player skims for — Rank/Tier, simplified Affinities, Attributes,
 * Talents, and the Skills unlocked at the current Rank (plus the Synthesis
 * Skill when it's at-or-below current Rank) — then defers everything else
 * (Inheritance Slots, the mechanic prose) to the {@link Drawer} that the
 * `Show details` button opens.
 *
 * Used for *every* unlocked Archetype; the active one carries an `Active`
 * badge so the Lineage grid stays coherent while the featured Active card
 * above provides the spotlight view.
 */
export function ArchetypeSummary({
  entry,
  detail,
}: {
  entry: ArchetypeEntry
  detail: React.ReactNode
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

  const drawerDirection = useDrawerDirection()

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
          <Drawer direction={drawerDirection}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="sm">
                Show details
              </Button>
            </DrawerTrigger>
            <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-xl">
              <DrawerHeader>
                <DrawerTitle className="flex items-baseline gap-2">
                  <span>{archetype.name}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    Rank {row.rank}/5
                  </span>
                </DrawerTitle>
                <DrawerDescription>
                  {LINEAGE_LABELS[archetype.lineage]} ·{" "}
                  {TIER_LABELS[archetype.tier]}
                  {isActive ? " · Active" : null}
                </DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-8">{detail}</div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      <DetailSection inline title="Attributes">
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {ATTRIBUTE_KEYS.map((key) => (
            <div key={key} className="flex items-baseline gap-1">
              <dt className="text-muted-foreground">
                {ATTRIBUTE_FULL_LABELS[key]}
              </dt>
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
              {DAMAGE_TYPE_LABELS[type]} {AFFINITY_LABELS[affinity]}
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

/**
 * Picks the Drawer side based on viewport width. On mobile a bottom sheet has
 * native ergonomics (swipe-to-dismiss, full-width readable); on desktop a
 * bottom sheet eats the whole screen so we slide in from the right (Vaul's
 * right-side direction caps at `sm:max-w-sm`, ~384px). SSR defaults to the
 * mobile choice since the Drawer is closed at first render — by the time a
 * user opens it the post-hydration effect has set the desktop direction.
 */
function useDrawerDirection(): "bottom" | "right" {
  const [direction, setDirection] = useState<"bottom" | "right">("bottom")
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    const update = () => setDirection(mql.matches ? "right" : "bottom")
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])
  return direction
}
