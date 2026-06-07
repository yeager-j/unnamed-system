import { describe, expect, it } from "vitest"

import { mage } from "@workspace/game/data/archetypes/mage/mage"
import { warrior } from "@workspace/game/data/archetypes/warrior/warrior"
import { cleave } from "@workspace/game/data/skills/slash/cleave"
import { makeStatContext } from "@workspace/game/engine/__fixtures__/character"
import {
  accessoryWithEffects,
  magicAccessory,
  nullElecSkill,
  nullWeapon,
  reservesSkill,
  spAccessory,
  weaknessArmor,
} from "@workspace/game/engine/__fixtures__/fixtures"
import {
  accumulatedBonuses,
  baseAffinitiesForArchetype,
  baseAttributesForArchetype,
  computeAffinityChart,
  computeAttributes,
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  getPathDice,
  getPathStats,
  type StatContext,
} from "@workspace/game/engine/character/stats/stats"

function makeCharacter(overrides: Partial<StatContext> = {}): StatContext {
  return makeStatContext({
    archetypes: [{ key: "warrior", rank: 2 }],
    ...overrides,
  })
}

describe("computeAttributes", () => {
  it("uses the active Archetype's scores for a baseline character", () => {
    expect(computeAttributes(makeCharacter())).toEqual(warrior.attributes)
  })

  it("returns zeroes when no Archetype is active", () => {
    const character = makeCharacter({
      activeArchetypeKey: null,
      archetypes: [],
    })
    expect(computeAttributes(character)).toEqual({
      strength: 0,
      magic: 0,
      agility: 0,
      luck: 0,
    })
  })

  it("adds equipped-item Attribute bonuses to the base", () => {
    const character = makeCharacter({
      equippedItems: [
        accessoryWithEffects([
          { type: "attribute", target: "strength", amount: 3 },
        ]),
      ],
    })
    expect(computeAttributes(character).strength).toBe(
      warrior.attributes.strength + 3
    )
  })

  it("adds an equipped accessory's Magic bonus", () => {
    const character = makeCharacter({ equippedItems: [magicAccessory] })
    expect(computeAttributes(character).magic).toBe(
      warrior.attributes.magic + 2
    )
  })

  it("adds an active passive Skill's Attribute bonus", () => {
    const character = makeCharacter({ activeSkills: [reservesSkill] })
    expect(computeAttributes(character).magic).toBe(
      warrior.attributes.magic + 2
    )
  })

  it("ignores non-passive active Skills", () => {
    const character = makeCharacter({ activeSkills: [cleave] })
    expect(computeAttributes(character)).toEqual(warrior.attributes)
  })

  it("ignores an equipped item's non-attribute (affinity) effects", () => {
    const character = makeCharacter({ equippedItems: [weaknessArmor] })
    expect(computeAttributes(character)).toEqual(warrior.attributes)
  })

  it("layers manual bonuses on top of derived Mastery without double-counting", () => {
    const character = makeCharacter({
      activeArchetypeKey: "warrior",
      archetypes: [{ key: "warrior", rank: 5 }],
      manualBonuses: { strength: 2 },
    })
    expect(computeAttributes(character).strength).toBe(
      warrior.attributes.strength + 2
    )
  })

  it("clamps an Attribute at +7", () => {
    const character = makeCharacter({ manualBonuses: { strength: 100 } })
    expect(computeAttributes(character).strength).toBe(7)
  })

  it("clamps an Attribute at -7", () => {
    const character = makeCharacter({ manualBonuses: { magic: -100 } })
    expect(computeAttributes(character).magic).toBe(-7)
  })
})

