import { describe, expect, it } from "vitest"

import {
  AILMENT_KEYS,
  AILMENTS,
  ailmentSchema,
  getAilment,
  getAllAilments,
} from "./ailments"

describe("ailment data", () => {
  it("validates every Ailment against the schema", () => {
    for (const ailment of AILMENTS) {
      expect(() => ailmentSchema.parse(ailment)).not.toThrow()
    }
  })

  it("exposes exactly the 12 canonical Ailments (Downed included)", () => {
    expect(AILMENT_KEYS).toHaveLength(12)
    expect(AILMENTS).toHaveLength(12)
    expect(getAllAilments()).toHaveLength(12)
    expect(getAilment("downed")?.name).toBe("Downed")
  })

  it("has a unique, slug-shaped key for every Ailment", () => {
    const keys = AILMENTS.map((ailment) => ailment.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("gives every Ailment a non-empty player-facing description", () => {
    for (const ailment of AILMENTS) {
      expect(ailment.description.length).toBeGreaterThan(0)
    }
  })

  it("resolves every Ailment by its own key", () => {
    for (const ailment of AILMENTS) {
      expect(getAilment(ailment.key)).toBe(ailment)
    }
  })
})

describe("getAilment", () => {
  it("returns undefined for an unknown key", () => {
    expect(getAilment("poison")).toBeUndefined()
  })
})
