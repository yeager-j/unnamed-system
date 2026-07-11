import { Badge } from "@workspace/ui/components/badge"
import { ItemGroup } from "@workspace/ui/components/item"

import { AffinityGrid } from "@/components/shared/affinity-grid"
import { AttributeGrid } from "@/components/shared/attribute-grid"
import { DetailSection } from "@/components/shared/detail-section"
import { ResolvedSkillRow } from "@/components/shared/resolved-skill-row"
import { type EnemyStatblockView } from "@/domain/combat/view/enemy-statblock-view"

/**
 * The read-only body of an enemy's statblock: Attributes, Affinities, Talents,
 * and Skills. The single renderer shared by the DM combat drawer (UNN-345) and
 * the catalog browse pane (UNN-346) — both project an enemy onto an
 * {@link EnemyStatblockView} and hand it here, so the enemy stats render
 * identically in both places instead of each surface re-implementing the grids.
 *
 * Skills reuse the shared {@link ResolvedSkillRow} (cost row suppressed —
 * enemies pay no Skill costs), so the Attack Roll readout matches a character's.
 * Sections with nothing to show are omitted.
 */
export function EnemyStatblock({ view }: { view: EnemyStatblockView }) {
  const { attributes, affinities, talentNames, skills, hasSkillPool } = view
  return (
    <>
      {attributes ? (
        <DetailSection title="Attributes">
          <AttributeGrid attributes={attributes} />
        </DetailSection>
      ) : null}

      <DetailSection title="Affinities">
        {affinities ? (
          <AffinityGrid chart={affinities} columnsClassName="grid-cols-4" />
        ) : (
          <p className="text-sm text-muted-foreground">No affinity data.</p>
        )}
      </DetailSection>

      {talentNames !== null ? (
        <DetailSection title="Talents">
          {talentNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {talentNames.map((name) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No talents.</p>
          )}
        </DetailSection>
      ) : null}

      {skills.length > 0 ? (
        <DetailSection title="Skills">
          <ItemGroup className="gap-0">
            {skills.map((skill) => (
              <ResolvedSkillRow
                key={skill.key}
                view={skill}
                showCost={hasSkillPool}
              />
            ))}
          </ItemGroup>
        </DetailSection>
      ) : null}
    </>
  )
}
