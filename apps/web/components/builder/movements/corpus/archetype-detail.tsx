import {
  previewArchetypeSkills,
  type Archetype,
} from "@workspace/game/archetypes"
import type { PathChoice } from "@workspace/game/character"
import { ItemGroup } from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"

import { ArchetypeAffinitiesChart } from "@/components/archetype/archetype-affinities-chart"
import { ArchetypeAttributesGrid } from "@/components/archetype/archetype-attributes-grid"
import { ArchetypeMechanicProse } from "@/components/archetype/archetype-mechanic-prose"
import { ArchetypeRankedSkills } from "@/components/archetype/archetype-ranked-skills"
import { ArchetypeTalents } from "@/components/archetype/archetype-talents"
import { DetailSection } from "@/components/shared/detail-section"
import { SkillRow } from "@/components/shared/skill-row"

/**
 * The expanded inline detail panel rendered next to a compact
 * {@link ArchetypeCard} when it's the active card in the Movement 1 grid
 * (UNN-215 / ADR-002 §"The Archetype grid"). Lifts the body previously shown
 * inside the old per-Archetype drawer wholesale — the new design replaces the
 * drawer affordance with this in-place expansion, but the *content* (full
 * Affinity chart, Attributes grid, Talents, Mechanic prose, Ranked Skills,
 * Synthesis) is unchanged. Composes only atoms from `components/archetype/`
 * plus the shared `SkillRow` cross-feature primitive.
 */
export function ArchetypeDetail({
  archetype,
  pathChoice,
}: {
  archetype: Archetype
  pathChoice: PathChoice
}) {
  const { ranks, synthesis } = previewArchetypeSkills(archetype, pathChoice)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ArchetypeAttributesGrid archetype={archetype} />
        <ArchetypeAffinitiesChart archetype={archetype} />
      </div>
      <ArchetypeTalents archetype={archetype} />
      <ArchetypeMechanicProse archetype={archetype} />
      <Separator />
      <ArchetypeRankedSkills ranks={ranks} attributes={archetype.attributes} />
      {synthesis ? (
        <DetailSection title="Synthesis Skill">
          <ItemGroup className="gap-0">
            <SkillRow skill={synthesis} attributes={archetype.attributes} />
          </ItemGroup>
        </DetailSection>
      ) : null}
    </div>
  )
}
