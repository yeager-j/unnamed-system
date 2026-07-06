import { describe, expect, it } from "vitest"

import { getTalent, TALENTS } from "@workspace/game-v2/talents/catalog"
import { TALENT_KEYS } from "@workspace/game-v2/talents/vocab"

/**
 * Completeness gate for the engine-owned Talent catalog (CH10 / UNN-554): every
 * rulebook key present, indexed by its own key, with a display name. The byte-for-byte
 * parity check vs the v1 registry lives in `apps/web` (game-v2 cannot import v1, D32).
 */
describe("talent catalog", () => {
  it("carries one entry per canonical key, no extras", () => {
    expect(TALENTS).toHaveLength(TALENT_KEYS.length)
    expect(new Set(TALENTS.map((talent) => talent.key))).toEqual(
      new Set(TALENT_KEYS)
    )
  })

  it("indexes each Talent by its own key with a non-empty name", () => {
    for (const key of TALENT_KEYS) {
      const talent = getTalent(key)
      expect(talent?.key).toBe(key)
      expect(talent?.name.length).toBeGreaterThan(0)
    }
  })

  it("returns undefined for an unknown key", () => {
    expect(getTalent("not-a-talent")).toBeUndefined()
  })

  it("spot-checks a hyphenated display name", () => {
    expect(getTalent("handle-animal")?.name).toBe("Handle Animal")
    expect(getTalent("sleight-of-hand")?.name).toBe("Sleight of Hand")
  })
})
