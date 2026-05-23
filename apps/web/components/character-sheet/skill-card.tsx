import { useCharacter } from "@/hooks/use-character"
import type { HydratedSkill } from "@/lib/game/hydrated-character"
import { SKILL_KIND_LABELS } from "@/lib/ui/labels"

import { AttackRollTable } from "./shared/attack-roll-table"
import { CardShell } from "./shared/card-shell"
import { StatsGrid } from "./shared/stats-grid"
import { skillStatRows } from "./skill-card-utils"
import { SkillText } from "./skill-text"

interface SkillCardProps {
  skill: HydratedSkill
}

/**
 * The popover body for a Skill row. Renders the Skill's name, kind tag,
 * description, an applicable-fields-only stats grid, the Attack Roll table
 * (for Skills that have one), and any freeform Effect prose. Damage and
 * healing formulas and the Attack Roll header are hydrated with the
 * character's resolved attribute scores so the player sees `+ 4` instead of
 * `+ Ma`.
 */
export function SkillCard({ skill }: SkillCardProps) {
  const { attributes } = useCharacter()

  return (
    <CardShell title={skill.name} kindLabel={SKILL_KIND_LABELS[skill.kind]}>
      <SkillText>{skill.description}</SkillText>
      <StatsGrid rows={skillStatRows(skill, skill.resolvedCost, attributes)} />
      {"attackRoll" in skill && skill.attackRoll && skill.resolvedAttackRoll ? (
        <AttackRollTable
          roll={skill.attackRoll}
          resolved={skill.resolvedAttackRoll}
          attributes={attributes}
        />
      ) : null}
      {skill.effect ? (
        <SkillText className="border-t border-border pt-2">
          {skill.effect}
        </SkillText>
      ) : null}
    </CardShell>
  )
}
