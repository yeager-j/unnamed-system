import { describe, expect, it } from "vitest"

import {
  getSideEffect,
  SIDE_EFFECTS,
} from "@workspace/game-v2/combat/side-effects"
import { SIDE_EFFECT_KEYS } from "@workspace/game-v2/kernel/vocab/side-effects"

describe("side-effect catalog conformance", () => {
  it("getSideEffect is total: every key resolves to a non-empty named entry", () => {
    for (const key of SIDE_EFFECT_KEYS) {
      const entry = getSideEffect(key)
      expect(entry.key).toBe(key)
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it("SIDE_EFFECTS lists every key exactly once, in vocab order", () => {
    expect(SIDE_EFFECTS.map((s) => s.key)).toEqual([...SIDE_EFFECT_KEYS])
  })
})
