import { useCharacter } from "@/hooks/use-character"
import type { IntrinsicAttack, Weapon } from "@/lib/game/items/schema"

import { AttackRollTable } from "./shared/attack-roll-table"
import { CardShell } from "./shared/card-shell"
import { StatsGrid } from "./shared/stats-grid"
import { intrinsicAttackStatRows } from "./skill-card-utils"
import { SkillText } from "./skill-text"

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
