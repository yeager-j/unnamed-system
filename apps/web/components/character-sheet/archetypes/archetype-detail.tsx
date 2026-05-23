import { ItemGroup } from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"

import type { ArchetypeEntry } from "@/lib/game/archetypes/entries"
import { hasUnlockedRank } from "@/lib/game/archetypes/schema"
import { getMechanic } from "@/lib/game/mechanics"

import { DetailSection } from "../shared/detail-section"
import { Prose } from "../shared/prose"
import { SkillRow } from "../skill-row"
import { ArchetypeAffinities } from "./archetype-detail/affinities"
import { ArchetypeAttributes } from "./archetype-detail/attributes"
import { ArchetypeInheritanceSlots } from "./archetype-detail/inheritance-slots"
import { ArchetypeRankedSkills } from "./archetype-detail/ranked-skills"
import { ArchetypeTalents } from "./archetype-detail/talents"

/**
 * The rich, per-Archetype detail block — shared by the featured Active card on
 * the Archetypes tab and the per-Archetype Drawer launched from each compact
 * summary card. Renders every fact about one unlocked Archetype: attributes,
 * simplified affinity chart, talents, mechanic prose, the Skills grouped by
 * Rank (with the existing {@link SkillRow} popover for Skill detail), the
 * Synthesis Skill when unlocked at the current Rank, and Inheritance Slots
 * with their fillers. Read-only — no Switch/Rank-up/Unlock controls.
 *
 * `entry` arrives pre-resolved by the tab parent so this block (and the
 * compact summary alongside it) never re-do cross-Archetype lookups.
 */
export function ArchetypeDetail({ entry }: { entry: ArchetypeEntry }) {
  const { archetype, row } = entry
  const mechanic = archetype.mechanic ? getMechanic(archetype.mechanic) : null
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ArchetypeAttributes archetype={archetype} />
        <ArchetypeAffinities archetype={archetype} />
      </div>

      <ArchetypeTalents archetype={archetype} />

      {mechanic ? (
        <>
          <Separator />
          <section className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{mechanic.displayName}</h3>
            <Prose>{mechanic.description}</Prose>
          </section>
        </>
      ) : null}

      <Separator />

      <ArchetypeRankedSkills entry={entry} />

      {entry.synthesis && hasUnlockedRank(row.rank, entry.synthesis.rank) ? (
        <DetailSection title="Synthesis Skill">
          <ItemGroup className="gap-0">
            <SkillRow skill={entry.synthesis} />
          </ItemGroup>
        </DetailSection>
      ) : null}

      <ArchetypeInheritanceSlots entry={entry} />
    </div>
  )
}
