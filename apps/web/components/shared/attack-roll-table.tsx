import { formatSignedBonus, hydrateFormula } from "@workspace/game/engine"
import {
  type AttackRoll,
  type AttributeScores,
  type DamageBonus,
  type ResolvedAttackRoll,
} from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"

import { AttackRollBreakdown } from "./attack-roll-breakdown"
import { SideEffectBadge } from "./side-effect-badge"

/**
 * Folds any resolved damage bonuses (e.g. a Berserker's Frenzy "+Nd4") into a
 * tier's damage formula, inserting them right after the leading damage term so
 * they read `1d10 + 3d4 + St` — dice grouped before the Attribute. The labels
 * carry a leading sign (`+3d4`); the `+` is stripped because the join supplies
 * the operator.
 */
function withDamageBonuses(formula: string, bonuses: DamageBonus[]): string {
  if (bonuses.length === 0) return formula
  const terms = bonuses.map((bonus) => bonus.label.replace(/^\+/, ""))
  const parts = formula.split(" + ")
  parts.splice(1, 0, ...terms)
  return parts.join(" + ")
}

/**
 * The Attack Roll tier table rendered at the bottom of every Skill or
 * intrinsic-attack popover that carries one. Header shows the resolved
 * total bonus; the source breakdown surfaces only when more than one
 * contributor is active. `damageBonuses` (Frenzy's "+Nd4", …) are folded
 * inline into each damage formula, with their sources noted beneath.
 */
export function AttackRollTable({
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
                {hydrateFormula(
                  withDamageBonuses(tier.formula, damageBonuses),
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
            .map((bonus) => `${bonus.label} ${bonus.source}`)
            .join(", ")}
        </p>
      ) : null}
    </section>
  )
}
