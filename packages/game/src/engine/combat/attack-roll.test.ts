import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import { makeStatContext } from "@workspace/game/engine/__fixtures__/character"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  makeAttackSkill,
  makePassiveSkill,
} from "@workspace/game/engine/__fixtures__/skills"
import { type StatContext } from "@workspace/game/engine/character/stats/stats"
import {
  attackRollEffectsFromSkills,
  resolveAttackRoll,
  skillAttackRollContext,
  type AttackRollContext,
} from "@workspace/game/engine/combat/attack-roll"
import type { Skill } from "@workspace/game/foundation/skills/schema"

// Fixture Warrior/Mage with **assigned** base Attributes (real lineage keys as
// opaque ids), resolved through a fixture catalog so `activeLineage` derives
// from the key exactly as production — keeping the self-exclusion tests honest.
// Warrior attributes — { strength: 2, magic: -1, agility: 1, luck: 1 }.
// Mage attributes — { strength: -1, magic: 2, agility: 1, luck: 1 }.
const fxWarrior = makeArchetype({
  key: "warrior",
  lineage: "warrior",
  attributes: { strength: 2, magic: -1, agility: 1, luck: 1 },
})
const fxMage = makeArchetype({
  key: "mage",
  lineage: "mage",
  attributes: { strength: -1, magic: 2, agility: 1, luck: 1 },
})
const TEST_DATA = makeTestGameData({ archetypes: [fxWarrior, fxMage] })

function makeWarrior(overrides: Partial<StatContext> = {}): StatContext {
  return makeStatContext(overrides, TEST_DATA)
}

function makeMage(overrides: Partial<StatContext> = {}): StatContext {
  return makeWarrior({
    activeArchetypeKey: "mage",
    archetypes: [{ key: "mage", rank: 5, mastery: { kind: "sp", amount: 20 } }],
    ...overrides,
  })
}

// Fixture Skills carrying **assigned** Attack-Roll effects (real keys as opaque
// ids): a Slash-filtered +2, a Magic-Circle per-mage scaler, an Ailment-filtered
// +2, plus a wind attack Skill and an ailment Skill for the context derivation.
const slashBoost = makePassiveSkill({
  key: "slash-boost",
  name: "Slash Boost",
  effects: [
    {
      type: "attackRoll",
      when: { damageTypes: ["slash"] },
      amount: 2,
      source: "Slash Boost",
    },
  ],
})
const magicCircle = makePassiveSkill({
  key: "magic-circle",
  name: "Magic Circle",
  effects: [
    {
      type: "attackRoll",
      when: { deliveries: ["magical"] },
      scaler: {
        kind: "perPartyLineage",
        lineage: "mage",
        amount: 1,
        includesSelf: true,
      },
      source: "Magic Circle",
    },
  ],
})
const ailmentBoost = makePassiveSkill({
  key: "ailment-boost",
  name: "Ailment Boost",
  effects: [
    {
      type: "attackRoll",
      when: { skillKinds: ["ailment"] },
      amount: 2,
      source: "Ailment Boost",
    },
  ],
})
const garu = makeAttackSkill({
  key: "garu",
  damageType: "wind",
  delivery: "magical",
  attackRoll: { attribute: "ma", tiers: [] },
})
const evilTouch = {
  kind: "ailment",
  key: "evil-touch",
  name: "Evil Touch",
  tagline: "Inflicts Fear.",
  description: "Inflicts Fear.",
  isSynthesis: false,
  cost: { kind: "sp", amount: 5 },
  range: { kind: "known", value: "engaged" },
  attackRoll: { attribute: "lu", tiers: [] },
} satisfies Skill

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

