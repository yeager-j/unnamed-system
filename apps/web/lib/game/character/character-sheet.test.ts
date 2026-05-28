import { describe, expect, it } from "vitest"

import {
  buildSeedStatCharacter,
  SEED_CHARACTERS,
  type SeedCharacter,
} from "../../__fixtures__/seed-characters"
import { getArchetype, hasMasteryBonus } from "../archetypes"
import { resolveAttackRoll } from "../combat"
import { getEquippableItem, getItem } from "../items"
import { getSkill } from "../skills"
import { VIRTUE_KEYS } from "./state"
import {
  computeAffinityChart,
  computeAttributes,
  computeMaxHP,
  computeMaxSP,
} from "./stats/stats"
import { resolveTalents } from "./talents/utils"

/**
 * Integration coverage for the derived-value pipeline over the real seed
 * roster: the same specs the database seed persists, fed through the same
 * hydration (`buildSeedStatCharacter` → the pure stat engine). This locks in
 * both seed correctness and the cross-module hydration the public sheet relies
 * on, with no database.
 */

const bySlug = (slug: string): SeedCharacter => {
  const character = SEED_CHARACTERS.find((c) => c.slug === slug)
  if (!character) throw new Error(`No seed character "${slug}"`)
  return character
}

/** A deep, independent copy so per-test tweaks never leak across the suite. */
const variant = (
  character: SeedCharacter,
  mutate: (draft: SeedCharacter) => void
): SeedCharacter => {
  const draft = structuredClone(character)
  mutate(draft)
  return draft
}

describe("seed roster structural invariants", () => {
  it("has unique, URL-safe slugs and shortIds", () => {
    const slugs = SEED_CHARACTERS.map((c) => c.slug)
    const shortIds = SEED_CHARACTERS.map((c) => c.shortId)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(shortIds).size).toBe(shortIds.length)
    for (const shortId of shortIds) expect(shortId).toMatch(/^[a-z0-9-]+$/)
  })

  it("references only real Archetypes, Skills, and catalog items", () => {
    for (const c of SEED_CHARACTERS) {
      const keys = c.archetypes.map((a) => a.archetypeKey)
      expect(keys).toContain(c.activeArchetypeKey)
      for (const archetype of c.archetypes) {
        expect(getArchetype(archetype.archetypeKey)).toBeDefined()
        for (const slot of archetype.inheritanceSlots ?? []) {
          expect(keys).toContain(slot.sourceArchetypeKey)
          expect(slot.sourceArchetypeKey).not.toBe(archetype.archetypeKey)
          expect(getSkill(slot.skillKey)).toBeDefined()
        }
      }
      for (const item of c.items) {
        expect(getItem(item.catalogItemKey)).toBeDefined()
      }
    }
  })

  it("fills every Identity field for every character", () => {
    for (const c of SEED_CHARACTERS) {
      for (const text of [
        c.ancestryText,
        c.backgroundText,
        c.backstoryText,
        c.notes,
        c.personalityTraits,
        c.hopes,
        c.dreams,
        c.fears,
        c.secrets,
      ]) {
        expect(text?.trim().length ?? 0).toBeGreaterThan(0)
      }
      for (const list of [
        c.knives,
        c.chains,
        resolveTalents(c.gainedTalents, c.activeArchetypeKey),
      ]) {
        expect(list.length).toBeGreaterThan(0)
      }
    }
  })

  it("never persists a current pool above the derived max", () => {
    for (const c of SEED_CHARACTERS) {
      if (!c.damage) continue
      const stats = buildSeedStatCharacter(c)
      expect(c.damage.hp).toBeLessThanOrEqual(computeMaxHP(stats))
      expect(c.damage.sp).toBeLessThanOrEqual(computeMaxSP(stats))
    }
  })
})

