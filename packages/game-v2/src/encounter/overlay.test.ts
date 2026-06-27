import { describe, expect, it } from "vitest"

import { INSTANCE_KEYS } from "@workspace/game-v2/encounter/instance"
import {
  DEFAULT_BATTLE_CONDITIONS,
  defaultOverlay,
  OVERLAY_KEYS,
  overlayComponentsSchema,
} from "@workspace/game-v2/encounter/overlay"

describe("defaultOverlay (R1.1 construction defaults)", () => {
  it("starts a fresh participant non-spatial-clean", () => {
    const overlay = defaultOverlay({ side: "players" })
    expect(overlay.allegiance).toEqual({ side: "players" })
    expect(overlay.ailments).toEqual([])
    expect(overlay.battleConditions).toEqual(DEFAULT_BATTLE_CONDITIONS)
    expect(overlay.conditionDurations).toEqual({})
    expect(overlay.counters).toEqual({})
    expect(overlay.turnState).toEqual({
      movesUsed: 0,
      standardsUsed: 0,
      reactionsUsed: 0,
      turnsTakenThisRound: 0,
    })
  })

  it("derives the acted-flag into turnsTakenThisRound (CD10)", () => {
    expect(
      defaultOverlay({ side: "enemies", hasActed: false }).turnState
        .turnsTakenThisRound
    ).toBe(0)
    expect(
      defaultOverlay({ side: "enemies", hasActed: true }).turnState
        .turnsTakenThisRound
    ).toBe(1)
  })

  it("clones the battle-conditions default so participants never share state", () => {
    const a = defaultOverlay({ side: "players" })
    const b = defaultOverlay({ side: "players" })
    a.battleConditions.charged = true
    expect(b.battleConditions.charged).toBe(false)
    expect(DEFAULT_BATTLE_CONDITIONS.charged).toBe(false)
  })
})

describe("OVERLAY_KEYS / INSTANCE_KEYS (sweep totality + disjointness)", () => {
  it("OVERLAY_KEYS set-equals the keys defaultOverlay actually builds", () => {
    expect([...OVERLAY_KEYS].sort()).toEqual(
      Object.keys(defaultOverlay({ side: "players" })).sort()
    )
  })

  it("a defaulted overlay validates against overlayComponentsSchema", () => {
    const parsed = overlayComponentsSchema.safeParse(
      defaultOverlay({ side: "players" })
    )
    expect(parsed.success).toBe(true)
  })

  it("overlay and instance key sets are disjoint", () => {
    const instance = INSTANCE_KEYS as readonly string[]
    expect(OVERLAY_KEYS.filter((key) => instance.includes(key))).toEqual([])
  })
})
