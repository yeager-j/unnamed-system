import { describe, expect, it } from "vitest"

import {
  bearForm,
  shifterActive,
} from "@workspace/game-v2/mechanics/__fixtures__/shifter"
import {
  makeDerivedEntity,
  makeTestGameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"
import { createResolve } from "@workspace/game-v2/resolve/resolve"
import { applyActiveForm } from "@workspace/game-v2/resolve/resolve-entity"

/**
 * The form-swap SEAM (UNN-502 / D38): a form-swap mechanic's `activeForm` →
 * `applyActiveForm` (the pre-resolve transform) → `applyForm` → `resolve`. Drives
 * PR3's bear-form continuity assertions, now sourced from the mechanic hook rather
 * than a literal — proving the wiring that the imminent Shapechanger plugs into.
 */
const resolve = createResolve(makeTestGameData())

describe("applyActiveForm — the form-swap pre-resolve transform", () => {
  it("merges the active form-swap mechanic's form: the statline changes, the bar doesn't (UNN-600)", () => {
    // balanced L1: natural maxHP 20 / maxSP 50. damage 10 ⇒ 10/20; spSpent 12 ⇒ 38/50.
    const entity = makeDerivedEntity({ damage: 10, spSpent: 12 })

    const formed = applyActiveForm(shifterActive(bearForm), entity)
    const resolved = resolve(formed)

    // Capacity is the self: the bear wears your bar, wounds and all.
    expect(resolved.components.vitals).toEqual({ maxHP: 20, currentHP: 10 })
    expect(resolved.components.skillPool).toEqual({ maxSP: 50, currentSP: 38 })
    // The body is the bear's: its statline and affinities apply.
    expect(resolved.components.attributes?.strength).toBe(6)
    expect(resolved.components.affinities?.fire).toBe("weak")
  })

  it("no active form ⇒ the entity is returned unchanged (same ref)", () => {
    const entity = makeDerivedEntity({})
    expect(applyActiveForm(shifterActive(null), entity)).toBe(entity)
    expect(applyActiveForm(null, entity)).toBe(entity)
  })

  it("keeps Level AND Path — your capacity formula stays live in any body (UNN-600)", () => {
    // A high-level health-focused PC has a large path-derived maxHP; the form
    // doesn't touch it — same bar shifted or not.
    const entity = makeDerivedEntity({ level: 8, pathChoice: "health-focused" })
    const formed = applyActiveForm(shifterActive(bearForm), entity)
    expect(resolve(formed).components.vitals?.maxHP).toBe(
      resolve(entity).components.vitals?.maxHP
    )
    // Level is kept on the formed entity (Insta-Kill + dice read it).
    expect(formed.components.level?.value).toBe(8)
    expect(formed.components.path).toEqual({ choice: "health-focused" })
  })
})