describe("computeMaxHP / computeMaxSP", () => {
  it("returns the path's starting values at level 1", () => {
    expect(computeMaxHP(makeCharacter({ pathChoice: "balanced" }))).toBe(20)
    expect(computeMaxSP(makeCharacter({ pathChoice: "balanced" }))).toBe(50)
    expect(computeMaxHP(makeCharacter({ pathChoice: "health-focused" }))).toBe(
      24
    )
    expect(computeMaxSP(makeCharacter({ pathChoice: "health-focused" }))).toBe(
      40
    )
    expect(computeMaxHP(makeCharacter({ pathChoice: "skill-focused" }))).toBe(
      16
    )
    expect(computeMaxSP(makeCharacter({ pathChoice: "skill-focused" }))).toBe(
      60
    )
  })

  it("adds the averaged per-level gain for every level after the first", () => {
    const character = makeCharacter({ pathChoice: "balanced", level: 3 })
    expect(computeMaxHP(character)).toBe(20 + 2 * 6)
    expect(computeMaxSP(character)).toBe(50 + 2 * 11)
  })

  it("rounds the Hit Die average up D&D-style per path", () => {
    expect(
      computeMaxHP(makeCharacter({ pathChoice: "health-focused", level: 2 }))
    ).toBe(24 + 7)
    expect(
      computeMaxHP(makeCharacter({ pathChoice: "skill-focused", level: 2 }))
    ).toBe(16 + 5)
  })

  it("applies a Mastered Archetype's HP bonus even while it is inactive", () => {
    const character = makeCharacter({
      pathChoice: "balanced",
      level: 1,
      activeArchetypeKey: "mage",
      archetypes: [
        { key: "mage", rank: 2 },
        { key: "warrior", rank: 5 },
      ],
    })
    expect(computeMaxHP(character)).toBe(20 + 20)
  })

  it("does not apply Mastery below the Mastery Rank", () => {
    const character = makeCharacter({
      pathChoice: "balanced",
      activeArchetypeKey: "warrior",
      archetypes: [{ key: "warrior", rank: 4 }],
    })
    expect(computeMaxHP(character)).toBe(20)
  })

  it("sums Mastery, equipment, and manual HP/SP bonuses", () => {
    const character = makeCharacter({
      pathChoice: "balanced",
      level: 1,
      activeArchetypeKey: "warrior",
      archetypes: [{ key: "warrior", rank: 5 }],
      equippedItems: [
        accessoryWithEffects([{ type: "attribute", target: "hp", amount: 10 }]),
      ],
      manualBonuses: { hp: 5 },
    })
    expect(computeMaxHP(character)).toBe(20 + 20 + 10 + 5)
  })

  it("applies an SP Mastery bonus (Mage) to max SP", () => {
    const character = makeCharacter({
      pathChoice: "balanced",
      activeArchetypeKey: "mage",
      archetypes: [{ key: "mage", rank: 5 }],
    })
    expect(computeMaxSP(character)).toBe(50 + 20)
  })

  it("adds an equipped accessory's SP bonus to max SP", () => {
    const character = makeCharacter({
      pathChoice: "balanced",
      equippedItems: [spAccessory],
    })
    expect(computeMaxSP(character)).toBe(50 + 20)
  })

  it("adds an active passive Skill's SP bonus to max SP", () => {
    const character = makeCharacter({
      pathChoice: "balanced",
      activeSkills: [reservesSkill],
    })
    expect(computeMaxSP(character)).toBe(50 + 30)
  })
})

describe("computeMaxHitDice / computeMaxSkillDice", () => {
  it("derives 2 Hit / 5 Skill Dice at Level 1 (rulebook 1.1)", () => {
    expect(computeMaxHitDice(1)).toBe(2)
    expect(computeMaxSkillDice(1)).toBe(5)
  })

  it("gains 1 Hit / 2 Skill Dice per level", () => {
    expect(computeMaxHitDice(2)).toBe(3)
    expect(computeMaxSkillDice(2)).toBe(7)
  })

  it("scales to the level cap", () => {
    expect(computeMaxHitDice(30)).toBe(31)
    expect(computeMaxSkillDice(30)).toBe(63)
  })
})

