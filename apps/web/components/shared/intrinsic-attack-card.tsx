import type { AttributeScores } from "@workspace/game/engine/character/stats/stats"
import type { ResolvedAttackRoll } from "@workspace/game/engine/combat/attack-roll"
import type { EquippedWeapon } from "@workspace/game/foundation/items/schema"

import { AttackRollTable } from "./attack-roll-table"
import { DamageTypeBadge } from "./damage-type-badge"
import { PopoverCardShell } from "./popover-card-shell"
import { intrinsicAttackStatRows } from "./skill-card-utils"
import { SkillText } from "./skill-text"
import { StatsGrid } from "./stats-grid"

interface IntrinsicAttackCardProps {
  weapon: EquippedWeapon
  /**
   * Attribute scores used to hydrate the Attack Roll formulas. The caller
   * (the live-sheet Skills tab) sources them from the active character.
   */
  attributes: AttributeScores
  /** Pre-resolved Attack Roll for this weapon, computed at hydration time. */
  weaponAttackRoll: ResolvedAttackRoll
}

/**
 * The popover body for the equipped weapon's intrinsic attack. Mirrors
 * {@link SkillCard} structurally but reads off {@link IntrinsicAttack} — no
 * cost row, no description prose, no Effect block. The intrinsic attack is
 * always an attack, so the kind badge is fixed.
 */
export function IntrinsicAttackCard({
  weapon,
  attributes,
  weaponAttackRoll,
}: IntrinsicAttackCardProps) {
  const attack = weapon.equip.intrinsicAttack
  return (
    <PopoverCardShell
      title={weapon.name}
      badge={<DamageTypeBadge damageType={attack.damageType} />}
      subtitle="Equipped weapon"
    >
      <SkillText>Intrinsic weapon attack.</SkillText>
      <StatsGrid rows={intrinsicAttackStatRows(attack)} />
      <AttackRollTable
        roll={attack.attackRoll}
        resolved={weaponAttackRoll}
        attributes={attributes}
      />
    </PopoverCardShell>
  )
}
