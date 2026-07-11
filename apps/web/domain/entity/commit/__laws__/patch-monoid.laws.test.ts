import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { componentArbitraries } from "@workspace/game-v2/__fixtures__/arbitraries/components"
import { arbitraryEntity } from "@workspace/game-v2/__fixtures__/arbitraries/entity"
import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import { HOSTILE_VOCAB } from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"

import {
  combinePatches,
  mergeComponentPatch,
} from "@/domain/entity/commit/merge-patch"
import type { EntityWritePatch } from "@/domain/entity/commit/writers"
import {
  LIFTED_COMPONENT_KEYS,
  type LiftedComponentKey,
} from "@/domain/game-v2/entity-row-to-bag"

/**
 * **The patch monoid** — `(EntityWritePatch, combinePatches, {})` (UNN-601).
 *
 * `mergeComponentPatch` folds a patch onto an entity; `combinePatches` is the
 * composition that fold factors through. Until it existed the laws below were
 * not false but *inexpressible* — the first write-coalescing or multi-step
 * consumer would have rederived the merge semantics ad hoc. Three laws pin it:
 *
 * - **Identity**: `combine(p, {}) = p = combine({}, p)`
 * - **Associativity**: `combine(combine(a, b), c) = combine(a, combine(b, c))`
 * - **Merge-compatibility**: `merge(merge(e, a), b) = merge(e, combine(a, b))`
 *
 * The patches quantified over include every CH15 state per component key —
 * absent, explicit `undefined` (delete), and a whole component — so
 * merge-compatibility covers the delete-then-set and set-then-delete edges,
 * exactly where a hand-rolled conditional spread quietly disagrees with the
 * intended semantics (the negative control proves that disagreement is
 * observable). `toStrictEqual` is load-bearing here: it distinguishes an
 * undefined-valued key from an absent one, which IS the deletion semantics.
 *
 * Vocab is {@link HOSTILE_VOCAB}: patch composition is pure object algebra and
 * never consults a catalog, so the dangling-reference quantifier is strictly
 * stronger and costs nothing.
 */
type PatchKey = Exclude<keyof ComponentRegistry, LiftedComponentKey>

const LIFTED: ReadonlySet<string> = new Set(LIFTED_COMPONENT_KEYS)

const patchModel = Object.fromEntries(
  Object.entries(componentArbitraries)
    .filter(([key]) => !LIFTED.has(key))
    .map(([key, make]) => [
      key,
      // Not `fc.option` — its `nil` default is `null`, which is outside the
      // patch domain (a component is whole or the key is an explicit-undefined
      // delete; NULL exists only in the column projection).
      fc.oneof(make(HOSTILE_VOCAB), fc.constant(undefined)),
    ])
) as { [K in PatchKey]: fc.Arbitrary<ComponentRegistry[K] | undefined> }

/** Every key independently absent / explicit-`undefined` / a whole component. */
const arbitraryEntityWritePatch: fc.Arbitrary<EntityWritePatch> = record(
  patchModel,
  { requiredKeys: [] }
)

describe("combinePatches is a monoid", () => {
  it("has the empty patch as identity", () => {
    fc.assert(
      fc.property(arbitraryEntityWritePatch, (patch) => {
        expect(combinePatches(patch, {})).toStrictEqual(patch)
        expect(combinePatches({}, patch)).toStrictEqual(patch)
      })
    )
  })

  it("is associative", () => {
    fc.assert(
      fc.property(
        arbitraryEntityWritePatch,
        arbitraryEntityWritePatch,
        arbitraryEntityWritePatch,
        (a, b, c) => {
          expect(combinePatches(combinePatches(a, b), c)).toStrictEqual(
            combinePatches(a, combinePatches(b, c))
          )
        }
      )
    )
  })
})

describe("combinePatches is merge-compatible", () => {
  it("merging two patches in sequence equals merging their combination", () => {
    fc.assert(
      fc.property(
        arbitraryEntity(),
        arbitraryEntityWritePatch,
        arbitraryEntityWritePatch,
        (entity, a, b) => {
          expect(
            mergeComponentPatch(entity, combinePatches(a, b))
          ).toStrictEqual(
            mergeComponentPatch(mergeComponentPatch(entity, a), b)
          )
        }
      )
    )
  })
})

/**
 * **The negative control** — a test of the test, aimed at the exact edge the
 * law exists for. `brokenCombine` strips explicit-`undefined` keys, which is
 * precisely what the retired Writer-arm hand-spread pattern
 * (`...(patch.vitals && { vitals: … })`) does to a deletion: the delete
 * silently vanishes from the composed patch. The scenario is shaped so the
 * disagreement is guaranteed — the entity carries `vitals`, patch `a` deletes
 * it, patch `b` never resurrects it — and the same property must pass for the
 * real combine and fail for the broken one.
 */
type Combine = (a: EntityWritePatch, b: EntityWritePatch) => EntityWritePatch

const brokenCombine: Combine = (a, b) =>
  Object.fromEntries(
    Object.entries({ ...a, ...b }).filter(([, value]) => value !== undefined)
  )

function deletionSurvivesComposition(combine: Combine) {
  return fc.property(
    arbitraryEntity({ require: ["vitals"] }),
    arbitraryEntityWritePatch.map((a) => ({ ...a, vitals: undefined })),
    arbitraryEntityWritePatch.map(({ vitals: _resurrect, ...b }) => b),
    (entity, a, b) => {
      expect(mergeComponentPatch(entity, combine(a, b))).toStrictEqual(
        mergeComponentPatch(mergeComponentPatch(entity, a), b)
      )
    }
  )
}

describe("negative control: a combine that drops explicit-undefined keys", () => {
  it("the real combine passes", () => {
    expect(fc.check(deletionSurvivesComposition(combinePatches)).failed).toBe(
      false
    )
  })

  it("the broken combine fails — the deletion is lost", () => {
    const result = fc.check(deletionSurvivesComposition(brokenCombine))

    expect(result.failed).toBe(true)

    const [entity, a] = result.counterexample ?? []
    if (entity === undefined || a === undefined) {
      throw new Error("a failing property must report a counterexample")
    }
    expect(entity.components.vitals).toBeDefined()
    expect("vitals" in a && a.vitals === undefined).toBe(true)
  })
})
