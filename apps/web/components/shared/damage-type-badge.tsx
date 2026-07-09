import { type DamageType } from "@workspace/game-v2/kernel/vocab"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { DAMAGE_TYPE_LABELS } from "@/lib/ui/labels"

/**
 * The damage type slot reuses the Skill schema's `damageType` union, which
 * includes "special" alongside every {@link DamageType}.
 */
export type SkillRowDamageType = DamageType | "special"

export function DamageTypeBadge({
  damageType,
  className,
}: {
  damageType: SkillRowDamageType
  className?: string
}) {
  return (
    <Badge
      className={cn(
        "border-transparent text-neutral-900",
        DAMAGE_TYPE_BADGE_CLASSES[damageType],
        className
      )}
    >
      {DAMAGE_TYPE_LABELS[damageType]}
    </Badge>
  )
}

/**
 * Per-damage-type tint, using a Tailwind 200/300 step so neutral-900 text
 * stays readable on top. Physicals lean warm/earthy; magicals lean toward
 * their element's intuitive color; Almighty and Special are deliberately
 * neutral so they read as "no specific element".
 */
const DAMAGE_TYPE_BADGE_CLASSES: Record<SkillRowDamageType, string> = {
  slash: "bg-mauve-200",
  pierce: "bg-mist-200",
  strike: "bg-olive-300",
  fire: "bg-red-300",
  ice: "bg-blue-200",
  wind: "bg-green-200",
  elec: "bg-yellow-300",
  soul: "bg-cyan-200",
  mind: "bg-purple-200",
  light: "bg-zinc-100",
  dark: "bg-slate-400",
  almighty: "bg-neutral-300",
  special: "bg-neutral-200",
}
