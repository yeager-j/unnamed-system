import { Badge } from "@workspace/ui/components/badge"

import type { AttackRange } from "@/lib/game/attack"
import type { IntrinsicAttack } from "@/lib/game/items/schema"
import type { ResolvedSkillCost } from "@/lib/game/skill-cost"
import { hydrateFormula } from "@/lib/game/skill-display"
import type { Skill } from "@/lib/game/skills/schema"
import type { AttributeScores } from "@/lib/game/stats"
import {
  DAMAGE_TYPE_LABELS,
  DELIVERY_LABELS,
  KNOWN_RANGE_LABELS,
} from "@/lib/ui/labels"

import { SkillCostBadge } from "./shared/skill-cost-badge"
import { type StatRow } from "./shared/stats-grid"

/**
 * Builds the rows for the Skill popover's stats grid, including only the
 * fields that apply to this Skill kind. Pure — no `useCharacter()` access;
 * the character's resolved attributes are passed in so the helper stays
 * easy to reason about and to unit test.
 */
export function skillStatRows(
  skill: Skill,
  cost: ResolvedSkillCost | null,
  attributes: AttributeScores
): StatRow[] {
  const rows: StatRow[] = []

  if (cost) {
    rows.push({ label: "Cost", value: <SkillCostBadge cost={cost} /> })
  }

  if ("range" in skill) {
    rows.push({
      label: "Range",
      value: <Badge variant="secondary">{rangeLabel(skill.range)}</Badge>,
    })
  }

  if (skill.kind === "attack") {
    rows.push({ label: "Damage", value: damageBadges(skill, attributes) })
    if (skill.hits) {
      rows.push({ label: "Hits", value: <span>{skill.hits}</span> })
    }
  }

  if (skill.kind === "heal" && skill.formula) {
    rows.push({
      label: "Healing",
      value: (
        <Badge variant="secondary">
          {hydrateFormula(skill.formula, attributes)}
        </Badge>
      ),
    })
  }

  if (skill.kind === "support" && skill.duration) {
    rows.push({
      label: "Duration",
      value: (
        <span>
          {skill.duration} {skill.duration === 1 ? "turn" : "turns"}
        </span>
      ),
    })
  }

  if ("targets" in skill && skill.targets) {
    rows.push({ label: "Targets", value: <span>{skill.targets}</span> })
  }

  return rows
}

/** Damage row content for an attack Skill: hydrated formula + type label chip. */
export function damageBadges(
  skill: Extract<Skill, { kind: "attack" }>,
  attributes: AttributeScores
) {
  const typeLabel = `${DAMAGE_TYPE_LABELS[skill.damageType]} (${DELIVERY_LABELS[skill.delivery]})`
  return (
    <>
      {skill.damage ? (
        <Badge variant="secondary">
          {hydrateFormula(skill.damage, attributes)}
        </Badge>
      ) : null}
      <Badge variant="secondary">{typeLabel}</Badge>
    </>
  )
}

/** Stat grid for the equipped weapon's intrinsic attack popover. */
export function intrinsicAttackStatRows(attack: IntrinsicAttack): StatRow[] {
  return [
    {
      label: "Range",
      value: <Badge variant="secondary">{rangeLabel(attack.range)}</Badge>,
    },
    {
      label: "Damage",
      value: (
        <Badge variant="secondary">
          {DAMAGE_TYPE_LABELS[attack.damageType]} (
          {DELIVERY_LABELS[attack.delivery]})
        </Badge>
      ),
    },
  ]
}

export function rangeLabel(range: AttackRange): string {
  return range.kind === "known" ? KNOWN_RANGE_LABELS[range.value] : range.value
}
