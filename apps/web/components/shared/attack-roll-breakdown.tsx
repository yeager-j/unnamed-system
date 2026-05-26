import type { ResolvedAttackRoll } from "@/lib/game/attack-roll"
import { formatSignedBonus } from "@/lib/game/skill-display"

/**
 * Inline attribution row under the Attack Roll header. Hidden when only the
 * rolling Attribute contributes (the header alone is already complete in
 * that case); surfaces every mechanic- or passive-Skill-supplied contributor
 * when one or more is active.
 */
export function AttackRollBreakdown({
  resolved,
}: {
  resolved: ResolvedAttackRoll
}) {
  if (resolved.sources.length <= 1) return null
  return (
    <p className="mb-2 font-mono text-xs text-muted-foreground">
      {resolved.sources
        .map((part) => `${part.source} ${formatSignedBonus(part.amount)}`)
        .join("  ")}
    </p>
  )
}