describe("computeAffinityChart", () => {
  it("derives the active Archetype's chart, defaulting uncharted and Almighty to neutral", () => {
    const chart = computeAffinityChart(makeCharacter())
    expect(chart.fire).toBe("resist")
    expect(chart.wind).toBe("weak")
    expect(chart.slash).toBe("neutral")
    expect(chart.almighty).toBe("neutral")
  })

  it("lets an equipment effect replace the Archetype base regardless of priority", () => {
    const character = makeCharacter({ equippedItems: [weaknessArmor] })
    expect(computeAffinityChart(character).fire).toBe("weak")
  })

  it("picks the strongest when several equipment effects collide on a type", () => {
    const character = makeCharacter({
      equippedItems: [
        accessoryWithEffects([
          { type: "affinity", damageTypes: ["fire"], affinity: "weak" },
          { type: "affinity", damageTypes: ["fire"], affinity: "null" },
        ]),
      ],
    })
    expect(computeAffinityChart(character).fire).toBe("null")
  })

  it("keeps the strongest even when a weaker affinity collides after it", () => {
    // Strongest listed first, so a naive "last write wins" picks the weaker one.
    const character = makeCharacter({
      equippedItems: [
        accessoryWithEffects([
          { type: "affinity", damageTypes: ["fire"], affinity: "null" },
          { type: "affinity", damageTypes: ["fire"], affinity: "weak" },
        ]),
      ],
    })
    expect(computeAffinityChart(character).fire).toBe("null")
  })

  it("applies an active passive Skill's Affinity change", () => {
    const character = makeCharacter({ activeSkills: [nullElecSkill] })
    expect(computeAffinityChart(character).elec).toBe("null")
  })

  it("resolves the strongest across equipment and passive Skills", () => {
    const character = makeCharacter({
      equippedItems: [
        accessoryWithEffects([
          { type: "affinity", damageTypes: ["elec"], affinity: "weak" },
        ]),
      ],
      activeSkills: [nullElecSkill],
    })
    expect(computeAffinityChart(character).elec).toBe("null")
  })

  it("falls back to the Archetype base for types no equipment touches", () => {
    const character = makeCharacter({ equippedItems: [nullWeapon] })
    const chart = computeAffinityChart(character)
    expect(chart.ice).toBe("null")
    expect(chart.fire).toBe("resist")
    expect(chart.wind).toBe("weak")
  })

  it("lets overrides win over every other source, even Drain", () => {
    const character = makeCharacter({
      equippedItems: [
        accessoryWithEffects([
          { type: "affinity", damageTypes: ["fire"], affinity: "drain" },
        ]),
      ],
    })
    const chart = computeAffinityChart(character, { fire: "weak" })
    expect(chart.fire).toBe("weak")
  })

  it("supports overriding Almighty", () => {
    const chart = computeAffinityChart(makeCharacter(), { almighty: "null" })
    expect(chart.almighty).toBe("null")
  })
})

describe("purity", () => {
  it("is deterministic and never mutates its input", () => {
    const character = makeCharacter({
      level: 4,
      activeArchetypeKey: "mage",
      archetypes: [
        { key: "mage", rank: 5 },
        { key: "warrior", rank: 5 },
      ],
      equippedItems: [
        accessoryWithEffects([
          { type: "attribute", target: "magic", amount: 1 },
          { type: "affinity", damageTypes: ["fire"], affinity: "null" },
        ]),
      ],
      activeSkills: [nullElecSkill, reservesSkill],
      manualBonuses: { sp: 3 },
    })
    const snapshot = structuredClone(character)

    expect(computeAttributes(character)).toEqual(computeAttributes(character))
    expect(computeMaxHP(character)).toBe(computeMaxHP(character))
    expect(computeMaxSP(character)).toBe(computeMaxSP(character))
    expect(computeAffinityChart(character)).toEqual(
      computeAffinityChart(character)
    )
    expect(character).toEqual(snapshot)
  })
})

