"use client"

import Link from "next/link"

import { hasMasteryBonus } from "@workspace/game-v2/archetypes/archetype"
import type { ArchetypeEntry } from "@workspace/game-v2/archetypes/display"
import { hasUnlockedRank } from "@workspace/game-v2/archetypes/rank"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ItemGroup } from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"

import { ArchetypeDetailHeader } from "@/components/archetype/archetype-detail-header"
import { ArchetypeResolvedSkills } from "@/components/archetype/archetype-resolved-skills"
import { ArchetypeTalents } from "@/components/archetype/archetype-talents"
import { formatMasteryDescription } from "@/components/archetype/format"
import { DetailSection } from "@/components/shared/detail-section"
import { Prose } from "@/components/shared/prose"
import { ResolvedSkillRow } from "@/components/shared/resolved-skill-row"
import { useLoadedCharacter } from "@/hooks/use-entity-write"
import { affinityCells } from "@/lib/character/view/affinity-strip"
import { getArchetypeDisplay } from "@/lib/game-engine-v2"

import { AffinityStrip } from "../combat/affinity-strip"
import { AttributesBlock } from "../rail/attributes-block"
import { SheetCard } from "../sheet-card"
import { InheritanceSlots } from "./inheritance-slots"

/**
 * The Archetypes tab (S2d — UNN-560): the **active** Archetype's detail. The
 * roster/switch affordance lives on the persistent rail (`ArchetypePill`), so
 * this surface renders one Archetype — its identity (attributes/affinities/
 * talents), its unique mechanic prose, its Skills-by-Rank, and its inheritance
 * slots. Layout-only over `getArchetypeDisplay`; switching the active Archetype
 * in the rail re-folds and this whole surface follows in the same frame.
 */
export function ArchetypesTab() {
  const { profile, resolved } = useLoadedCharacter()
  const { activeEntry } = getArchetypeDisplay(resolved)
  const attributes = resolved.components.attributes
  const isOrigin =
    activeEntry !== null &&
    resolved.components.archetypes?.origin === activeEntry.key

  if (!activeEntry || !attributes) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-4">
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
          <p>No active Archetype. Pick one from the switcher in the rail.</p>
          <Button
            size="sm"
            variant="outline"
            render={
              <Link href={`/c/${profile.shortId}/archetypes/atlas`}>
                Open Lineage Atlas
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 px-5 py-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <ActiveArchetypeCard entry={activeEntry} origin={isOrigin} />
        <MechanicCard archetype={activeEntry.archetype} />
      </div>
      <div className="flex flex-col gap-3">
        <SkillsCard entry={activeEntry} attributes={attributes} />
        <Panel>
          <InheritanceSlots entry={activeEntry} attributes={attributes} />
        </Panel>
      </div>
    </div>
  )
}

/** The shared bordered panel for a tab region whose heading is content-owned
 *  (the Archetype header, the SKILLS / INHERITANCE SLOTS section labels). */
function Panel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-5 rounded-xl border bg-card/50 p-5",
        className
      )}
    >
      {children}
    </section>
  )
}

function ActiveArchetypeCard({
  entry,
  origin,
}: {
  entry: ArchetypeEntry
  origin: boolean
}) {
  const { archetype, rank } = entry
  return (
    <Panel>
      <ArchetypeDetailHeader
        archetype={archetype}
        rank={rank}
        origin={origin}
        trailing={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>Active</Badge>
            {hasMasteryBonus(rank) ? (
              <Badge variant="secondary">
                Mastery · {formatMasteryDescription(archetype.mastery)}
              </Badge>
            ) : null}
          </div>
        }
      />
      <DetailSection title="Attributes">
        <AttributesBlock attributes={archetype.attributes} />
      </DetailSection>
      <AffinityStrip cells={affinityCells(archetype.affinities)} />
      <ArchetypeTalents archetype={archetype} />
    </Panel>
  )
}

/** The active Archetype's unique mechanic — name + full prose (the Valor card).
 *  `null` when the Archetype declares no mechanic. */
function MechanicCard({
  archetype,
}: {
  archetype: ArchetypeEntry["archetype"]
}) {
  const mechanic = archetype.mechanic ? getMechanic(archetype.mechanic) : null
  if (!mechanic) return null
  return (
    <SheetCard title={mechanic.displayName}>
      <Prose>{mechanic.description}</Prose>
    </SheetCard>
  )
}

function SkillsCard({
  entry,
  attributes,
}: {
  entry: ArchetypeEntry
  attributes: AttributeScores
}) {
  const showSynthesis =
    entry.synthesis !== null &&
    hasUnlockedRank(entry.rank, entry.synthesis.rank)
  return (
    <Panel>
      <ArchetypeResolvedSkills
        ranks={entry.ranks}
        currentRank={entry.rank}
        attributes={attributes}
      />
      {showSynthesis ? (
        <DetailSection title="Synthesis Skill">
          <ItemGroup className="gap-0">
            <ResolvedSkillRow
              resolved={entry.synthesis!}
              attributes={attributes}
            />
          </ItemGroup>
        </DetailSection>
      ) : null}
    </Panel>
  )
}
