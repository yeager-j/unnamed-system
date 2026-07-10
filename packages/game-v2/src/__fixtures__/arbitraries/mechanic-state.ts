import fc from "fast-check"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import {
  MECHANIC_KINDS,
  type MechanicKind,
} from "@workspace/game-v2/kernel/vocab/mechanics"
import { FRENZY_PAIN_MAX } from "@workspace/game-v2/mechanics/berserker/frenzy"
import { VALOR_MAX } from "@workspace/game-v2/mechanics/knight/valor"
import {
  STAIN_ELEMENTS,
  STAIN_SLOT_COUNT,
} from "@workspace/game-v2/mechanics/mage/stains"
import type {
  Mechanics,
  MechanicState,
} from "@workspace/game-v2/mechanics/mechanics.schema"
import { PERFECTION_MAX_RANK } from "@workspace/game-v2/mechanics/warrior/perfection"

/**
 * One arbitrary per persisted mechanic state, keyed by `MechanicKind`. Total over
 * the vocab, so a mechanic added to `MECHANIC_KINDS` without an arbitrary here is
 * a **compile error** — the same structural trick `load-seam.ts` uses for its
 * schema map. Each arbitrary emits its own literal `kind`, which is what lets
 * {@link arbitraryMechanics} satisfy the component's `states[k].kind === k` refine.
 */
type MechanicStateArbitraries = {
  [K in MechanicKind]: fc.Arbitrary<Extract<MechanicState, { kind: K }>>
}

const byKind: MechanicStateArbitraries = {
  perfection: record({
    kind: fc.constant("perfection" as const),
    rank: fc.integer({ min: 0, max: PERFECTION_MAX_RANK }),
  }),
  valor: record({
    kind: fc.constant("valor" as const),
    value: fc.integer({ min: 0, max: VALOR_MAX }),
  }),
  "path-of-dawn": record({
    kind: fc.constant("path-of-dawn" as const),
    dawnMode: fc.boolean(),
  }),
  "path-of-dusk": record({
    kind: fc.constant("path-of-dusk" as const),
    duskMode: fc.boolean(),
  }),
  stains: record({
    kind: fc.constant("stains" as const),
    tokens: fc.array(fc.constantFrom(...STAIN_ELEMENTS, null), {
      minLength: STAIN_SLOT_COUNT,
      maxLength: STAIN_SLOT_COUNT,
    }),
  }),
  "thiefs-insight": record({ kind: fc.constant("thiefs-insight" as const) }),
  "elemental-larceny": record({
    kind: fc.constant("elemental-larceny" as const),
  }),
  enchantment: record({ kind: fc.constant("enchantment" as const) }),
  frenzy: record({
    kind: fc.constant("frenzy" as const),
    pain: fc.integer({ min: 0, max: FRENZY_PAIN_MAX }),
    frenzyMode: fc.boolean(),
  }),
}

/** The `Mechanics` component: a subset of the vocab, each key holding its own state. */
export const arbitraryMechanics: fc.Arbitrary<Mechanics> = fc
  .uniqueArray(fc.constantFrom(...MECHANIC_KINDS), { maxLength: 3 })
  .chain((kinds) =>
    fc
      .tuple(...kinds.map((kind): fc.Arbitrary<MechanicState> => byKind[kind]))
      .map((generated) => {
        const states: Mechanics["states"] = {}
        kinds.forEach((kind, index) => {
          states[kind] = generated[index]
        })
        return { states }
      })
  )
