import { describe, expect, it } from "vitest"

import { getTalent, TALENT_KEYS, TALENTS } from "."

describe("talent data", () => {
  it("exposes exactly the 28 canonical Talents", () => {
    expect(TALENT_KEYS).toHaveLength(28)
    expect(TALENTS).toHaveLength(28)
  })

  it("has a unique, slug-shaped key for every Talent", () => {
    const keys = TALENTS.map((talent) => talent.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("resolves every Talent by its own key", () => {
    for (const talent of TALENTS) {
      expect(getTalent(talent.key)).toBe(talent)
    }
  })
})

describe("getTalent", () => {
  it("returns the matching Talent by key", () => {
    expect(getTalent("sleight-of-hand")?.name).toBe("Sleight of Hand")
    expect(getTalent("handle-animal")?.name).toBe("Handle Animal")
  })

  it("returns undefined for an unknown key", () => {
    expect(getTalent("nope")).toBeUndefined()
  })
})
