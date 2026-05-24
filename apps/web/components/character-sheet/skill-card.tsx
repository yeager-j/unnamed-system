import type { HydratedSkill } from "@/lib/game/hydrated-character"
import type { AttributeScores } from "@/lib/game/stats"
import { SKILL_KIND_LABELS } from "@/lib/ui/labels"

import { AttackRollTable } from "./shared/attack-roll-table"
import { PopoverCardShell } from "./shared/popover-card-shell"
import { SkillText } from "./shared/skill-text"
import { StatsGrid } from "./shared/stats-grid"
import { skillStatRows } from "./skill-card-utils"

interface SkillCardProps {
  skill: HydratedSkill
  /**
   * Attribute scores used to hydrate `+ Ma` / `+ St` formula placeholders in
   * the popover. The caller is the source of truth — the live sheet pulls
   * from the active character's resolved attributes, the builder's Origin
   * picker passes the previewed Archetype's intrinsic scores — so this leaf
   * component never reaches into context.
   */
  attributes: AttributeScores
}

/**
 * The popover body for a Skill row. Renders the Skill's name, kind tag,
 * description, an applicable-fields-only stats grid, the Attack Roll table
 * (for Skills that have one), and any freeform Effect prose. Damage and
 * healing formulas and the Attack Roll header hydrate with the passed-in
 * attribute scores.
 */
export function SkillCard({ skill, attributes }: SkillCardProps) {
  return (
    <PopoverCardShell
      title={skill.name}
      kindLabel={SKILL_KIND_LABELS[skill.kind]}
    >
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
    </PopoverCardShell>
  )
}
