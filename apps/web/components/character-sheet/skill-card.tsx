import { Badge } from "@workspace/ui/components/badge"

import { useCharacter } from "@/hooks/use-character"
import type { AttackRange, Range } from "@/lib/game/attack"
import type { HydratedSkill } from "@/lib/game/hydrated-character"
import type { IntrinsicAttack, Weapon } from "@/lib/game/items/schema"
import type { ResolvedSkillCost } from "@/lib/game/skill-cost"
import { hydrateFormula } from "@/lib/game/skill-display"
import type { Skill } from "@/lib/game/skills/schema"
import type { AttributeScores } from "@/lib/game/stats"
import {
  DAMAGE_TYPE_LABELS,
  DELIVERY_LABELS,
  SKILL_KIND_LABELS,
} from "@/lib/ui/labels"

import { AttackRollTable } from "./shared/attack-roll-table"
import { CardShell } from "./shared/card-shell"
import { StatsGrid, type StatRow } from "./shared/stats-grid"
import { SkillCostBadge } from "./skill-cost-badge"
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

interface IntrinsicAttackCardProps {
  weapon: Weapon
}

/**
 * The popover body for the equipped weapon's intrinsic attack. Mirrors
 * {@link SkillCard} structurally but reads off {@link IntrinsicAttack} — no
 * cost row, no description prose, no Effect block. The intrinsic attack is
 * always an attack, so the kind badge is fixed.
 */
export function IntrinsicAttackCard({ weapon }: IntrinsicAttackCardProps) {
  const attack = weapon.intrinsicAttack
  const { weaponAttackRoll, attributes } = useCharacter()
  if (!weaponAttackRoll) return null
  return (
    <CardShell
      title={weapon.name}
      kindLabel="Attack"
      subtitle="Equipped weapon"
    >
      <SkillText>Intrinsic weapon attack.</SkillText>
      <StatsGrid rows={intrinsicAttackStatRows(attack)} />
      <AttackRollTable
        roll={attack.attackRoll}
        resolved={weaponAttackRoll}
        attributes={attributes}
      />
    </CardShell>
  )
}

function skillStatRows(
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

function damageBadges(
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

function intrinsicAttackStatRows(attack: IntrinsicAttack): StatRow[] {
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

function rangeLabel(range: AttackRange): string {
  return range.kind === "known" ? KNOWN_RANGE_LABELS[range.value] : range.value
}

const KNOWN_RANGE_LABELS: Record<Range, string> = {
  engaged: "Engaged",
  "all-engaged": "All Engaged",
  "same-zone": "Same Zone",
  "same-or-adjacent-zone": "Same/Adjacent Zone",
}
