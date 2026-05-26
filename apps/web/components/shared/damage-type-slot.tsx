import { DamageTypeBadge, type SkillRowDamageType } from "./damage-type-badge"

/**
 * Fixed-width column for a row's damage-type chip. Attack skills (and the
 * weapon's intrinsic attack) render a tinted {@link DamageTypeBadge};
 * non-attack skills render an em dash so the column stays aligned.
 */
export function DamageTypeSlot({
  damageType,
}: {
  damageType: SkillRowDamageType | null
}) {
  return (
    <span className="w-full text-center">
      {damageType ? (
        <DamageTypeBadge damageType={damageType} />
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </span>
  )
}
