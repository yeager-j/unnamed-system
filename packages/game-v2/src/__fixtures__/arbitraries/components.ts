import fc from "fast-check"

import { arbitraryMechanics } from "@workspace/game-v2/__fixtures__/arbitraries/mechanic-state"
import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import {
  arbitraryKey,
  arbitrarySlug,
  type CatalogVocab,
} from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import { MAX_CURRENCY } from "@workspace/game-v2/items/equipment.schema"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import { AFFINITIES } from "@workspace/game-v2/kernel/vocab/affinity"
import { PATH_CHOICES } from "@workspace/game-v2/kernel/vocab/path"
import { VIRTUE_KEYS } from "@workspace/game-v2/kernel/vocab/virtues"
import { MAX_EXHAUSTION_LEVEL } from "@workspace/game-v2/resources/exhaustion.schema"
import {
  MAX_VIRTUE_RANK,
  SPARK_LOG_CAPACITY,
} from "@workspace/game-v2/virtues/virtues.schema"

/**
 * One fast-check arbitrary per authored component, keyed by the registry.
 *
 * ## Why the map is total
 *
 * Typed as a mapped type over the **whole** {@link ComponentRegistry}, exactly as
 * `kernel/load-seam.ts` types its schema map: a future PR that adds a registry key
 * without an arbitrary is a **compile error**, so `arbitraryEntity` can never
 * silently stop generating a component. That is what makes "quantified over the
 * bag space" a structural claim rather than a hope — a component nobody generates
 * is a component no law covers.
 *
 * Every arbitrary emits a value that is already a **fixed point of its load
 * schema**: defaulted fields are always present, optional fields are absent rather
 * than `undefined`. A generated bag therefore survives `loadEntity` and a jsonb
 * round-trip unchanged, which `arbitraries.test.ts` pins as a meta-property.
 */
type ComponentArbitraries = {
  [K in keyof ComponentRegistry]: (
    vocab: CatalogVocab
  ) => fc.Arbitrary<ComponentRegistry[K]>
}

/** Signed integers small enough to read in a counterexample, wide enough to cross every clamp. */
const smallInt = fc.integer({ min: -20, max: 40 })
const poolBase = fc.integer({ min: 0, max: 200 })

/**
 * A depletion field spans a readable everyday band **and** the edges of its real
 * domain — `z.number().int()` accepts exactly the safe integers, and a row already
 * sitting near that boundary is the state where one more schema-valid write used to
 * push the stored value out of the domain and brick the row for good. Generating
 * only the comfortable band would leave that case unquantified while the law
 * reported green.
 */
function depletion(min: number): fc.Arbitrary<number> {
  const floor = Math.max(min, Number.MIN_SAFE_INTEGER)
  return fc.oneof(
    { weight: 9, arbitrary: fc.integer({ min: Math.max(min, -50), max: 200 }) },
    {
      weight: 1,
      arbitrary: fc.constantFrom(
        floor,
        floor + 1,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER - 1
      ),
    }
  )
}

/** Signed: negative `damage` is over-max HP, the Usury loan. SP has no such rule. */
const damage = depletion(Number.MIN_SAFE_INTEGER)
const spSpent = depletion(0)

const arbitraryAffinity = fc.constantFrom(...AFFINITIES)
const arbitraryProse = fc.option(fc.string({ maxLength: 40 }), { nil: null })

/** The authored chart: every chartable damage type, each independently absent. */
const arbitraryPartialAffinityChart = record(
  {
    slash: arbitraryAffinity,
    pierce: arbitraryAffinity,
    strike: arbitraryAffinity,
    fire: arbitraryAffinity,
    ice: arbitraryAffinity,
    wind: arbitraryAffinity,
    elec: arbitraryAffinity,
    soul: arbitraryAffinity,
    mind: arbitraryAffinity,
    light: arbitraryAffinity,
    dark: arbitraryAffinity,
  },
  { requiredKeys: [] }
)

const arbitraryIdentityBeat = record({
  title: fc.string({ maxLength: 24 }),
  description: fc.option(fc.string({ maxLength: 40 }), { nil: null }),
})

const arbitraryInheritanceSlot = record({
  slotIndex: fc.integer({ min: 0, max: 3 }),
  sourceArchetypeKey: fc.option(arbitrarySlug, { nil: null }),
  skillKey: fc.option(arbitrarySlug, { nil: null }),
})

