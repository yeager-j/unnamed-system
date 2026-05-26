import type { ResolvedAttackRoll } from "@/lib/game/attack-roll"
import type { Weapon } from "@/lib/game/items/schema"
import type { AttributeScores } from "@/lib/game/stats"

import { AttackRollTable } from "./attack-roll-table"
import { PopoverCardShell } from "./popover-card-shell"
import { intrinsicAttackStatRows } from "./skill-card-utils"
import { SkillText } from "./skill-text"
import { StatsGrid } from "./stats-grid"

interface IntrinsicAttackCardProps {
  weapon: Weapon
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
  const attack = weapon.intrinsicAttack
  return (
    <PopoverCardShell
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
    </PopoverCardShell>
  )
}
