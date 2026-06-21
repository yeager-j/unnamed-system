import { getTalent } from "@workspace/game/data"
import { type Statblock } from "@workspace/game/engine"
import { Badge } from "@workspace/ui/components/badge"
import { ItemGroup } from "@workspace/ui/components/item"

import { AffinityGrid } from "@/components/shared/affinity-grid"
import { AttributeGrid } from "@/components/shared/attribute-grid"
import { DetailSection } from "@/components/shared/detail-section"
import { Prose } from "@/components/shared/prose"
import { SkillRow } from "@/components/shared/skill-row"

/**
 * The read-only body of an enemy's {@link Statblock}: Attributes, Affinities,
 * Talents, Skills, and freeform Abilities. The single renderer shared by the DM
 * combat drawer (UNN-345) and the catalog browse pane (UNN-346) — both derive a
 * `Statblock` (a PC or enemy alike) and hand it here, so the enemy stats render
 * identically in both places instead of each surface re-implementing the grids.
 *
 * Skills reuse the shared {@link SkillRow} (cost row suppressed — enemies pay no
 * Skill costs), so the Attack Roll readout matches a character's. Sections with
 * nothing to show are omitted.
 */
export function EnemyStatblock({ statblock }: { statblock: Statblock }) {
  return (
    <>
      <DetailSection title="Attributes">
        <AttributeGrid attributes={statblock.attributes} />
      </DetailSection>

      <DetailSection title="Affinities">
        {statblock.affinities ? (
          <AffinityGrid
            chart={statblock.affinities}
            columnsClassName="grid-cols-4"
          />
        ) : (
          <p className="text-sm text-muted-foreground">No affinity data.</p>
        )}
      </DetailSection>

      {statblock.talents.length > 0 ? (
        <DetailSection title="Talents">
          <div className="flex flex-wrap gap-1.5">
            {statblock.talents.map((key) => (
              <Badge key={key} variant="outline">
                {getTalent(key)?.name ?? key}
              </Badge>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {statblock.skills.length > 0 ? (
        <DetailSection title="Skills">
          <ItemGroup className="gap-0">
            {statblock.skills.map((skill) => (
              <SkillRow
                key={skill.key}
                skill={skill}
                attributes={statblock.attributes}
                showCost={false}
              />
            ))}
          </ItemGroup>
        </DetailSection>
      ) : null}

      {statblock.abilities ? (
        <DetailSection title="Abilities">
          <Prose>{statblock.abilities}</Prose>
        </DetailSection>
      ) : null}
    </>
  )
}
