import { describe, expect, it } from "vitest"

import type { Mechanics } from "@workspace/game-v2/mechanics/mechanics.schema"
import { sweepEncounterEnd } from "@workspace/game-v2/mechanics/reset"

describe("sweepEncounterEnd", () => {
  it("resets every encounter-reset mechanic to its initial state", () => {
    const swept = sweepEncounterEnd({
      states: {
        valor: { kind: "valor", value: 5 },
        perfection: { kind: "perfection", rank: 3 },
        frenzy: { kind: "frenzy", pain: 4, frenzyMode: true },
        stains: { kind: "stains", tokens: ["fire", "ice", null, null] },
      },
    })
    expect(swept.states.valor).toEqual({ kind: "valor", value: 0 })
    expect(swept.states.perfection).toEqual({ kind: "perfection", rank: 0 })
    expect(swept.states.frenzy).toEqual({
      kind: "frenzy",
      pain: 0,
      frenzyMode: false,
    })
    expect(swept.states.stains).toEqual({
      kind: "stains",
      tokens: [null, null, null, null],
    })
  })

  it("preserves a state whose mechanic does not reset on encounter", () => {
    // No MVP mechanic uses resetOn rest/never, so exercise the survive branch with
    // a state whose key the registry doesn't resolve (a since-removed mechanic) —
    // the same `resetOn !== "encounter"` path. It must be carried through, not reset.
    const states = {
      valor: { kind: "valor", value: 5 },
    } as Mechanics["states"]
    const legacy = { kind: "valor", value: 2 }
    ;(states as Record<string, unknown>)["legacy"] = legacy

    const swept = sweepEncounterEnd({ states })
    expect(swept.states.valor).toEqual({ kind: "valor", value: 0 })
    expect((swept.states as Record<string, unknown>)["legacy"]).toBe(legacy)
  })

  it("is a no-op (same ref) when every encounter mechanic is already at its initial state", () => {
    const mechanics = {
      states: {
        valor: { kind: "valor", value: 0 },
        perfection: { kind: "perfection", rank: 0 },
      },
    } satisfies Mechanics
    expect(sweepEncounterEnd(mechanics)).toBe(mechanics)
  })

  it("is a no-op (same ref) on an empty states map", () => {
    const mechanics = { states: {} } satisfies Mechanics
    expect(sweepEncounterEnd(mechanics)).toBe(mechanics)
  })
})