describe("skillAttackRollContext", () => {
  it("derives the attack arm with damage type + delivery", () => {
    // toStrictEqual (not toEqual) so the ailment arm's absence of damageType /
    // delivery is meaningful — toEqual treats undefined props as absent, which
    // would let the attack/ailment arms blur together.
    // The fixture garu's assigned wind/magical/Magic arm — assert behavior, not
    // a shipped Skill's fields.
    expect(skillAttackRollContext(garu)).toStrictEqual({
      kind: "attack",
      damageType: "wind",
      delivery: "magical",
      attribute: "ma",
    })
  })

  it("derives the ailment arm — attribute only, no damage type or delivery", () => {
    expect(skillAttackRollContext(evilTouch)).toStrictEqual({
      kind: "ailment",
      attribute: evilTouch.attackRoll.attribute,
    })
  })

  it("returns null for a Skill that makes no Attack Roll", () => {
    expect(skillAttackRollContext(slashBoost)).toBeNull()
  })
})

// A passive carrying a non-attackRoll (attribute) effect: schema-legal, but no
// catalog passive currently uses one — so it exists only to prove the type
// filter actually excludes non-attackRoll effects.
const attributePassive = {
  kind: "passive",
  key: "test-attribute-passive",
  name: "Attribute Passive",
  tagline: "+5 Strength",
  description: "+5 Strength.",
  isSynthesis: false,
  effects: [{ type: "attribute", target: "strength", amount: 5 }],
} satisfies Skill

// An attackRoll effect with no explicit `source` label (source is optional).
const unsourcedBonus = {
  kind: "passive",
  key: "test-unsourced-bonus",
  name: "Unsourced Bonus",
  tagline: "+3 to all Attack Rolls",
  description: "+3 to all Attack Rolls.",
  isSynthesis: false,
  effects: [{ type: "attackRoll", amount: 3 }],
} satisfies Skill

describe("attackRollEffectsFromSkills", () => {
  it("returns exactly the attackRoll effects of passive Skills", () => {
    expect(attackRollEffectsFromSkills([slashBoost])).toEqual(
      slashBoost.effects
    )
  })

  it("excludes non-attackRoll effects (e.g. an attribute effect)", () => {
    expect(attackRollEffectsFromSkills([attributePassive])).toEqual([])
  })

  it("ignores non-passive Skills", () => {
    expect(attackRollEffectsFromSkills([garu])).toEqual([])
  })
})

describe("resolveAttackRoll — source labelling", () => {
  it("labels an effect with no explicit source as Bonus", () => {
    const character = makeWarrior({ activeSkills: [unsourcedBonus] })
    const resolved = resolveAttackRoll(SLASH_ST, character, null)
    expect(resolved.sources).toContainEqual({ source: "Bonus", amount: 3 })
  })
})

// Self-exclusion (activeLineage matching the scaler's lineage) only fires for an
// includesSelf:false scaler. These assert the scaler's own source amount (not the
// total), isolating self-exclusion from attribute math: with a party of 3 mages
// and amount 1, NOT subtracting self yields 3, subtracting self yields 2.
describe("resolveAttackRoll — perPartyLineage self-exclusion", () => {
  function selfExcludingMageSkill() {
    return {
      ...magicCircle,
      key: "magic-circle-self-excluding",
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
          source: "MC",
        },
      ],
    }
  }

  const mcAmount = (character: StatContext) =>
    resolveAttackRoll(FIRE_MAGICAL_MA, character, { mage: 3 }).sources.find(
      (s) => s.source === "MC"
    )?.amount

  it("subtracts self when the active Archetype shares the lineage", () => {
    const character = makeMage({ activeSkills: [selfExcludingMageSkill()] })
    expect(mcAmount(character)).toBe(2)
  })

  it("does not subtract self when there is no active Archetype", () => {
    const character = makeMage({
      activeArchetypeKey: null,
      activeSkills: [selfExcludingMageSkill()],
    })
    expect(mcAmount(character)).toBe(3)
  })

  it("does not subtract self when the active Archetype's lineage differs", () => {
    const character = makeWarrior({ activeSkills: [selfExcludingMageSkill()] })
    expect(mcAmount(character)).toBe(3)
  })

  it("does not subtract self when the active Archetype key does not resolve", () => {
    const character = makeWarrior({
      activeArchetypeKey: "does-not-exist",
      activeSkills: [selfExcludingMageSkill()],
    })
    expect(mcAmount(character)).toBe(3)
  })
})
