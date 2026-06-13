import { describe, expect, it } from "vitest"

import { makeStatContext } from "@workspace/game/engine/__fixtures__/character"
import {
  adjustPain,
  frenzy,
  setFrenzyMode,
} from "@workspace/game/engine/mechanics/berserker/frenzy"
import {
  FRENZY_PAIN_MAX,
  frenzyStateSchema,
  type FrenzyState,
} from "@workspace/game/foundation/mechanics/schema"

const baseStats = makeStatContext({
  activeArchetypeKey: "berserker",
  archetypes: [
    { key: "berserker", rank: 1, mastery: { kind: "hp", amount: 20 } },
  ],
})

const state = (pain: number, frenzyMode: boolean): FrenzyState => ({
  kind: "frenzy",
  pain,
  frenzyMode,
})

describe("frenzy", () => {
  it("starts at 0 Pain, not in Frenzy", () => {
    expect(frenzy.initialState()).toEqual({
      kind: "frenzy",
      pain: 0,
      frenzyMode: false,
    })
  })

  it("round-trips through its schema", () => {
    expect(frenzyStateSchema.parse(state(3, true))).toEqual(state(3, true))
  })
})

describe("adjustPain", () => {
  it("clamps between 0 and FRENZY_PAIN_MAX", () => {
    expect(adjustPain(state(0, false), -1).pain).toBe(0)
    expect(adjustPain(state(FRENZY_PAIN_MAX, false), 1).pain).toBe(
      FRENZY_PAIN_MAX
    )
    expect(adjustPain(state(2, false), 1).pain).toBe(3)
  })

  it("exits Frenzy Mode when Pain hits 0", () => {
    expect(adjustPain(state(1, true), -1)).toEqual(state(0, false))
  })

  it("keeps Frenzy Mode while Pain stays above 0", () => {
    expect(adjustPain(state(3, true), -1)).toEqual(state(2, true))
  })
})

describe("setFrenzyMode", () => {
  it("enters Frenzy when there is at least 1 Pain", () => {
    expect(setFrenzyMode(state(1, false), true)).toEqual(state(1, true))
  })

  it("cannot enter Frenzy at 0 Pain", () => {
    expect(setFrenzyMode(state(0, false), true)).toEqual(state(0, false))
  })

  it("always allows exiting Frenzy", () => {
    expect(setFrenzyMode(state(3, true), false)).toEqual(state(3, false))
  })
})

describe("frenzy.effects", () => {
  it("emits no Effect when not in Frenzy Mode", () => {
    expect(frenzy.effects?.(state(3, false), { stats: baseStats })).toEqual([])
  })

  it("emits no Effect in Frenzy Mode with 0 Pain", () => {
    expect(frenzy.effects?.(state(0, true), { stats: baseStats })).toEqual([])
  })

  it("emits a Physical damage Effect of pain × d4 while in Frenzy", () => {
    expect(frenzy.effects?.(state(3, true), { stats: baseStats })).toEqual([
      {
        type: "damage",
        when: { deliveries: ["physical"] },
        dice: { count: 3, sides: 4 },
        source: "Frenzy (Pain 3)",
      },
    ])
  })
})
