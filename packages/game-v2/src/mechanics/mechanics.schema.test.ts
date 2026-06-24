import { describe, expect, it } from "vitest"

import { MECHANIC_KINDS } from "@workspace/game-v2/kernel/vocab/mechanics"
import {
  mechanicsSchema,
  mechanicStateSchema,
} from "@workspace/game-v2/mechanics/mechanics.schema"

/**
 * The persisted mechanic-state union (assembled from the per-mechanic modules) and
 * the `Mechanics` component. The union is the run-time contract at the jsonb
 * boundary; these assert its discriminants cover the vocab and that its bounds hold.
 */
describe("mechanicStateSchema", () => {
  it("accepts a minimal valid state for every mechanic kind, covering the vocab", () => {
    const states = [
      { kind: "perfection", rank: 0 },
      { kind: "valor", value: 0 },
      { kind: "path-of-dawn", dawnMode: false },
      { kind: "path-of-dusk", duskMode: false },
      { kind: "stains", tokens: [null, null, null, null] },
      { kind: "thiefs-insight" },
      { kind: "elemental-larceny" },
      { kind: "enchantment" },
      { kind: "frenzy", pain: 0, frenzyMode: false },
    ] as const

    for (const state of states) {
      expect(mechanicStateSchema.safeParse(state).success).toBe(true)
    }
    // every vocab kind has a representative above (no drift between the two)
    expect(new Set(states.map((s) => s.kind))).toEqual(new Set(MECHANIC_KINDS))
  })

  it("rejects out-of-range numeric state", () => {
    expect(
      mechanicStateSchema.safeParse({ kind: "perfection", rank: 99 }).success
    ).toBe(false)
    expect(
      mechanicStateSchema.safeParse({ kind: "valor", value: 99 }).success
    ).toBe(false)
    expect(
      mechanicStateSchema.safeParse({
        kind: "frenzy",
        pain: -1,
        frenzyMode: false,
      }).success
    ).toBe(false)
  })

  it("rejects a Stains token list of the wrong length or an unknown element", () => {
    expect(
      mechanicStateSchema.safeParse({ kind: "stains", tokens: [null, null] })
        .success
    ).toBe(false)
    expect(
      mechanicStateSchema.safeParse({
        kind: "stains",
        tokens: ["dark", null, null, null],
      }).success
    ).toBe(false)
  })

  it("rejects an unknown discriminant", () => {
    expect(mechanicStateSchema.safeParse({ kind: "mystery" }).success).toBe(
      false
    )
  })
})

/**
 * The `Mechanics` component is a **partial** record keyed by mechanic `kind`:
 * presence = the entity owns that mechanic.
 */
describe("mechanicsSchema", () => {
  it("defaults `states` to empty so a pre-component row loads", () => {
    expect(mechanicsSchema.parse({}).states).toEqual({})
  })

  it("accepts a partial record — only owned mechanics present", () => {
    const parsed = mechanicsSchema.parse({
      states: { valor: { kind: "valor", value: 3 } },
    })
    expect(parsed.states.valor).toEqual({ kind: "valor", value: 3 })
    expect(parsed.states.perfection).toBeUndefined()
  })

  it("rejects a state whose shape is invalid", () => {
    expect(
      mechanicsSchema.safeParse({
        states: { valor: { kind: "valor", value: 99 } },
      }).success
    ).toBe(false)
  })
})
