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
import {
  skillPoolSchema,
  type SkillPool,
} from "@workspace/game-v2/vitals/skill-pool.schema"
import {
  vitalsSchema,
  type Vitals,
} from "@workspace/game-v2/vitals/vitals.schema"
import type { Result } from "@workspace/result"

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

/**
 * The **everyday** domain: depletion far from the safe-integer boundary, so the ops
 * never saturate. The algebraic laws below hold *here* — saturation is precisely
 * what a boundary trades associativity away for, so a monoid law quantified over
 * the whole schema domain would be false, and stating that domain is the honest
 * move rather than a convenient one. {@link arbitraryBoundedVitals} covers the edge.
 */
const arbitraryVitals: fc.Arbitrary<Vitals> = record({
  base: fc.integer({ min: 1, max: 200 }),
  damage: fc.integer({ min: -100, max: 300 }),
})

/**
 * `spSpent` is non-negative, unlike `damage` — **over-max SP is not a rule**, and
 * the schema makes that state unrepresentable rather than asking each op to defend
 * against it.
 */
const arbitrarySkillPool: fc.Arbitrary<SkillPool> = record({
  base: fc.integer({ min: 1, max: 60 }),
  spSpent: fc.integer({ min: 0, max: 90 }),
})

/** A depletion field at the edges of its real domain — `z.number().int()`'s safe integers. */
const arbitraryExtremeDepletion = (min: number) =>
  fc.oneof(
    fc.integer({ min: Math.max(min, -100), max: 300 }),
    fc.constantFrom(
      Math.max(min, Number.MIN_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER - 1
    )
  )

const arbitraryBoundedVitals: fc.Arbitrary<Vitals> = record({
  base: fc.integer({ min: 1, max: 200 }),
  damage: arbitraryExtremeDepletion(Number.MIN_SAFE_INTEGER),
})

const arbitraryBoundedSkillPool: fc.Arbitrary<SkillPool> = record({
  base: fc.integer({ min: 1, max: 60 }),
  spSpent: arbitraryExtremeDepletion(0),
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

/**
 * Unwrap an op's `Result` (UNN-565). Every amount these laws feed is a valid
 * integer — the magnitude arbitraries are non-negative and `applyDamage` accepts
 * any integer — so `invalid-input` is unreachable here; a throw surfaces it as a
 * test failure if that ever stops being true.
 */
const value = <T>(patch: Result<T, "invalid-input">): T => {
  if (!patch.ok)
    throw new Error("unexpected invalid-input in the depletion laws")
  return patch.value
}

const damageAll = (vitals: Vitals, amounts: readonly number[]): Vitals =>
  amounts.reduce(
    (current, amount) => ({
      ...current,
      ...value(applyDamage(current, amount)),
    }),
    vitals
  )

const healAll = (vitals: Vitals, amounts: readonly number[]): Vitals =>
  amounts.reduce(
    (current, amount) => ({ ...current, ...value(applyHeal(current, amount)) }),
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
            ...value(applyDamage(vitals, total)),
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
            ...value(applyHeal(vitals, a + b)),
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
              ...value(applySpendSP(current, amount)),
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
          const recovered = { ...pool, ...value(applyRecoverSP(pool, amount)) }
          expect(recovered.spSpent).toBeGreaterThanOrEqual(0)
          expect(currentSP(recovered)).toBeGreaterThanOrEqual(currentSP(pool))
          expect(currentSP(recovered)).toBeLessThanOrEqual(pool.base)
        }
      )
    )
  })
})

/**
 * **An op never emits a component its own load schema rejects.** The failure this
 * guards is not cosmetic: a stored depletion past the safe-integer boundary means
 * the optimistic client renders a happy frame over a row that no later
 * `loadEntityRow` can read — bricked for good, with no write to undo it.
 *
 * Quantified over the *whole* schema domain, boundary included. The everyday
 * arbitraries above cannot reach the edge, and a row already sitting there is
 * exactly the reachable case: `amount` is bounded on the wire, but the stored value
 * it accumulates onto is not, and rows written before that bound existed carry it.
 */
describe("the pools stay inside the domain their schemas admit", () => {
  const amounts = fc.array(fc.integer({ min: -9_999, max: 9_999 }), {
    maxLength: 6,
  })

  it("no sequence of HP ops leaves vitals unparseable", () => {
    fc.assert(
      fc.property(arbitraryBoundedVitals, amounts, (vitals, sequence) => {
        const final = sequence.reduce(
          (current, amount) => ({
            ...current,
            ...value(
              amount >= 0
                ? applyDamage(current, amount)
                : applyHeal(current, -amount)
            ),
          }),
          vitals
        )
        expect(vitalsSchema.safeParse(final).success).toBe(true)
      })
    )
  })

  it("no sequence of SP ops leaves the skill pool unparseable", () => {
    fc.assert(
      fc.property(arbitraryBoundedSkillPool, amounts, (pool, sequence) => {
        const final = sequence.reduce(
          (current, amount) => ({
            ...current,
            ...value(
              amount >= 0
                ? applySpendSP(current, amount)
                : applyRecoverSP(current, -amount)
            ),
          }),
          pool
        )
        expect(skillPoolSchema.safeParse(final).success).toBe(true)
      })
    )
  })

  it("saturates rather than escaping the boundary", () => {
    expect(
      value(applyDamage({ base: 100, damage: Number.MAX_SAFE_INTEGER }, 9_999))
        .damage
    ).toBe(Number.MAX_SAFE_INTEGER)
    expect(
      value(applyDamage({ base: 100, damage: Number.MIN_SAFE_INTEGER }, -9_999))
        .damage
    ).toBe(Number.MIN_SAFE_INTEGER)
    expect(
      value(applySpendSP({ base: 30, spSpent: Number.MAX_SAFE_INTEGER }, 9_999))
        .spSpent
    ).toBe(Number.MAX_SAFE_INTEGER)
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

  /** The wholesale per-key assignment the patch's contract asks of every caller. */
  const rest = (components: RestComponents): RestComponents => ({
    ...components,
    ...applyFullRest(components),
  })

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
