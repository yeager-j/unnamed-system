import { describe, expect, it } from "vitest"

import {
  adjustPain,
  frenzy,
  FRENZY_PAIN_MAX,
  setFrenzyMode,
} from "@workspace/game-v2/mechanics/berserker/frenzy"

const at = (pain: number, frenzyMode = false) =>
  ({ kind: "frenzy", pain, frenzyMode }) as const

describe("Frenzy", () => {
  it("starts at 0 Pain, not in Frenzy Mode", () => {
    expect(frenzy.initialState()).toEqual({
      kind: "frenzy",
      pain: 0,
      frenzyMode: false,
    })
  })

  it("adjustPain clamps to 0..MAX", () => {
    expect(adjustPain(at(0), -1).pain).toBe(0)
    expect(adjustPain(at(FRENZY_PAIN_MAX), 1).pain).toBe(FRENZY_PAIN_MAX)
    expect(adjustPain(at(2), 2).pain).toBe(4)
  })

  it("reaching 0 Pain forces Frenzy Mode off; a positive result preserves it", () => {
    expect(adjustPain(at(1, true), -1)).toEqual({
      kind: "frenzy",
      pain: 0,
      frenzyMode: false,
    })
    expect(adjustPain(at(3, true), -1).frenzyMode).toBe(true)
  })

  it("setFrenzyMode requires ≥1 Pain to enter; exiting is always allowed", () => {
    expect(setFrenzyMode(at(0), true).frenzyMode).toBe(false)
    expect(setFrenzyMode(at(2), true).frenzyMode).toBe(true)
    expect(setFrenzyMode(at(2, true), false).frenzyMode).toBe(false)
  })

  it("emits no damage unless in Frenzy Mode with Pain", () => {
    expect(frenzy.effects?.(at(3, false))).toEqual([])
    expect(frenzy.effects?.(at(0, true))).toEqual([])
    expect(frenzy.effects?.(at(3, true))).toEqual([
      {
        type: "damage",
        when: { deliveries: ["physical"] },
        dice: { count: 3, sides: 4 },
        source: "Frenzy (Pain 3)",
      },
    ])
  })
})
