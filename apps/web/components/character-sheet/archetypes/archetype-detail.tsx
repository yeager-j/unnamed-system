import {
  hasUnlockedRank,
  type ArchetypeEntry,
} from "@workspace/game/archetypes"
import type { AttributeScores } from "@workspace/game/character"
import { ItemGroup } from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"

import { ArchetypeAffinitiesChart } from "@/components/archetype/archetype-affinities-chart"
import { ArchetypeAttributesGrid } from "@/components/archetype/archetype-attributes-grid"
import { ArchetypeMechanicProse } from "@/components/archetype/archetype-mechanic-prose"
import { ArchetypeRankedSkills } from "@/components/archetype/archetype-ranked-skills"
import { ArchetypeTalents } from "@/components/archetype/archetype-talents"
import { DetailSection } from "@/components/shared/detail-section"
import { SkillRow } from "@/components/shared/skill-row"

import { InheritanceSlots } from "./inheritance-slots"

/**
 * The rich, per-Archetype detail block — shared by the featured Active card on
 * the Archetypes tab and the per-Archetype Drawer launched from each compact
 * summary card. A thin composition over the shared
 * [`components/archetype/`](../../archetype) building blocks plus the
 * character-specific Inheritance Slots block.
 *
 * `entry` arrives pre-resolved by the tab parent so this block (and the
 * compact summary alongside it) never re-do cross-Archetype lookups.
 * `attributes` flows in from the parent (the Archetypes tab reads the active
 * character's resolved attributes once and passes down).
 */
export function ArchetypeDetail({
  entry,
  attributes,
}: {
  entry: ArchetypeEntry
  attributes: AttributeScores
}) {
  const { archetype, row } = entry
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ArchetypeAttributesGrid archetype={archetype} />
        <ArchetypeAffinitiesChart archetype={archetype} />
      </div>

      <ArchetypeTalents archetype={archetype} />

      <ArchetypeMechanicProse archetype={archetype} />

      <Separator />

      <ArchetypeRankedSkills
        ranks={entry.ranks}
        currentRank={row.rank}
        attributes={attributes}
      />

      {entry.synthesis && hasUnlockedRank(row.rank, entry.synthesis.rank) ? (
        <DetailSection title="Synthesis Skill">
          <ItemGroup className="gap-0">
            <SkillRow skill={entry.synthesis} attributes={attributes} />
          </ItemGroup>
        </DetailSection>
      ) : null}

      <InheritanceSlots entry={entry} attributes={attributes} />
    </div>
  )
}
