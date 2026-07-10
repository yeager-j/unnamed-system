import fc from "fast-check"

import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/** The shape of `applyHeal` — the operation the clamp law is stated over. */
export type HealOperation = (
  vitals: Vitals,
  amount: number
) => Pick<Vitals, "damage">

const arbitraryVitals = fc.record({
  base: fc.integer({ min: 1, max: 200 }),
  damage: fc.integer({ min: -100, max: 300 }),
})

const arbitraryAmount = fc.integer({ min: 0, max: 300 })

const currentHP = (vitals: Vitals) => Math.max(0, vitals.base - vitals.damage)

/**
 * **A heal never lowers current HP.** Stated as a property over an injected heal
 * so the same sentence can be aimed at a deliberately broken clamp — see
 * `negative-control.laws.test.ts`, which is the only reason to know a property
 * still has teeth.
 *
 * The interesting half is over-max (`damage < 0`, a Usury loan): a naive
 * `max(0, damage - amount)` clamp silently wipes 115/100 down to 100/100. No
 * example test found that; the quantifier does, because it reaches negative
 * `damage` on its own.
 */
export function healNeverLowersCurrentHP(
  heal: HealOperation
): fc.IProperty<[Vitals, number]> {
  return fc.property(arbitraryVitals, arbitraryAmount, (vitals, amount) => {
    const healed = { ...vitals, ...heal(vitals, amount) }
    return currentHP(healed) >= currentHP(vitals)
  })
}
