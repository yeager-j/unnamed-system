import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import { PRISMA_BASE_CHARGES } from "@workspace/game-v2/resources/derive"
import { applyUsePrisma } from "@workspace/game-v2/resources/operations"
import type { Resources } from "@workspace/game-v2/resources/resources.schema"
import {
  applyFullRest,
  type RestComponents,
} from "@workspace/game-v2/resources/rest"
import { healNeverLowersCurrentHP } from "@workspace/game-v2/vitals/__laws__/heal-property"
import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
} from "@workspace/game-v2/vitals/operations"
import type { SkillPool } from "@workspace/game-v2/vitals/skill-pool.schema"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * **The depletion algebra.** Vitals are stored as signed depletion and current is
 * derived (`currentHP = max(0, maxHP − damage)`), which buys three things the
 * design leans on: damage composes as integer addition, over-max HP is just
 * negative damage, and each operation — not the field — owns its clamp (D9/D10).
 *
 * Those are algebraic claims about *every* op sequence, so they are stated here as
 * laws rather than pinned at a handful of numbers. The sharp ones are the
 * order-independence of damage (what the signed model exists to buy) and the
 * over-max heal no-op (the clamp an example test can miss).
 */
const arbitraryVitals: fc.Arbitrary<Vitals> = record({
  base: fc.integer({ min: 1, max: 200 }),
  damage: fc.integer({ min: -100, max: 300 }),
})

/**
 * `spSpent` is non-negative here, unlike `damage`. The schema stores it signed for
 * symmetry, but **over-max SP is not a rule**: Usury's Payday Loan grants over-max
 * *HP* only, and no write op can drive `spSpent` below zero. Accordingly
 * `applyRecoverSP` carries no over-max guard where `applyHeal` does — so a
 * negative `spSpent` is outside the domain these laws quantify over, not a case
 * they cover.
 */
const arbitrarySkillPool: fc.Arbitrary<SkillPool> = record({
  base: fc.integer({ min: 1, max: 60 }),
  spSpent: fc.integer({ min: 0, max: 90 }),
})

const arbitraryResources: fc.Arbitrary<Resources> = record({
  hitDiceUsed: fc.integer({ min: 0, max: 8 }),
  skillDiceUsed: fc.integer({ min: 0, max: 12 }),
  prismaUsed: fc.integer({ min: 0, max: PRISMA_BASE_CHARGES + 1 }),
})

/** Signed: a negative amount is an over-max grant, the Usury Payday Loan. */
const arbitraryDamageAmounts = fc.array(fc.integer({ min: -60, max: 120 }), {
  maxLength: 6,
})
const arbitraryHealAmounts = fc.array(fc.integer({ min: 0, max: 120 }), {
  maxLength: 6,
})

const currentHP = (vitals: Vitals) => Math.max(0, vitals.base - vitals.damage)
const currentSP = (pool: SkillPool) => Math.max(0, pool.base - pool.spSpent)

const damageAll = (vitals: Vitals, amounts: readonly number[]): Vitals =>
  amounts.reduce(
    (current, amount) => ({ ...current, ...applyDamage(current, amount) }),
    vitals
  )

const healAll = (vitals: Vitals, amounts: readonly number[]): Vitals =>
  amounts.reduce(
    (current, amount) => ({ ...current, ...applyHeal(current, amount) }),
    vitals
  )

describe("damage is a monoid action of (ℤ, +)", () => {
  it("a damage sequence depends only on the sum of its amounts", () => {
    fc.assert(
      fc.property(
        arbitraryVitals,
        arbitraryDamageAmounts,
        (vitals, amounts) => {
          const total = amounts.reduce((sum, amount) => sum + amount, 0)
          expect(damageAll(vitals, amounts)).toStrictEqual({
            ...vitals,
            ...applyDamage(vitals, total),
          })
        }
      )
    )
  })

  it("a damage sequence is order-independent", () => {
    fc.assert(
      fc.property(
        arbitraryVitals,
        arbitraryDamageAmounts.chain((amounts) =>
          fc.tuple(
            fc.constant(amounts),
            fc.shuffledSubarray(amounts, {
              minLength: amounts.length,
              maxLength: amounts.length,
            })
          )
        ),
        (vitals, [amounts, permuted]) => {
          expect(damageAll(vitals, amounts)).toStrictEqual(
            damageAll(vitals, permuted)
          )
        }
      )
    )
  })
})

