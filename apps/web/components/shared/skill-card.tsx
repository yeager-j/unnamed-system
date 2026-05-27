import type { AttributeScores, HydratedSkill } from "@/lib/game/character"

import { AttackRollTable } from "./attack-roll-table"
import { DamageTypeBadge } from "./damage-type-badge"
import { PopoverCardShell } from "./popover-card-shell"
import { skillStatRows } from "./skill-card-utils"
import { SkillKindBadge } from "./skill-kind-badge"
import { SkillText } from "./skill-text"
import { StatsGrid } from "./stats-grid"

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
 * The popover body for a Skill row. Renders the Skill's name, header badge
 * (damage type for attack Skills, kind for everything else), description, an
 * applicable-fields-only stats grid, the Attack Roll table (for Skills that
 * have one), and any freeform Effect prose. Damage and healing formulas and
 * the Attack Roll header hydrate with the passed-in attribute scores.
 */
export function SkillCard({ skill, attributes }: SkillCardProps) {
  return (
    <PopoverCardShell
      title={skill.name}
      badge={
        skill.kind === "attack" ? (
          <DamageTypeBadge damageType={skill.damageType} />
        ) : (
          <SkillKindBadge kind={skill.kind} />
        )
      }
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
