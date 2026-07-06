import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"

import { DamageTypeBadge } from "./damage-type-badge"
import { PopoverCardShell } from "./popover-card-shell"
import { ResolvedAttackRollTable } from "./resolved-attack-roll-table"
import { resolvedSkillStatRows } from "./resolved-skill-card-utils"
import { SkillKindBadge } from "./skill-kind-badge"
import { SkillText } from "./skill-text"
import { StatsGrid } from "./stats-grid"

interface ResolvedSkillCardProps {
  resolved: ResolvedSkill
  /**
   * Attribute scores used to hydrate `+ Ma` / `+ St` formula placeholders in
   * the popover. The caller is the source of truth — the builder's Origin
   * picker passes the previewed synthetic entity's resolved scores — so this
   * leaf component never reaches into context.
   */
  attributes: AttributeScores
  /**
   * Whether to show the resolved cost row. Defaults to `true` (characters pay
   * for Skills).
   */
  showCost?: boolean
}

/**
 * The popover body for a v2 resolved-Skill row — the `SkillCard` peer over
 * `ResolvedSkill` (UNN-556; the S2 sheet + the combat drawer's rich list,
 * UNN-538, reuse it). Renders the Skill's name, header badge (damage type for
 * typed-damage Skills, kind for everything else), description, an
 * applicable-fields-only stats grid, the Attack Roll table (for Skills that
 * roll), and any freeform Effect prose.
 */
export function ResolvedSkillCard({
  resolved,
  attributes,
  showCost = true,
}: ResolvedSkillCardProps) {
  const { skill } = resolved
  return (
    <PopoverCardShell
      title={skill.name}
      badge={
        skill.damage ? (
          <DamageTypeBadge damageType={skill.damage.damageType} />
        ) : (
          <SkillKindBadge kind={skill.kind} />
        )
      }
    >
      <SkillText>{skill.description}</SkillText>
      <StatsGrid
        rows={resolvedSkillStatRows(
          skill,
          showCost ? resolved.resolvedCost : null,
          attributes
        )}
      />
      {skill.attackRoll && resolved.resolvedAttackRoll ? (
        <ResolvedAttackRollTable
          roll={skill.attackRoll}
          resolved={resolved.resolvedAttackRoll}
          attributes={attributes}
          damageBonuses={resolved.resolvedDamageBonuses}
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