describe("heal clamps at full health and never overheals", () => {
  it("never lowers current HP", () => {
    fc.assert(healNeverLowersCurrentHP(applyHeal))
  })

  it("is a no-op when the entity is over-max", () => {
    fc.assert(
      fc.property(
        arbitraryVitals.filter((vitals) => vitals.damage < 0),
        arbitraryHealAmounts,
        (vitals, amounts) => {
          expect(healAll(vitals, amounts)).toStrictEqual(vitals)
        }
      )
    )
  })

  it("composes: healing a then b equals healing a + b, below full health", () => {
    fc.assert(
      fc.property(
        arbitraryVitals.filter((vitals) => vitals.damage >= 0),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (vitals, a, b) => {
          expect(healAll(vitals, [a, b])).toStrictEqual({
            ...vitals,
            ...applyHeal(vitals, a + b),
          })
        }
      )
    )
  })

  it("never drives damage below zero from a healthy start", () => {
    fc.assert(
      fc.property(
        arbitraryVitals.filter((vitals) => vitals.damage >= 0),
        arbitraryHealAmounts,
        (vitals, amounts) => {
          expect(healAll(vitals, amounts).damage).toBeGreaterThanOrEqual(0)
        }
      )
    )
  })
})

describe("current is derived, clamped, and honest about its max", () => {
  it("current HP floors at zero however deep the overkill", () => {
    fc.assert(
      fc.property(
        arbitraryVitals,
        arbitraryDamageAmounts,
        (vitals, amounts) => {
          expect(currentHP(damageAll(vitals, amounts))).toBeGreaterThanOrEqual(
            0
          )
        }
      )
    )
  })

  it("current HP exceeds max exactly when damage is negative", () => {
    fc.assert(
      fc.property(arbitraryVitals, (vitals) => {
        expect(currentHP(vitals) > vitals.base).toBe(vitals.damage < 0)
      })
    )
  })
})

describe("the skill pool mirrors HP", () => {
  it("spend is additive and order-independent", () => {
    fc.assert(
      fc.property(
        arbitrarySkillPool,
        fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 5 }),
        (pool, amounts) => {
          const spent = amounts.reduce(
            (current, amount) => ({
              ...current,
              ...applySpendSP(current, amount),
            }),
            pool
          )
          const total = amounts.reduce((sum, amount) => sum + amount, 0)
          expect(spent.spSpent).toBe(pool.spSpent + total)
        }
      )
    )
  })

  it("recover never overshoots max SP and never lowers current SP", () => {
    fc.assert(
      fc.property(
        arbitrarySkillPool,
        fc.integer({ min: 0, max: 120 }),
        (pool, amount) => {
          const recovered = { ...pool, ...applyRecoverSP(pool, amount) }
          expect(recovered.spSpent).toBeGreaterThanOrEqual(0)
          expect(currentSP(recovered)).toBeGreaterThanOrEqual(currentSP(pool))
          expect(currentSP(recovered)).toBeLessThanOrEqual(pool.base)
        }
      )
    )
  })
})

describe("the Prisma flask is the one partial pool", () => {
  it("refuses exactly when it is empty, and never spends past its charges", () => {
    fc.assert(
      fc.property(arbitraryResources, (resources) => {
        const used = applyUsePrisma(resources, PRISMA_BASE_CHARGES)
        expect(used.ok).toBe(resources.prismaUsed < PRISMA_BASE_CHARGES)
        if (used.ok) {
          expect(used.value.prismaUsed).toBeLessThanOrEqual(PRISMA_BASE_CHARGES)
        }
      })
    )
  })
})

describe("a full rest zeroes depletion", () => {
  const arbitraryRestComponents = record({
    vitals: arbitraryVitals,
    skillPool: arbitrarySkillPool,
    resources: arbitraryResources,
    exhaustion: record({ level: fc.integer({ min: 0, max: 6 }) }),
    level: record({
      value: fc.integer({ min: 1, max: 30 }),
      victories: fc.constant(0),
    }),
  })

  /** The shallow per-key merge the patch's contract asks of every caller. */
  const rest = (components: RestComponents): RestComponents => {
    const patch = applyFullRest(components)
    return {
      ...components,
      vitals: { ...components.vitals, ...patch.vitals },
      skillPool: { ...components.skillPool, ...patch.skillPool },
      resources: { ...components.resources, ...patch.resources },
      exhaustion: { ...components.exhaustion, ...patch.exhaustion },
    }
  }

  it("clears every pool and steps exhaustion down by at most one", () => {
    fc.assert(
      fc.property(arbitraryRestComponents, (components) => {
        const rested = rest(components)
        expect(rested.vitals.damage).toBe(0)
        expect(rested.skillPool.spSpent).toBe(0)
        expect(rested.resources).toStrictEqual({
          hitDiceUsed: 0,
          skillDiceUsed: 0,
          prismaUsed: 0,
        })
        const stepped = components.exhaustion.level - rested.exhaustion.level
        expect(stepped).toBeGreaterThanOrEqual(0)
        expect(stepped).toBeLessThanOrEqual(1)
        expect(rested.exhaustion.level).toBeGreaterThanOrEqual(0)
      })
    )
  })

  it("leaves depletion a fixed point — only exhaustion keeps stepping", () => {
    fc.assert(
      fc.property(arbitraryRestComponents, (components) => {
        const once = rest(components)
        const twice = rest(once)
        expect(twice.vitals).toStrictEqual(once.vitals)
        expect(twice.skillPool).toStrictEqual(once.skillPool)
        expect(twice.resources).toStrictEqual(once.resources)
      })
    )
  })
})
