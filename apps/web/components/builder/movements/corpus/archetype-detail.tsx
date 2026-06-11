import { type Archetype, type PathChoice } from "@workspace/game/foundation"
import { ItemGroup } from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"

import { ArchetypeAffinitiesChart } from "@/components/archetype/archetype-affinities-chart"
import { ArchetypeAttributesGrid } from "@/components/archetype/archetype-attributes-grid"
import { ArchetypeMechanicProse } from "@/components/archetype/archetype-mechanic-prose"
import { ArchetypeRankedSkills } from "@/components/archetype/archetype-ranked-skills"
import { ArchetypeTalents } from "@/components/archetype/archetype-talents"
import { DetailSection } from "@/components/shared/detail-section"
import { SkillRow } from "@/components/shared/skill-row"
import { previewArchetypeSkills } from "@/lib/game-engine"

/**
 * The body of the Movement 1 Origin Archetype detail {@link ArchetypeDialog}
 * (UNN-215 / ADR-002 §"The Archetype grid"): the full Affinity chart,
 * Attributes grid, Talents, Mechanic prose, Ranked Skills, and Synthesis for
 * one Archetype. Composes only atoms from `components/archetype/` plus the
 * shared `SkillRow` cross-feature primitive, so it renders identically wherever
 * an Origin Archetype is inspected.
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
