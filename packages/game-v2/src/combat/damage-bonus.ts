import {
  matchesFilter,
  type AttackRollContext,
} from "@workspace/game-v2/combat/attack-roll"
import type { FormulaTerm } from "@workspace/game-v2/combat/formula"
import type { DamageEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

/**
 * One resolved damage-bonus line — a {@link DamageEffect} that matched an attack's
 * context, reduced to the {@link FormulaTerm} it contributes plus its source
 * label. The term both folds into a damage formula
 * ({@link import("./formula").foldDamageBonuses}) and renders a standalone badge
 * ({@link import("./formula").termLabel}), so a single structured value serves
 * both surfaces — no pre-formatted string.
 */
export interface DamageBonus {
  source: string
  term: FormulaTerm
}

/**
 * Per-Skill damage-bonus resolution (ported from v1
 * `engine/combat/damage-bonus.ts`) — the damage analog of `resolveAttackRoll`.
 * Folds every {@link DamageEffect} whose `when` filter matches the attack's
 * {@link AttackRollContext} into a {@link DamageBonus} (`"Frenzy (Pain 3)" →
 * dice 3d4`).
 *
 * Damage is rolled at the table (the app takes player-entered numbers), so this is
 * **display-only** — there is no resolved-damage total. Pure: no I/O,
 * deterministic, never mutates input. The candidate effects come from the
 * resolved entity's `pendingEffects.damage` channel (the active mechanic — Frenzy
 * is the only emitter today — plus zone-enchantment effects).
 */
export function resolveDamageBonuses(
  context: AttackRollContext,
  resolved: ResolvedEntity
): DamageBonus[] {
  const effects = resolved.components.pendingEffects?.damage ?? []
  const bonuses: DamageBonus[] = []
  for (const effect of effects) {
    if (!matchesFilter(effect.when, context)) continue
    bonuses.push({
      source: effect.source ?? "Bonus",
      term: damageEffectTerm(effect),
    })
  }
  return bonuses
}

/** The {@link FormulaTerm} a {@link DamageEffect} contributes — a dice term for a
 *  `dice` effect, a flat term for an `amount` one (the schema guarantees exactly
 *  one is present). */
export function damageEffectTerm(effect: DamageEffect): FormulaTerm {
  if (effect.dice) {
    return { kind: "dice", count: effect.dice.count, sides: effect.dice.sides }
  }
  return { kind: "flat", amount: effect.amount ?? 0 }
}
