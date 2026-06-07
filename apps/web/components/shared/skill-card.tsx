import {
  type AttributeScores,
  type HydratedSkill,
} from "@workspace/game/foundation"

import { AttackRollTable } from "./attack-roll-table"
import { CastButton, type CastBindings } from "./cast-button"
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
  /**
   * Owner-mode Cast bindings (PRD §7.2). When supplied, a Cast footer renders
   * under {@link OwnerOnly} with affordability resolved against the passed-in
   * `currentHP`/`currentSP`. The builder's Archetype preview and the public
   * read-only sheet simply omit this prop and the footer never mounts.
   */
  cast?: CastBindings
  /**
   * Whether to show the resolved cost row. Defaults to `true` (characters pay
   * for Skills). Catalog enemies pay no Skill costs, so the combat drawer passes
   * `false` to drop the cost row while keeping the Attack Roll readout.
   */
  showCost?: boolean
}

/**
 * The popover body for a Skill row. Renders the Skill's name, header badge
 * (damage type for attack Skills, kind for everything else), description, an
 * applicable-fields-only stats grid, the Attack Roll table (for Skills that
 * have one), and any freeform Effect prose. Damage and healing formulas and
 * the Attack Roll header hydrate with the passed-in attribute scores.
 */
export function SkillCard({
  skill,
  attributes,
  cast,
  showCost = true,
}: SkillCardProps) {
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
      <StatsGrid
        rows={skillStatRows(
          skill,
          showCost ? skill.resolvedCost : null,
          attributes
        )}
      />
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
      {cast && "cost" in skill ? (
        <CastButton
          skill={skill}
          cast={cast}
          variant="footer"
          className="flex justify-end border-t border-border pt-3"
        />
      ) : null}
    </PopoverCardShell>
  )
}
