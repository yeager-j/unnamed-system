import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { arbitraryEffect } from "@workspace/game-v2/__fixtures__/arbitraries/resolve-context"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import {
  EFFECT_CONTRIBUTORS,
  orderEffectPool,
  stampEffects,
  type EffectContributor,
} from "@workspace/game-v2/resolve/effect-pool"

/**
 * **The C6 contributor order as law** (UNN-599). `resolveEntity` used to assemble
 * the delta-effect pool in `mechanic → skill → equipment → context` order by
 * array-literal position, guarded by a normative comment. That order is now a
 * declared rank ({@link orderEffectPool}); these properties are the comment made
 * executable.
 *
 * Scope note: the invariance is over the order the **four contributor channels**
 * are assembled — the exact thing the comment guarded ("reordering the four
 * spreads breaks it silently"). A full per-effect shuffle is deliberately *not*
 * the claim: within one contributor, input order is the parity-frozen `sources[]`
 * order, so the sort is **stable**, not total.
 */

/** One arbitrary effect array per contributor — the four channels' contributions. */
const arbitraryGroups: fc.Arbitrary<
  Record<EffectContributor, CombatantEffect[]>
> = fc
  .tuple(
    fc.array(arbitraryEffect, { maxLength: 5 }),
    fc.array(arbitraryEffect, { maxLength: 5 }),
    fc.array(arbitraryEffect, { maxLength: 5 }),
    fc.array(arbitraryEffect, { maxLength: 5 })
  )
  .map(([mechanic, skill, equipment, context]) => ({
    mechanic,
    skill,
    equipment,
    context,
  }))

/** A permutation of the four contributors — the order the channels are assembled. */
const arbitraryAssemblyOrder = fc.shuffledSubarray([...EFFECT_CONTRIBUTORS], {
  minLength: EFFECT_CONTRIBUTORS.length,
  maxLength: EFFECT_CONTRIBUTORS.length,
})

/** Stamp + assemble the channels in a given order, then order the pool. */
function assemble(
  groups: Record<EffectContributor, CombatantEffect[]>,
  order: readonly EffectContributor[]
): CombatantEffect[] {
  return orderEffectPool(
    order.flatMap((contributor) =>
      stampEffects(contributor, groups[contributor])
    )
  )
}

describe("effect pool — the C6 contributor order is data, not array position", () => {
  it("is invariant to the order the four channels are assembled (permutation invariance)", () => {
    fc.assert(
      fc.property(arbitraryGroups, arbitraryAssemblyOrder, (groups, order) => {
        expect(assemble(groups, order)).toStrictEqual(
          assemble(groups, EFFECT_CONTRIBUTORS)
        )
      })
    )
  })

  it("orders by declared rank, stably — the pool is a function of rank only (display determinism)", () => {
    const rankOrdered = (
      groups: Record<EffectContributor, CombatantEffect[]>
    ) => EFFECT_CONTRIBUTORS.flatMap((contributor) => groups[contributor])

    fc.assert(
      fc.property(arbitraryGroups, arbitraryAssemblyOrder, (groups, order) => {
        expect(assemble(groups, order)).toStrictEqual(rankOrdered(groups))
      })
    )
  })
})
