import { type StatContext } from "@workspace/game/engine/character/stats/stats"
import {
  matchesFilter,
  type AttackRollContext,
} from "@workspace/game/engine/combat/attack-roll"
import { mechanicEffectsFor } from "@workspace/game/engine/mechanics/registry"
import {
  type DamageBonus,
  type DamageEffect,
} from "@workspace/game/foundation/combat/effects"

/**
 * Per-Skill damage-bonus resolution — the damage analog of
 * {@link import("./attack-roll").resolveAttackRoll}. Folds every
 * {@link DamageEffect} whose `when` filter matches the Skill's
 * {@link AttackRollContext} into labelled bonus lines (`"Frenzy (Pain 3)" →
 * "+3d4"`). The contributors are the active mechanic (Frenzy is the only
 * emitter today) and any combat-context effects (Zone Enchantments); passive
 * Skills are skipped — the authored `skillEffectsSchema` carries no damage
 * effect. Pure: no I/O, deterministic, never mutates input.
 *
 * Damage is rolled at the table (the app takes player-entered numbers), so this
 * is **display-only** — the Skill card renders the lines beside the damage
 * tiers. There is no resolved-damage total.
 */
export function resolveDamageBonuses(
  context: AttackRollContext,
  character: StatContext
): DamageBonus[] {
  const bonuses: DamageBonus[] = []
  for (const effect of collectDamageEffects(character)) {
    if (!matchesFilter(effect.when, context)) continue
    bonuses.push({
      source: effect.source ?? "Bonus",
      label: damageLabel(effect),
    })
  }
  return bonuses
}

function collectDamageEffects(character: StatContext): DamageEffect[] {
  const effects: DamageEffect[] = []

  const active = character.activeMechanic
  if (active) {
    for (const effect of mechanicEffectsFor(active.kind, active.state, {
      stats: character,
    })) {
      if (effect.type === "damage") effects.push(effect)
    }
  }

  for (const effect of character.contextEffects) {
    if (effect.type === "damage") effects.push(effect)
  }

  return effects
}

/** Formats a {@link DamageEffect} as the compact bonus shown on the card —
 *  `"+3d4"` for a dice bonus, `"+2"` / `"−2"` for a flat one. */
function damageLabel(effect: DamageEffect): string {
  if (effect.dice) return `+${effect.dice.count}d${effect.dice.sides}`
  const amount = effect.amount ?? 0
  return amount < 0 ? `−${Math.abs(amount)}` : `+${amount}`
}

/**
 * Folds resolved {@link DamageBonus} terms into a damage formula, inserting them
 * right after the leading damage term so they read `1d10 + 3d4 + St` — dice
 * grouped before the Attribute. The labels carry a leading sign (`+3d4`); the
 * `+` is stripped because the join supplies the operator. A pure string
 * transform shared by the Skill card and the weapon-attack card, so the
 * presentation layer renders the folded formula without owning the surgery.
 */
export function foldDamageBonusesIntoFormula(
  formula: string,
  bonuses: DamageBonus[]
): string {
  if (bonuses.length === 0) return formula
  const terms = bonuses.map((bonus) => bonus.label.replace(/^\+/, ""))
  const parts = formula.split(" + ")
  parts.splice(1, 0, ...terms)
  return parts.join(" + ")
}
