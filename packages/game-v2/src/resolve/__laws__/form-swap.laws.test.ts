import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { arbitraryEntity } from "@workspace/game-v2/__fixtures__/arbitraries/entity"
import { LAW_VOCAB } from "@workspace/game-v2/__fixtures__/arbitraries/law-catalog"
import {
  HOSTILE_VOCAB,
  type CatalogVocab,
} from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  applyForm,
  FORM_SWAP_POLICY,
} from "@workspace/game-v2/resolve/form-swap-policy"

/**
 * **Survival** (UNN-600). The doctrine — "a form is a body; you bring your mind,
 * your wounds, and your capacity" — quantified: for *every* component K, *every*
 * entity, *every* form bag, K's presence and value after the swap match K's
 * declared {@link FORM_SWAP_POLICY} row. Example tests check the rows someone
 * thought of; this ranges over ~2^18 × 2^18 bag pairs, so a fold that iterates
 * the wrong key set, aliases a bag, or lets an undeclared component slip through
 * the merge is found rather than remembered.
 *
 * The property restates the policy *semantics* independently of the fold's
 * mechanics; the negative control below proves the restatement bites by aiming
 * it at the retired last-write-wins merge and requiring a counterexample.
 */

type ApplyFormImpl = (entity: Entity, form: Entity["components"]) => Entity

const COMPONENT_KEYS = Object.keys(FORM_SWAP_POLICY) as Array<
  keyof ComponentRegistry
>

const arbitraryFormBag = (vocab: CatalogVocab) =>
  arbitraryEntity({ vocab }).map((entity) => entity.components)

function survivalMatchesPolicy(impl: ApplyFormImpl, vocab: CatalogVocab) {
  return fc.property(
    arbitraryEntity({ vocab }),
    arbitraryFormBag(vocab),
    (entity, form) => {
      const formed = impl(entity, form)
      for (const key of COMPONENT_KEYS) {
        const own = entity.components[key]
        const formValue = form[key]
        const got = formed.components[key]
        switch (FORM_SWAP_POLICY[key]) {
          case "keep":
            expect({ key, got }).toEqual({ key, got: own })
            break
          case "override":
            expect({ key, got }).toEqual({ key, got: formValue ?? own })
            break
          case "replace":
            expect({ key, got }).toEqual({ key, got: formValue })
            break
          case "detach":
            expect({ key, got }).toEqual({
              key,
              got: own === undefined ? undefined : { ...own, active: null },
            })
            break
        }
      }
    }
  )
}

describe.each([
  { tier: "referential", vocab: LAW_VOCAB },
  { tier: "hostile", vocab: HOSTILE_VOCAB },
])("form-swap laws over $tier bags", ({ vocab }) => {
  it("survival: every component's presence and value after a swap match its declared policy", () => {
    fc.assert(survivalMatchesPolicy(applyForm, vocab))
  })

  it("depletion round-trip: damage/spSpent survive any sequence of swaps", () => {
    fc.assert(
      fc.property(
        arbitraryEntity({ vocab }),
        fc.array(arbitraryFormBag(vocab), { minLength: 1, maxLength: 3 }),
        (entity, forms) => {
          const final = forms.reduce(applyForm, entity)
          expect(final.components.vitals).toEqual(entity.components.vitals)
          expect(final.components.skillPool).toEqual(
            entity.components.skillPool
          )
        }
      )
    )
  })

  it("the entity id is stable across any swap", () => {
    fc.assert(
      fc.property(
        arbitraryEntity({ vocab }),
        arbitraryFormBag(vocab),
        (entity, form) => {
          expect(applyForm(entity, form).id).toBe(entity.id)
        }
      )
    )
  })
})

describe("negative control — the survival property can go red", () => {
  /**
   * The retired pre-UNN-600 merge: last-write-wins over the whole bag. The
   * exact "simplification" a reviewer might reach for — and the silent-
   * inheritance behavior the policy table exists to kill.
   */
  const lastWriteWins: ApplyFormImpl = (entity, form) => ({
    id: entity.id,
    components: { ...entity.components, ...form },
  })

  it("fails for the last-write-wins merge", () => {
    const result = fc.check(survivalMatchesPolicy(lastWriteWins, LAW_VOCAB))
    expect(result.failed).toBe(true)
  })
})