describe("seed roster covers every sheet section (UNN-144)", () => {
  it("spans all four MVP Archetypes as the active Archetype", () => {
    const active = new Set(SEED_CHARACTERS.map((c) => c.activeArchetypeKey))
    expect(active).toEqual(new Set(["warrior", "healer", "mage", "knight"]))
  })

  it("spans level 1, a mid-level, and a near-max-level character", () => {
    const levels = SEED_CHARACTERS.map((c) => c.level)
    expect(levels).toContain(1)
    expect(levels.some((l) => l >= 10 && l <= 15)).toBe(true)
    expect(levels.some((l) => l >= 25)).toBe(true)
  })

  it("has a character with 2+ Archetypes and filled cross-Archetype slots", () => {
    const match = SEED_CHARACTERS.some(
      (c) =>
        c.archetypes.length >= 2 &&
        c.archetypes.some((a) => (a.inheritanceSlots ?? []).length > 0)
    )
    expect(match).toBe(true)
  })

  it("has an Archetype at the Mastery Rank", () => {
    const mastered = SEED_CHARACTERS.some((c) =>
      c.archetypes.some((a) => hasMasteryBonus(a.rank))
    )
    expect(mastered).toBe(true)
  })

  it("has a character mid-combat (Ailment + Battle Conditions + Exhaustion)", () => {
    const match = SEED_CHARACTERS.some(
      (c) =>
        c.ailments.length > 0 && c.battleConditions !== null && c.exhaustion > 0
    )
    expect(match).toBe(true)
  })

  it("has Sparks logged across multiple Virtues", () => {
    const match = SEED_CHARACTERS.some((c) => new Set(c.sparkLog).size >= 2)
    expect(match).toBe(true)
    for (const c of SEED_CHARACTERS) {
      for (const virtue of c.sparkLog) {
        expect(VIRTUE_KEYS).toContain(virtue)
      }
    }
  })

  it("has Victories > 0 and a character with Victories >= 7", () => {
    expect(SEED_CHARACTERS.some((c) => c.victories > 0)).toBe(true)
    expect(SEED_CHARACTERS.some((c) => c.victories >= 7)).toBe(true)
  })

  it("exercises affinity, attribute, and skill equipment effects", () => {
    const effectTypes = new Set<string>()
    for (const c of SEED_CHARACTERS) {
      for (const item of c.items) {
        const catalog = getEquippableItem(item.catalogItemKey)
        for (const effect of catalog?.equip.effects ?? []) {
          effectTypes.add(effect.type)
        }
      }
    }
    expect(effectTypes).toEqual(new Set(["affinity", "attribute", "skill"]))
  })
})

describe("derived stats — level 1 baselines (path table, no bonuses)", () => {
  it("Warrior: health-focused start pools and Warrior base Attributes", () => {
    const stats = buildSeedStatCharacter(bySlug("warrior"))
    expect(computeMaxHP(stats)).toBe(24)
    expect(computeMaxSP(stats)).toBe(40)
    expect(computeAttributes(stats)).toEqual({
      strength: 2,
      magic: -1,
      agility: 1,
      luck: 1,
    })
  })

  it("Healer: skill-focused start pools", () => {
    const stats = buildSeedStatCharacter(bySlug("healer"))
    expect(computeMaxHP(stats)).toBe(16)
    expect(computeMaxSP(stats)).toBe(60)
  })
})

describe("derived stats — Mage (mid-level, equipment + manual bonus)", () => {
  it("scales pools by level on the balanced path", () => {
    const stats = buildSeedStatCharacter(bySlug("mage"))
    // balanced: 20 + (13-1)*6 HP; 50 + (13-1)*11 SP; Mage Mastery at Rank 5
    // adds +20 SP.
    expect(computeMaxHP(stats)).toBe(92)
    expect(computeMaxSP(stats)).toBe(202)
  })

  it("sums the Runed Cane (+1 Magic) and the manual +1 Magic", () => {
    const stats = buildSeedStatCharacter(bySlug("mage"))
    // Mage base Magic 2, +1 weapon, +1 manual.
    expect(computeAttributes(stats).magic).toBe(4)
  })
})

