import { describe, expect, it } from "vitest"

import type { ArchetypeBase } from "@workspace/game-v2/archetypes"
import { createGameEngine } from "@workspace/game-v2/composition"
import type { CombatantEffect } from "@workspace/game-v2/kernel"
import {
  makeArchetype as makeV2Archetype,
  makeTestGameData as makeV2GameData,
} from "@workspace/game-v2/progression/__fixtures__/derive"
import { isFallen as v2IsFallen } from "@workspace/game-v2/vitals/operations"
import { deriveHydratedCharacter } from "@workspace/game/engine"
import { makeArchetype as makeV1Archetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import { makeTestGameData as makeV1GameData } from "@workspace/game/engine/__fixtures__/game-data"
import { isFallen as v1IsFallen } from "@workspace/game/foundation"

import { rawInputsToEntity } from "@/lib/game-v2/raw-inputs-to-entity"

/**
 * **Golden-master parity (UNN-500).** The de-risk: run v1's proven derivation and
 * v2's new component `resolve` over the **same fixture characters** and assert the
 * resolved numbers match exactly. v1 is the oracle — expected values are never
 * hand-coded — so a mis-ported formula in v2 fails loudly here.
 *
 * Fixture-backed, not real-catalog (the engine's discipline): the same plain spec
 * builds a v1 Archetype + RawCharacterInputs and a v2 fixture `GameData`, and the
 * v2 entity flows through the real `rawInputsToEntity` adapter — so the projection
 * is part of what's gated. Scope is PR2's numbers: attributes, maxHP/maxSP, the
 * affinity chart, and the dice maxima (skills/attack rolls/depletion are later PRs).
 */

const MASTERY = {
  strength: { kind: "attribute", amount: 2, attribute: "strength" },
  hp: { kind: "hp", amount: 20 },
  none: { kind: "hp", amount: 0 },
} as const

interface ArchetypeSpec {
  key: string
  attributes: { strength: number; magic: number; agility: number; luck: number }
  affinities: Record<
    string,
    "weak" | "resist" | "null" | "repel" | "drain" | "neutral"
  >
  mastery: (typeof MASTERY)[keyof typeof MASTERY]
  lineage: "warrior" | "mage" | "knight"
}

interface CharacterSpec {
  name: string
  level: number
  pathChoice: "health-focused" | "balanced" | "skill-focused"
  activeKey: string | null
  roster: ReadonlyArray<{ key: string; rank: number }>
  manualBonuses: Record<string, number>
  archetypes: ReadonlyArray<ArchetypeSpec>
  /** Combat/zone effects threaded through BOTH engines' context (default none). */
  contextEffects?: readonly CombatantEffect[]
  /** v1 stored current pools; default full (fixture's 20/20). Drives depletion parity. */
  currentHP?: number
  currentSP?: number
}

const SPECS: ReadonlyArray<CharacterSpec> = [
  {
    name: "L1 balanced, no archetype",
    level: 1,
    pathChoice: "balanced",
    activeKey: null,
    roster: [],
    manualBonuses: {},
    archetypes: [],
  },
  {
    name: "L1 health-focused warrior, rank 1 (no mastery yet)",
    level: 1,
    pathChoice: "health-focused",
    activeKey: "warrior",
    roster: [{ key: "warrior", rank: 1 }],
    manualBonuses: {},
    archetypes: [
      {
        key: "warrior",
        attributes: { strength: 3, magic: -1, agility: 1, luck: 0 },
        affinities: { fire: "resist", ice: "weak" },
        mastery: MASTERY.strength,
        lineage: "warrior",
      },
    ],
  },
  {
    name: "L7 skill-focused mage with mastery + manual bonuses",
    level: 7,
    pathChoice: "skill-focused",
    activeKey: "mage",
    roster: [{ key: "mage", rank: 5 }],
    manualBonuses: { magic: 2, hp: 4, luck: -9 },
    archetypes: [
      {
        key: "mage",
        attributes: { strength: 0, magic: 6, agility: 0, luck: 1 },
        affinities: { fire: "weak", soul: "drain", dark: "null" },
        mastery: MASTERY.strength,
        lineage: "mage",
      },
    ],
  },
  {
    name: "L13 balanced knight active, with an INACTIVE mastered archetype (C4)",
    level: 13,
    pathChoice: "balanced",
    activeKey: "knight",
    roster: [
      { key: "knight", rank: 6 },
      { key: "warrior", rank: 5 }, // inactive, rank ≥ 5 ⇒ its HP mastery still applies
    ],
    manualBonuses: {},
    archetypes: [
      {
        key: "knight",
        attributes: { strength: 2, magic: 0, agility: 3, luck: 1 },
        affinities: { strike: "resist", elec: "weak" },
        mastery: MASTERY.strength,
        lineage: "knight",
      },
      {
        key: "warrior",
        attributes: { strength: 5, magic: 0, agility: 0, luck: 0 },
        affinities: {},
        mastery: MASTERY.hp, // +20 HP even though warrior is inactive
        lineage: "warrior",
      },
    ],
  },
  {
    // Threads zone/context effects through both engines so the affinity
    // resolver's candidate path — strongest-of-many beating the base — is parity-
    // checked against v1, not just v2's unit test.
    name: "L5 balanced warrior with zone effects (affinity candidates + attribute bonus)",
    level: 5,
    pathChoice: "balanced",
    activeKey: "warrior",
    roster: [{ key: "warrior", rank: 1 }],
    manualBonuses: {},
    contextEffects: [
      { type: "attribute", target: "magic", amount: 3 },
      // Two candidates on fire — strongest (drain) must win over the base weak.
      { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
      { type: "affinity", damageTypes: ["fire"], affinity: "drain" },
      // A single candidate replacing a neutral base.
      { type: "affinity", damageTypes: ["ice"], affinity: "null" },
    ],
    archetypes: [
      {
        key: "warrior",
        attributes: { strength: 2, magic: 1, agility: 0, luck: 0 },
        affinities: { fire: "weak" },
        mastery: MASTERY.strength,
        lineage: "warrior",
      },
    ],
  },
]

function v1Numbers(spec: CharacterSpec) {
  const archetypeRows = spec.roster.map((r) =>
    makeArchetypeRow({ id: `arch-${r.key}`, archetypeKey: r.key, rank: r.rank })
  )
  const raw = makeRawCharacterInputs({
    row: {
      name: spec.name,
      level: spec.level,
      pathChoice: spec.pathChoice,
      manualBonuses: spec.manualBonuses,
      activeArchetypeId: spec.activeKey ? `arch-${spec.activeKey}` : null,
      savedArchetypeRanks: 0,
      ...(spec.currentHP !== undefined ? { currentHP: spec.currentHP } : {}),
      ...(spec.currentSP !== undefined ? { currentSP: spec.currentSP } : {}),
    },
    archetypeRows,
  })
  const lookups = makeV1GameData({
    archetypes: spec.archetypes.map((a) =>
      makeV1Archetype({
        key: a.key,
        attributes: a.attributes,
        affinities: a.affinities,
        mastery: a.mastery,
        lineage: a.lineage,
      })
    ),
  })
  const hydrated = deriveHydratedCharacter(lookups)(raw, {
    zoneEffects: spec.contextEffects ?? [],
  })
  return { hydrated, raw }
}

function v2Numbers(
  spec: CharacterSpec,
  raw: ReturnType<typeof v1Numbers>["raw"]
) {
  const archetypes: Record<string, ArchetypeBase> = {}
  for (const a of spec.archetypes) {
    archetypes[a.key] = makeV2Archetype({
      attributes: a.attributes,
      affinities: a.affinities,
      mastery: a.mastery,
      lineage: a.lineage,
    })
  }
  const { resolve } = createGameEngine(makeV2GameData(archetypes))
  return resolve(rawInputsToEntity(raw), {
    effects: spec.contextEffects ?? [],
  }).components
}

describe("v1 ↔ v2 derivation golden-master", () => {
  for (const spec of SPECS) {
    it(`matches resolved numbers for: ${spec.name}`, () => {
      const { hydrated, raw } = v1Numbers(spec)
      const v2 = v2Numbers(spec, raw)

      expect(v2.attributes).toEqual(hydrated.attributes)
      expect(v2.vitals?.maxHP).toBe(hydrated.maxHP)
      expect(v2.skillPool?.maxSP).toBe(hydrated.maxSP)
      expect(v2.affinities).toEqual(hydrated.affinityChart)
      expect(v2.resources?.maxHitDice).toBe(hydrated.maxHitDice)
      expect(v2.resources?.maxSkillDice).toBe(hydrated.maxSkillDice)
    })
  }
})

/**
 * **Depletion parity (UNN-501).** v2 supersedes v1's stored `currentHP`/`currentSP`
 * with the signed-depletion model (store `damage`/`spSpent`, derive current). Parity
 * is therefore on the **derived current values + Fallen**, not storage: project v1's
 * stored current into v2's `damage = v1.maxHP − v1.currentHP` (v1 is the oracle for
 * both the maxima and the current), resolve v2, and assert the derived currents and
 * the Fallen predicate match. v1 can't represent over-max/over-kill, so those are
 * v2-only fixtures below — no oracle.
 */
function v2WithDepletion(
  spec: CharacterSpec,
  raw: ReturnType<typeof v1Numbers>["raw"],
  hydrated: ReturnType<typeof v1Numbers>["hydrated"]
) {
  const archetypes: Record<string, ArchetypeBase> = {}
  for (const a of spec.archetypes) {
    archetypes[a.key] = makeV2Archetype({
      attributes: a.attributes,
      affinities: a.affinities,
      mastery: a.mastery,
      lineage: a.lineage,
    })
  }
  const { resolve } = createGameEngine(makeV2GameData(archetypes))
  const entity = rawInputsToEntity(raw)
  // The cutover projection: v1 stored current → v2 signed damage, against v1's
  // resolved maxima (the oracle). v2 re-derives the same maxima, so current matches.
  entity.components.vitals = {
    base: 0,
    damage: hydrated.maxHP - hydrated.currentHP,
  }
  entity.components.skillPool = {
    base: 0,
    spSpent: hydrated.maxSP - hydrated.currentSP,
  }
  return resolve(entity, { effects: spec.contextEffects ?? [] }).components
}

const DEPLETION_SCENARIOS: ReadonlyArray<{
  base: CharacterSpec
  currentHP: number
  currentSP: number
}> = [
  { base: SPECS[1]!, currentHP: 18, currentSP: 30 }, // L1 health warrior, partial
  { base: SPECS[2]!, currentHP: 30, currentSP: 25 }, // L7 mage, partial both
  { base: SPECS[3]!, currentHP: 0, currentSP: 10 }, // L13 knight, Fallen (HP 0)
]

describe("v1 ↔ v2 depletion (current values) golden-master", () => {
  for (const { base, currentHP, currentSP } of DEPLETION_SCENARIOS) {
    const spec: CharacterSpec = { ...base, currentHP, currentSP }
    it(`matches current HP/SP + Fallen for: ${spec.name} (${currentHP} HP)`, () => {
      const { hydrated, raw } = v1Numbers(spec)
      const v2 = v2WithDepletion(spec, raw, hydrated)

      expect(v2.vitals?.currentHP).toBe(hydrated.currentHP)
      expect(v2.skillPool?.currentSP).toBe(hydrated.currentSP)
      expect(v2IsFallen(v2.vitals!)).toBe(v1IsFallen(hydrated.currentHP))
    })
  }
})

describe("v2-only depletion the v1 model can't represent", () => {
  const { resolve } = createGameEngine(makeV2GameData({}))

  // An enemy-like authored base (no Progression/Archetypes) carrying signed damage.
  const enemy = (damage: number) => ({
    id: "usury-enemy",
    components: {
      identity: { name: "Usury Enemy" },
      vitals: { base: 100, damage },
      skillPool: { base: 30, spSpent: 0 },
    },
  })

  it("over-max: a negative damage floats currentHP above the honest maxHP (115/100)", () => {
    const v2 = resolve(enemy(-15)).components
    expect(v2.vitals).toEqual({ maxHP: 100, currentHP: 115 })
    expect(v2IsFallen(v2.vitals!)).toBe(false)
  })

  it("over-kill: damage past maxHP floors currentHP at 0 and reports Fallen", () => {
    const v2 = resolve(enemy(130)).components
    expect(v2.vitals).toEqual({ maxHP: 100, currentHP: 0 })
    expect(v2IsFallen(v2.vitals!)).toBe(true)
  })
})
