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
  it("merges the active form-swap mechanic's form; depletion carries, max moves (D9)", () => {
    // balanced L1: natural maxHP 20 / maxSP 50. damage 10 ⇒ 10/20; spSpent 12 ⇒ 38/50.
    const entity = makeDerivedEntity({ damage: 10, spSpent: 12 })
    expect(resolve(entity).components.vitals).toEqual({
      maxHP: 20,
      currentHP: 10,
    })

    const formed = applyActiveForm(shifterActive(bearForm), entity)
    const resolved = resolve(formed)

    // The bear's maxima move under the same authored damage/spSpent — no policy.
    expect(resolved.components.vitals).toEqual({ maxHP: 120, currentHP: 110 })
    expect(resolved.components.skillPool).toEqual({ maxSP: 40, currentSP: 28 })
    expect(resolved.components.affinities?.fire).toBe("weak")
  })

  it("no active form ⇒ the entity is returned unchanged (same ref)", () => {
    const entity = makeDerivedEntity({})
    expect(applyActiveForm(shifterActive(null), entity)).toBe(entity)
    expect(applyActiveForm(null, entity)).toBe(entity)
  })

  it("keeps Level but drops Path so the form's HP is absolute (D38/D39)", () => {
    // Without the form, a high-level health-focused PC has a large path-derived maxHP;
    // in form, maxHP is the bear's flat base — the path layer must not double-count.
    const entity = makeDerivedEntity({ level: 8, pathChoice: "health-focused" })
    const formed = applyActiveForm(shifterActive(bearForm), entity)
    expect(resolve(formed).components.vitals?.maxHP).toBe(120)
    // Level is kept on the formed entity (Insta-Kill + dice read it).
    expect(formed.components.level?.value).toBe(8)
    expect(formed.components.path).toBeUndefined()
  })
})
