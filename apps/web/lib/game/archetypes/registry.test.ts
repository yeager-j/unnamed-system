import { describe, expect, it } from "vitest"

import { getTalent } from "../character"
import { healer } from "./healer/healer"
import { knight } from "./knight/knight"
import { mage } from "./mage/mage"
import { archetypeDisplayName, ARCHETYPES, getArchetype } from "./registry"
import { archetypeSchema, LINEAGES, resolveAffinity } from "./schema"
import { warrior } from "./warrior/warrior"

describe("archetype data", () => {
  it("exposes a non-empty catalog", () => {
    expect(ARCHETYPES.length).toBeGreaterThan(0)
  })

  it("assigns every Archetype a known Lineage", () => {
    for (const archetype of ARCHETYPES) {
      expect(LINEAGES).toContain(archetype.lineage)
    }
  })

  it("has a unique, slug-shaped key for every Archetype", () => {
    const keys = ARCHETYPES.map((archetype) => archetype.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
    }
  })
})

describe("archetype prerequisites", () => {
  it("accepts Archetype + Rank requirements", () => {
    const paladin = {
      ...knight,
      key: "paladin",
      name: "Paladin",
      prerequisites: [
        { archetype: "knight", rank: 5 },
        { archetype: "cleric", rank: 5 },
      ],
    }
    expect(() => archetypeSchema.parse(paladin)).not.toThrow()
  })

  it("rejects a prerequisite Rank outside 1-5", () => {
    const broken = {
      ...knight,
      prerequisites: [{ archetype: "knight", rank: 6 }],
    }
    expect(() => archetypeSchema.parse(broken)).toThrow()
  })
})

describe("getArchetype", () => {
  it("returns the matching Archetype by key", () => {
    expect(getArchetype("warrior")).toBe(warrior)
    expect(getArchetype("knight")).toBe(knight)
    expect(getArchetype("mage")).toBe(mage)
    expect(getArchetype("healer")).toBe(healer)
  })

  it("returns undefined for an unknown key", () => {
    expect(getArchetype("nope")).toBeUndefined()
  })
})

describe("archetypeDisplayName", () => {
  it("returns the matching Archetype's name by key", () => {
    expect(archetypeDisplayName("warrior")).toBe(warrior.name)
    expect(archetypeDisplayName("mage")).toBe(mage.name)
  })

  it("falls back to Adventurer for null or an unknown key", () => {
    expect(archetypeDisplayName(null)).toBe("Adventurer")
    expect(archetypeDisplayName("nope")).toBe("Adventurer")
  })
})

describe("transcription spot-checks", () => {
  it("keeps the Mage attribute block", () => {
    expect(mage.attributes).toEqual({
      strength: -1,
      magic: 2,
      agility: 1,
      luck: 1,
    })
  })

  it("keeps the Warrior fire resistance", () => {
    expect(warrior.affinities.fire).toBe("resist")
  })

  it("records the Healer synthesis skill with its rank requirement", () => {
    expect(healer.synthesisSkill).toEqual({
      rank: 5,
      skill: "divine-judgment",
    })
  })
})

describe("talent cross-references", () => {
  it("resolves every Talent referenced by an Archetype", () => {
    for (const archetype of ARCHETYPES) {
      for (const talent of archetype.talents) {
        expect(getTalent(talent)).toBeDefined()
      }
    }
  })
})

describe("resolveAffinity", () => {
  it("returns the charted affinity", () => {
    expect(resolveAffinity(warrior, "fire")).toBe("resist")
  })

  it("defaults uncharted damage types to neutral", () => {
    expect(resolveAffinity(warrior, "ice")).toBe("neutral")
  })

  it("treats almighty as neutral", () => {
    expect(resolveAffinity(warrior, "almighty")).toBe("neutral")
  })
})
