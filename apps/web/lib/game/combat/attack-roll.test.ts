import { describe, expect, it } from "vitest"

import type { StatComputationCharacter } from "../character"
import { ailmentBoost } from "../skills/passive/ailment-boost"
import { magicCircle } from "../skills/passive/magic-circle"
import { slashBoost } from "../skills/passive/slash-boost"
import { resolveAttackRoll, type AttackRollContext } from "./attack-roll"

function makeWarrior(
  overrides: Partial<StatComputationCharacter> = {}
): StatComputationCharacter {
  return {
    pathChoice: "balanced",
    level: 1,
    manualBonuses: {},
    activeArchetypeKey: "warrior",
    archetypes: [{ key: "warrior", rank: 5 }],
    equippedItems: [],
    activeSkills: [],
    activeMechanic: null,
    ...overrides,
  }
}

function makeMage(
  overrides: Partial<StatComputationCharacter> = {}
): StatComputationCharacter {
  return makeWarrior({
    activeArchetypeKey: "mage",
    archetypes: [{ key: "mage", rank: 5 }],
    ...overrides,
  })
}

// Warrior attributes — { strength: 2, magic: -1, agility: 1, luck: 1 }.
// Mage attributes — { strength: -1, magic: 2, agility: 1, luck: 1 }.
const SLASH_ST: AttackRollContext = {
  kind: "attack",
  damageType: "slash",
  delivery: "physical",
  attribute: "st",
}

const PIERCE_ST: AttackRollContext = {
  kind: "attack",
  damageType: "pierce",
  delivery: "physical",
  attribute: "st",
}

const FIRE_MAGICAL_MA: AttackRollContext = {
  kind: "attack",
  damageType: "fire",
  delivery: "magical",
  attribute: "ma",
}

const FIRE_PHYSICAL_ST: AttackRollContext = {
  kind: "attack",
  damageType: "fire",
  delivery: "physical",
  attribute: "st",
}

const AILMENT_LU: AttackRollContext = { kind: "ailment", attribute: "lu" }

describe("resolveAttackRoll — filter axes", () => {
  it("returns only the rolling Attribute as the source when no effect matches", () => {
    const character = makeWarrior()
    const resolved = resolveAttackRoll(SLASH_ST, character, null)
    expect(resolved).toEqual({
      total: 2,
      sources: [{ source: "Strength", amount: 2 }],
    })
  })

  it("applies a damageTypes filter — matches Slash, ignores Pierce", () => {
    const character = makeWarrior({ activeSkills: [slashBoost] })
    expect(resolveAttackRoll(SLASH_ST, character, null)).toEqual({
      total: 4,
      sources: [
        { source: "Strength", amount: 2 },
        { source: "Slash Boost", amount: 2 },
      ],
    })
    expect(resolveAttackRoll(PIERCE_ST, character, null)).toEqual({
      total: 2,
      sources: [{ source: "Strength", amount: 2 }],
    })
  })

  it("applies a deliveries filter — magical matches, physical does not", () => {
    const character = makeMage({ activeSkills: [magicCircle] })
    expect(resolveAttackRoll(FIRE_MAGICAL_MA, character, { mage: 2 })).toEqual({
      total: 4,
      sources: [
        { source: "Magic", amount: 2 },
        { source: "Magic Circle", amount: 2 },
      ],
    })
    expect(resolveAttackRoll(FIRE_PHYSICAL_ST, character, { mage: 2 })).toEqual(
      {
        total: -1,
        sources: [{ source: "Strength", amount: -1 }],
      }
    )
  })

  it("applies a skillKinds filter — ailment matches, attack does not", () => {
    const character = makeWarrior({ activeSkills: [ailmentBoost] })
    expect(resolveAttackRoll(AILMENT_LU, character, { warlock: 1 })).toEqual({
      total: 3,
      sources: [
        { source: "Luck", amount: 1 },
        { source: "Ailment Boost", amount: 2 },
      ],
    })
    expect(resolveAttackRoll(SLASH_ST, character, { warlock: 1 })).toEqual({
      total: 2,
      sources: [{ source: "Strength", amount: 2 }],
    })
  })
})

