import { describe, expect, it } from "vitest"

import { MECHANIC_KINDS } from "@workspace/game-v2/kernel/vocab/mechanics"
import {
  getMechanic,
  getTypedMechanic,
  initialStateFor,
  mechanicEffectsFor,
  MECHANICS,
} from "@workspace/game-v2/mechanics/registry"

/** G — the registry: every kind registered once, total lookups, safe misses. */
describe("mechanics registry", () => {
  it("registers exactly the nine MVP mechanics, each once", () => {
    const kinds = MECHANICS.map((m) => m.kind)
    expect(kinds).toHaveLength(MECHANIC_KINDS.length)
    expect(new Set(kinds)).toEqual(new Set(MECHANIC_KINDS))
  })

  it("getMechanic returns the definition for a known kind, undefined otherwise", () => {
    expect(getMechanic("valor")?.kind).toBe("valor")
    expect(getMechanic("nope")).toBeUndefined()
  })

  it("getTypedMechanic returns the per-state definition", () => {
    expect(getTypedMechanic("perfection").initialState()).toEqual({
      kind: "perfection",
      rank: 0,
    })
  })

  it("initialStateFor returns a kind-tagged initial state, undefined for an unknown key", () => {
    expect(initialStateFor("frenzy")).toEqual({
      kind: "frenzy",
      pain: 0,
      frenzyMode: false,
    })
    expect(initialStateFor("nope")).toBeUndefined()
  })

  it("mechanicEffectsFor returns [] for an unknown key and for an effectless mechanic", () => {
    expect(mechanicEffectsFor("nope", { kind: "valor", value: 7 })).toEqual([])
    expect(
      mechanicEffectsFor("path-of-dawn", {
        kind: "path-of-dawn",
        dawnMode: true,
      })
    ).toEqual([])
  })

  it("mechanicEffectsFor delegates to an emitting mechanic", () => {
    expect(mechanicEffectsFor("valor", { kind: "valor", value: 4 })).toEqual([
      {
        type: "affinity",
        damageTypes: ["slash", "pierce", "strike"],
        affinity: "resist",
        source: "Valor (4)",
      },
    ])
  })

  it("only the three effects-emitters expose an effects method", () => {
    const emitters = MECHANICS.filter((m) => m.effects).map((m) => m.kind)
    expect(new Set(emitters)).toEqual(
      new Set(["perfection", "valor", "frenzy"])
    )
  })

  it("every MVP mechanic resets on encounter and declares no form (form-swap is post-MVP)", () => {
    for (const mechanic of MECHANICS) {
      expect(mechanic.resetOn).toBe("encounter")
      expect(mechanic.activeForm).toBeUndefined()
    }
  })
})
