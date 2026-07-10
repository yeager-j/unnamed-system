import fc from "fast-check"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import {
  BONUS_TARGET_KEYS,
  type CombatantEffect,
} from "@workspace/game-v2/kernel/effects.schema"
import {
  AFFINITIES,
  AFFINITY_DAMAGE_TYPES,
  LINEAGES,
} from "@workspace/game-v2/kernel/vocab"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"

const arbitraryAttributeEffect = record({
  type: fc.constant("attribute" as const),
  target: fc.constantFrom(...BONUS_TARGET_KEYS),
  amount: fc.integer({ min: -5, max: 5 }),
})

const arbitraryAffinityEffect = record({
  type: fc.constant("affinity" as const),
  damageTypes: fc.uniqueArray(fc.constantFrom(...AFFINITY_DAMAGE_TYPES), {
    minLength: 1,
    maxLength: 3,
  }),
  affinity: fc.constantFrom(...AFFINITIES),
})

const arbitraryAttackRollEffect = record({
  type: fc.constant("attackRoll" as const),
  amount: fc.integer({ min: -3, max: 3 }),
})

const arbitraryDamageEffect = record({
  type: fc.constant("damage" as const),
  dice: record({
    count: fc.integer({ min: 1, max: 4 }),
    sides: fc.constantFrom(4, 6, 8, 10, 12),
  }),
})

/** Every arm of the effect union — each lands in exactly one place in the fold. */
export const arbitraryEffect: fc.Arbitrary<CombatantEffect> = fc.oneof(
  arbitraryAttributeEffect,
  arbitraryAffinityEffect,
  arbitraryAttackRollEffect,
  arbitraryDamageEffect
)

export const arbitraryPartyComposition = fc.dictionary(
  fc.constantFrom(...LINEAGES),
  fc.integer({ min: 0, max: 4 }),
  { maxKeys: 3, noNullPrototype: true }
)

/**
 * The off-entity inputs to a resolve. Defaults are inert, so an empty context is
 * the common case and must stay in the domain — hence `requiredKeys: []`.
 */
export const arbitraryResolveContext: fc.Arbitrary<ResolveContext> = record(
  {
    effects: fc.array(arbitraryEffect, { maxLength: 4 }),
    partyComposition: arbitraryPartyComposition,
  },
  { requiredKeys: [] }
)
