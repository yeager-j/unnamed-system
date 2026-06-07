import { formatSignedBonus, hydrateFormula } from "@workspace/game/engine"
import {
  type AttackRoll,
  type AttributeScores,
  type ResolvedAttackRoll,
} from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"

import { AttackRollBreakdown } from "./attack-roll-breakdown"
import { SideEffectBadge } from "./side-effect-badge"

/**
 * The Attack Roll tier table rendered at the bottom of every Skill or
 * intrinsic-attack popover that carries one. Header shows the resolved
 * total bonus; the source breakdown surfaces only when more than one
 * contributor is active.
 */
export function AttackRollTable({
  roll,
  resolved,
  attributes,
}: {
  roll: AttackRoll
  resolved: ResolvedAttackRoll
  attributes: AttributeScores
}) {
  return (
    <section className="border-t border-border pt-3">
      <h4 className="mb-1.5 text-xs font-semibold tracking-wide uppercase">
        Attack Roll {formatSignedBonus(resolved.total)}
      </h4>
      <AttackRollBreakdown resolved={resolved} />
      <ul className="flex flex-col gap-1.5 text-sm">
        {roll.tiers.map((tier) => (
          <li
            key={tier.band}
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <Badge variant="outline" className="w-14 font-mono">
              {tier.band}
            </Badge>
            {tier.formula ? (
              <span className="font-mono text-sm">
                {hydrateFormula(tier.formula, attributes)}
              </span>
            ) : null}
            {tier.sideEffects.map((key) => (
              <SideEffectBadge key={key} sideEffectKey={key} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