describe("resolveAttackRoll — perPartyLineage scaler", () => {
  it("multiplies the per-ally amount by the lineage count", () => {
    const character = makeMage({ activeSkills: [magicCircle] })
    expect(
      resolveAttackRoll(FIRE_MAGICAL_MA, character, { mage: 3 }).total
    ).toBe(5)
  })

  it("contributes 0 when the lineage is absent from the composition", () => {
    const character = makeMage({ activeSkills: [magicCircle] })
    expect(
      resolveAttackRoll(FIRE_MAGICAL_MA, character, { warrior: 4 })
    ).toEqual({
      total: 2,
      sources: [{ source: "Magic", amount: 2 }],
    })
  })

  it("treats a null partyComposition as zero allies", () => {
    const character = makeMage({ activeSkills: [magicCircle] })
    expect(resolveAttackRoll(FIRE_MAGICAL_MA, character, null)).toEqual({
      total: 2,
      sources: [{ source: "Magic", amount: 2 }],
    })
  })

  it("subtracts self when includesSelf is false and the lineage matches", () => {
    const selfExcludingSkill = {
      ...magicCircle,
      key: "magic-circle-test",
      effects: [
        {
          type: "attackRoll" as const,
          when: { deliveries: ["magical" as const] },
          scaler: {
            kind: "perPartyLineage" as const,
            lineage: "mage" as const,
            amount: 1,
            includesSelf: false,
          },
          source: "Magic Circle (allies only)",
        },
      ],
    }
    const character = makeMage({ activeSkills: [selfExcludingSkill] })
    expect(
      resolveAttackRoll(FIRE_MAGICAL_MA, character, { mage: 3 }).total
    ).toBe(4)
    expect(
      resolveAttackRoll(FIRE_MAGICAL_MA, character, { mage: 1 }).total
    ).toBe(2)
  })
})

describe("resolveAttackRoll — composition", () => {
  it("sums Attribute, mechanic, and passive contributors with a labelled breakdown", () => {
    const character = makeWarrior({
      activeSkills: [slashBoost],
      activeMechanic: {
        kind: "perfection",
        state: { kind: "perfection", rank: 3 },
      },
    })
    const resolved = resolveAttackRoll(SLASH_ST, character, null)
    expect(resolved.total).toBe(7)
    expect(resolved.sources).toEqual([
      { source: "Strength", amount: 2 },
      { source: "Perfection (A)", amount: 3 },
      { source: "Slash Boost", amount: 2 },
    ])
  })

  it("preserves collection order — Attribute first, then mechanic, then passives", () => {
    const character = makeWarrior({
      activeSkills: [slashBoost],
      activeMechanic: {
        kind: "perfection",
        state: { kind: "perfection", rank: 1 },
      },
    })
    const sources = resolveAttackRoll(SLASH_ST, character, null).sources
    expect(sources.map((s) => s.source)).toEqual([
      "Strength",
      "Perfection (C)",
      "Slash Boost",
    ])
  })

  it("skips effects that resolve to zero (no source row, no total contribution)", () => {
    // Magic Circle with mage: 0 contributes 0; Perfection rank 0 contributes
    // 0. Neither should appear in sources — only the rolling Attribute and
    // Slash Boost remain.
    const character = makeMage({
      activeSkills: [magicCircle, slashBoost],
      activeMechanic: {
        kind: "perfection",
        state: { kind: "perfection", rank: 0 },
      },
    })
    const resolved = resolveAttackRoll(SLASH_ST, character, null)
    expect(resolved.total).toBe(1)
    expect(resolved.sources).toEqual([
      { source: "Strength", amount: -1 },
      { source: "Slash Boost", amount: 2 },
    ])
  })
})
