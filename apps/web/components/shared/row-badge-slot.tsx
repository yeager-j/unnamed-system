import type { SkillKind } from "@/domain/vocab"

import { DamageTypeBadge, type SkillRowDamageType } from "./damage-type-badge"
import { SkillKindBadge } from "./skill-kind-badge"

type RowBadgeSlotProps =
  | { damageType: SkillRowDamageType; kind?: never }
  | { damageType?: never; kind: SkillKind }

/**
 * Fixed-width column for the leftmost chip in a Skills-list row. Attack
 * Skills (and the equipped weapon's intrinsic attack) render a tinted
 * {@link DamageTypeBadge}; non-attack Skills render an outline
 * {@link SkillKindBadge} so the column always reads at a glance instead of
 * collapsing to an em dash.
 */
export function RowBadgeSlot(props: RowBadgeSlotProps) {
  return (
    <span className="block w-full text-center">
      {"damageType" in props && props.damageType !== undefined ? (
        <DamageTypeBadge damageType={props.damageType} className="w-full" />
      ) : (
        <SkillKindBadge kind={props.kind} className="w-full" />
      )}
    </span>
  )
}
