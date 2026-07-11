import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import { MECHANIC_KINDS } from "@workspace/game-v2/kernel/vocab/mechanics"
import {
  bearForm,
  shifterActive,
} from "@workspace/game-v2/mechanics/__fixtures__/shifter"
import {
  assertAtMostOneActiveForm,
  getActiveMechanics,
  type ActiveMechanic,
} from "@workspace/game-v2/mechanics/active-mechanic"
import { initialStateFor } from "@workspace/game-v2/mechanics/registry"
import { perfection } from "@workspace/game-v2/mechanics/warrior/perfection"
import { makeTestGameData } from "@workspace/game-v2/resolve/__fixtures__/derive"

const deps = makeTestGameData()

/** A form-swap mechanic (its `activeForm` returns a bag) under an arbitrary kind. */
function formMechanic(kind: ActiveMechanic["kind"]): ActiveMechanic {
  return { ...shifterActive(bearForm), kind }
}

/** A non-form active mechanic (Perfection declares no `activeForm`). */
const perfectionActive: ActiveMechanic = {
  kind: "perfection",
  state: perfection.initialState(),
  definition: perfection,
}

describe("assertAtMostOneActiveForm — the ≤ 1 active form-swap invariant", () => {
  it("throws when two active mechanics both carry a form", () => {
    expect(() =>
      assertAtMostOneActiveForm([
        formMechanic("perfection"),
        formMechanic("valor"),
      ])
    ).toThrow(/at most one/i)
  })

  it("does not throw for zero, one, or a non-form active mechanic", () => {
    expect(() => assertAtMostOneActiveForm([])).not.toThrow()
    expect(() =>
      assertAtMostOneActiveForm([formMechanic("perfection")])
    ).not.toThrow()
    expect(() =>
      assertAtMostOneActiveForm([perfectionActive, formMechanic("valor")])
    ).not.toThrow()
  })
})

describe("getActiveMechanics — canonical ordering", () => {
  it("returns an enemy's mechanics in MECHANIC_KINDS order, not states-map insertion order", () => {
    // Inserted in reverse-canonical order; canonical rank is perfection(0) < valor(1) < frenzy(8).
    const enemy: Entity = {
      id: "enemy",
      components: {
        mechanics: {
          states: {
            frenzy: initialStateFor("frenzy"),
            valor: initialStateFor("valor"),
            perfection: initialStateFor("perfection"),
          },
        },
      },
    }

    const kinds = getActiveMechanics(deps, enemy).map(
      (mechanic) => mechanic.kind
    )
    expect(kinds).toEqual(["perfection", "valor", "frenzy"])
    // Sanity: the expected order is exactly the MECHANIC_KINDS-ranked subset.
    expect(kinds).toEqual(MECHANIC_KINDS.filter((kind) => kinds.includes(kind)))
  })
})
