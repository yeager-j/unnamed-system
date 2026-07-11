import { Badge } from "@workspace/ui/components/badge"

import { SKILL_KIND_LABELS } from "@/domain/labels"
import type { SkillKind } from "@/domain/vocab"

/**
 * Outline badge that names a Skill's kind ("Healing", "Support", "Passive",
 * "Ailment"). Mirrors {@link DamageTypeBadge}'s slot so the Skills list and
 * Skill popover keep a badge in the same position for every Skill — tinted
 * for typed damage, outlined for everything else. Accepts the full kind
 * union: v1's union made attack ⇒ damage-typed structural, but v2's composed
 * `Skill` keys the tinted badge on the `damage` facet, so an attack-kind
 * Skill without one falls back to this outline.
 */
export function SkillKindBadge({
  kind,
  className,
}: {
  kind: SkillKind
  className?: string
}) {
  return (
    <Badge variant="outline" className={className}>
      {SKILL_KIND_LABELS[kind]}
    </Badge>
  )
}