export const componentArbitraries: ComponentArbitraries = {
  identity: () => record({ name: fc.string({ maxLength: 24 }) }),

  presentation: () =>
    record({ portraitUrl: fc.webUrl() }, { requiredKeys: [] }),

  attributes: () =>
    record({
      base: record({
        strength: smallInt,
        magic: smallInt,
        agility: smallInt,
        luck: smallInt,
      }),
    }),

  affinities: () => record({ base: arbitraryPartialAffinityChart }),

  vitals: () => record({ base: poolBase, damage }),

  skillPool: () => record({ base: poolBase, spSpent }),

  skills: (vocab) =>
    fc.array(
      vocab.inlineSkills.length > 0
        ? fc.oneof(
            arbitrarySkillRef(vocab),
            record({
              kind: fc.constant("inline" as const),
              skill: fc.constantFrom(...vocab.inlineSkills),
            })
          )
        : arbitrarySkillRef(vocab),
      { maxLength: 4 }
    ),

  talents: (vocab) =>
    fc.uniqueArray(record({ key: arbitraryKey(vocab.talentKeys) }), {
      selector: (talent) => talent.key,
      maxLength: 4,
    }),

  level: () =>
    record({
      value: fc.integer({ min: 1, max: 30 }),
      victories: fc.integer({ min: 0, max: 12 }),
    }),

  path: () => record({ choice: fc.constantFrom(...PATH_CHOICES) }),

  manualBonuses: () =>
    record(
      {
        hp: smallInt,
        sp: smallInt,
        strength: smallInt,
        magic: smallInt,
        agility: smallInt,
        luck: smallInt,
      },
      { requiredKeys: [] }
    ),

  archetypes: (vocab) =>
    fc
      .uniqueArray(
        record({
          key: arbitraryKey(vocab.archetypeKeys),
          rank: fc.integer({ min: 1, max: 5 }),
          inheritanceSlots: fc.array(arbitraryInheritanceSlot, {
            maxLength: 2,
          }),
        }),
        { selector: (entry) => entry.key, maxLength: 3 }
      )
      .chain((roster) => {
        // `active`/`origin` reference the roster far more often than not — an
        // entity whose active Archetype it doesn't own resolves no archetype
        // layer at all, which would starve the fold of its most interesting path.
        const rosterKey =
          roster.length > 0
            ? fc.constantFrom(...roster.map((entry) => entry.key))
            : arbitraryKey(vocab.archetypeKeys)
        const reference = fc.option(
          fc.oneof(
            { weight: 4, arbitrary: rosterKey },
            { weight: 1, arbitrary: arbitraryKey(vocab.archetypeKeys) }
          ),
          { nil: null, freq: 5 }
        )
        return record({
          active: reference,
          origin: reference,
          savedArchetypeRanks: fc.integer({ min: 0, max: 3 }),
          roster: fc.constant(roster),
        })
      }),

  resources: () =>
    record({
      hitDiceUsed: fc.integer({ min: 0, max: 8 }),
      skillDiceUsed: fc.integer({ min: 0, max: 12 }),
      prismaUsed: fc.integer({ min: 0, max: 3 }),
    }),

  exhaustion: () =>
    record({ level: fc.integer({ min: 0, max: MAX_EXHAUSTION_LEVEL }) }),

  mechanics: () => arbitraryMechanics,

  equipment: (vocab) =>
    record({
      items: fc.uniqueArray(
        record({
          id: arbitrarySlug,
          catalogItemKey: arbitraryKey(vocab.itemKeys),
          equipped: fc.boolean(),
          quantity: fc.integer({ min: 1, max: 9 }),
        }),
        { selector: (item) => item.id, maxLength: 4 }
      ),
      currency: fc.integer({ min: 0, max: MAX_CURRENCY }),
    }),

  virtues: () =>
    record({
      ranks: record({
        expression: fc.integer({ min: 0, max: MAX_VIRTUE_RANK }),
        empathy: fc.integer({ min: 0, max: MAX_VIRTUE_RANK }),
        wisdom: fc.integer({ min: 0, max: MAX_VIRTUE_RANK }),
        focus: fc.integer({ min: 0, max: MAX_VIRTUE_RANK }),
      }),
      sparkLog: fc.array(fc.constantFrom(...VIRTUE_KEYS), {
        maxLength: SPARK_LOG_CAPACITY,
      }),
    }),

  narrative: () =>
    record({
      ancestry: arbitraryProse,
      background: arbitraryProse,
      backstory: arbitraryProse,
      personality: arbitraryProse,
      hopes: arbitraryProse,
      dreams: arbitraryProse,
      fears: arbitraryProse,
      secrets: arbitraryProse,
      knives: fc.array(arbitraryIdentityBeat, { maxLength: 3 }),
      chains: fc.array(arbitraryIdentityBeat, { maxLength: 3 }),
    }),
}

function arbitrarySkillRef(vocab: CatalogVocab) {
  return record({
    kind: fc.constant("ref" as const),
    key: arbitraryKey(vocab.skillKeys),
  })
}
