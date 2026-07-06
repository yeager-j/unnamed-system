import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { PathChoice } from "@workspace/game-v2/kernel/vocab"
import { ItemGroup } from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"

import { ArchetypeAffinitiesChart } from "@/components/archetype/archetype-affinities-chart"
import { ArchetypeAttributesGrid } from "@/components/archetype/archetype-attributes-grid"
import { ArchetypeMechanicProse } from "@/components/archetype/archetype-mechanic-prose"
import { ArchetypeResolvedSkills } from "@/components/archetype/archetype-resolved-skills"
import { ArchetypeTalents } from "@/components/archetype/archetype-talents"
import { DetailSection } from "@/components/shared/detail-section"
import { ResolvedSkillRow } from "@/components/shared/resolved-skill-row"
import { previewArchetypeSkills } from "@/lib/game-engine-v2"

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
      <ArchetypeResolvedSkills
        ranks={ranks}
        attributes={archetype.attributes}
      />
      {synthesis ? (
        <DetailSection title="Synthesis Skill">
          <ItemGroup className="gap-0">
            <ResolvedSkillRow
              resolved={synthesis}
              attributes={archetype.attributes}
            />
          </ItemGroup>
        </DetailSection>
      ) : null}
    </div>
  )
}
