import type { AttackRoll } from "@workspace/game-v2/combat/attack.schema"
import type { DamageBonus } from "@workspace/game-v2/combat/damage-bonus"
import {
  foldDamageBonuses,
  renderFormula,
  termLabel,
} from "@workspace/game-v2/combat/formula"
import type { ResolvedAttackRoll } from "@workspace/game-v2/combat/resolved"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import { formatSignedBonus } from "@workspace/game-v2/skills/formula-text"
import { Badge } from "@workspace/ui/components/badge"

import { AttackRollBreakdown } from "./attack-roll-breakdown"
import { SideEffectBadge } from "./side-effect-badge"

/**
 * The Attack Roll tier table for a **v2 resolved Skill** — the peer of
 * `attack-roll-table.tsx` over the engine's structured tier formulas
 * ({@link renderFormula} / {@link foldDamageBonuses} replace v1's string
 * surgery). Header shows the resolved total bonus; the source breakdown
 * surfaces only when more than one contributor is active; `damageBonuses`
 * (Frenzy's "+Nd4", …) fold inline into each damage formula, with their
 * sources noted beneath.
 */
export function ResolvedAttackRollTable({
  roll,
  resolved,
  attributes,
  damageBonuses = [],
}: {
  roll: AttackRoll
  resolved: ResolvedAttackRoll
  attributes: AttributeScores
  damageBonuses?: DamageBonus[]
}) {
  const bonusTerms = damageBonuses.map((bonus) => bonus.term)
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
                {renderFormula(
                  foldDamageBonuses(tier.formula, bonusTerms),
                  attributes
                )}
              </span>
            ) : null}
            {tier.sideEffects.map((key) => (
              <SideEffectBadge key={key} sideEffectKey={key} />
            ))}
          </li>
        ))}
      </ul>
      {damageBonuses.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Includes{" "}
          {damageBonuses
            .map((bonus) => `${termLabel(bonus.term)} ${bonus.source}`)
            .join(", ")}
        </p>
      ) : null}
    </section>
  )
}