describe("derived stats — Knight (near-max, Mastery + inheritance)", () => {
  const knight = bySlug("knight")

  it("folds the Rank-5 Knight HP Mastery into the persisted pool", () => {
    const stats = buildSeedStatCharacter(knight)
    // balanced: 20 + (27-1)*6 = 176, +20 Knight Mastery.
    expect(computeMaxHP(stats)).toBe(196)
    expect(computeMaxSP(stats)).toBe(336)
  })

  it("a Mastered Archetype contributes its bonus even when inactive", () => {
    const base = computeMaxHP(buildSeedStatCharacter(knight))
    // Warrior Mastery is also +20 HP; raising the inactive Warrior to Rank 5
    // adds exactly that and nothing else (inactive Archetypes grant no Skills).
    const warriorMastered = variant(knight, (draft) => {
      const warrior = draft.archetypes.find(
        (a) => a.archetypeKey === "warrior"
      )!
      warrior.rank = 5
    })
    expect(computeMaxHP(buildSeedStatCharacter(warriorMastered))).toBe(
      base + 20
    )
  })

  it("isolates the Runed Cane's +1 Magic from the rest of the build", () => {
    const withCane = computeAttributes(buildSeedStatCharacter(knight)).magic
    const withoutCane = variant(knight, (draft) => {
      draft.items = draft.items.filter((i) => i.catalogItemKey !== "runed-cane")
    })
    expect(
      withCane - computeAttributes(buildSeedStatCharacter(withoutCane)).magic
    ).toBe(1)
  })

  it("resolves both cross-Archetype Inheritance Slots to real Skills", () => {
    const stats = buildSeedStatCharacter(knight)
    const activeKeys = stats.activeSkills.map((s) => s.key)
    expect(activeKeys).toContain("agi")
    expect(activeKeys).toContain("cleave")
  })
})

describe("derived stats — party-scaled Attack Roll bonuses (Magic Circle)", () => {
  // The seeded Mage (Calliope) is Mage Rank 5 with Magic Circle active — the
  // catalog passive that scales +1 to Magical Attack Rolls per Mage Lineage
  // ally including self. These integration cases exercise that pipeline
  // end-to-end against the seeded data, varying only the partyComposition.
  const mage = bySlug("mage")

  function withParty(composition: SeedCharacter["partyComposition"]) {
    return variant(mage, (draft) => {
      draft.partyComposition = composition
    })
  }

  it("Magic Circle contributes +N to Magical Attack Rolls per Mage Lineage in the party", () => {
    const stats = buildSeedStatCharacter(withParty({ mage: 3 }))
    const resolved = resolveAttackRoll(
      {
        kind: "attack",
        damageType: "fire",
        delivery: "magical",
        attribute: "ma",
      },
      stats,
      { mage: 3 }
    )
    expect(resolved.sources).toContainEqual({
      source: "Magic Circle",
      amount: 3,
    })
  })

  it("Magic Circle contributes 0 when no Mages are in the party", () => {
    const stats = buildSeedStatCharacter(withParty(null))
    const resolved = resolveAttackRoll(
      {
        kind: "attack",
        damageType: "fire",
        delivery: "magical",
        attribute: "ma",
      },
      stats,
      null
    )
    expect(
      resolved.sources.some((source) => source.source === "Magic Circle")
    ).toBe(false)
  })

  it("Magic Circle does not affect Physical-delivery Attack Rolls", () => {
    const stats = buildSeedStatCharacter(withParty({ mage: 3 }))
    const resolved = resolveAttackRoll(
      {
        kind: "attack",
        damageType: "slash",
        delivery: "physical",
        attribute: "st",
      },
      stats,
      { mage: 3 }
    )
    expect(
      resolved.sources.some((source) => source.source === "Magic Circle")
    ).toBe(false)
  })
})

describe("derived stats — equipment Affinity overrides the Archetype base", () => {
  it("Bladeturn Mail flips an uncharted Slash to Resist", () => {
    const mage = bySlug("mage")
    // Mage's chart leaves Slash uncharted -> Neutral.
    expect(computeAffinityChart(buildSeedStatCharacter(mage)).slash).toBe(
      "neutral"
    )
    const armored = variant(mage, (draft) => {
      draft.items.push({ catalogItemKey: "bladeturn-mail", equipped: true })
    })
    expect(computeAffinityChart(buildSeedStatCharacter(armored)).slash).toBe(
      "resist"
    )
  })
})