describe("shared bonus pool", () => {
  it("matches the standalone path when the pool is threaded in", () => {
    const character = makeCharacter({
      activeArchetypeKey: "mage",
      archetypes: [
        { key: "mage", rank: 5 },
        { key: "warrior", rank: 5 },
      ],
      equippedItems: [
        accessoryWithEffects([
          { type: "attribute", target: "magic", amount: 2 },
        ]),
        spAccessory,
      ],
      manualBonuses: { hp: 4, strength: 1 },
    })
    const bonuses = accumulatedBonuses(character)

    expect(computeAttributes(character, bonuses)).toEqual(
      computeAttributes(character)
    )
    expect(computeMaxHP(character, bonuses)).toBe(computeMaxHP(character))
    expect(computeMaxSP(character, bonuses)).toBe(computeMaxSP(character))
  })
})

describe("transcription guard", () => {
  it("keeps the Mage SP Mastery wired through max SP", () => {
    expect(mage.mastery).toEqual({ kind: "sp", amount: 20 })
  })
})

describe("mechanic Effects flow through the existing pipeline", () => {
  it("applies Valor's stage-3+ Resist to Slash / Pierce / Strike via the Affinity chart", () => {
    const character = makeCharacter({
      activeArchetypeKey: "knight",
      archetypes: [{ key: "knight", rank: 5 }],
      activeMechanic: { kind: "valor", state: { kind: "valor", value: 3 } },
    })
    const chart = computeAffinityChart(character)
    expect(chart.slash).toBe("resist")
    expect(chart.pierce).toBe("resist")
    expect(chart.strike).toBe("resist")
  })

  it("does not apply Valor's affinity Effect below value 3", () => {
    const character = makeCharacter({
      activeArchetypeKey: "knight",
      archetypes: [{ key: "knight", rank: 5 }],
      activeMechanic: { kind: "valor", state: { kind: "valor", value: 2 } },
    })
    // Knight's base Slash affinity is Resist; we only assert Pierce/Strike to
    // isolate the mechanic's contribution.
    const chart = computeAffinityChart(character)
    expect(chart.pierce).toBe("neutral")
    expect(chart.strike).toBe("neutral")
  })
})

describe("getPathStats / getPathDice", () => {
  it("exposes each path's published starting + per-level HP/SP", () => {
    expect(getPathStats("balanced")).toEqual({
      startHP: 20,
      startSP: 50,
      hpPerLevel: 6,
      spPerLevel: 11,
    })
    expect(getPathStats("health-focused")).toEqual({
      startHP: 24,
      startSP: 40,
      hpPerLevel: 7,
      spPerLevel: 9,
    })
    expect(getPathStats("skill-focused")).toEqual({
      startHP: 16,
      startSP: 60,
      hpPerLevel: 5,
      spPerLevel: 13,
    })
  })

  it("exposes each path's Hit / Skill die size", () => {
    expect(getPathDice("balanced")).toEqual({ hitDie: 10, skillDie: 10 })
    expect(getPathDice("health-focused")).toEqual({ hitDie: 12, skillDie: 8 })
    expect(getPathDice("skill-focused")).toEqual({ hitDie: 8, skillDie: 12 })
  })
})

describe("baseAttributesForArchetype / baseAffinitiesForArchetype", () => {
  it("returns the Archetype's intrinsic Attribute scores", () => {
    expect(baseAttributesForArchetype("warrior")).toEqual(warrior.attributes)
  })

  it("returns all-zero scores when there is no active Archetype", () => {
    expect(baseAttributesForArchetype(null)).toEqual({
      strength: 0,
      magic: 0,
      agility: 0,
      luck: 0,
    })
  })

  it("resolves the Archetype's chart, Almighty and uncharted types neutral", () => {
    const chart = baseAffinitiesForArchetype("warrior")
    expect(chart.fire).toBe("resist")
    expect(chart.wind).toBe("weak")
    expect(chart.slash).toBe("neutral")
    expect(chart.almighty).toBe("neutral")
  })

  it("returns an all-neutral chart when there is no active Archetype", () => {
    const chart = baseAffinitiesForArchetype(null)
    expect(chart.fire).toBe("neutral")
    expect(chart.slash).toBe("neutral")
    expect(chart.almighty).toBe("neutral")
  })
})
