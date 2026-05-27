import { Badge } from "@workspace/ui/components/badge"

import type { SkillKind } from "@/lib/game/skills"
import { SKILL_KIND_LABELS } from "@/lib/ui/labels"

/**
 * Outline badge that names a non-attack Skill's kind ("Healing", "Support",
 * "Passive", "Ailment"). Mirrors {@link DamageTypeBadge}'s slot so the Skills
 * list and Skill popover keep a badge in the same position for every Skill —
 * tinted for attack damage types, outlined for everything else.
 */
export function SkillKindBadge({
  kind,
  className,
}: {
  kind: Exclude<SkillKind, "attack">
  className?: string
}) {
  return (
    <Badge variant="outline" className={className}>
      {SKILL_KIND_LABELS[kind]}
    </Badge>
  )
}
