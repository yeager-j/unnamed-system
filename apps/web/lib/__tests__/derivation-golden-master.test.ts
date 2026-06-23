import { describe, expect, it } from "vitest"

import type { ArchetypeBase } from "@workspace/game-v2/archetypes"
import { createGameEngine } from "@workspace/game-v2/composition"
import type { CombatantEffect } from "@workspace/game-v2/kernel"
import {
  makeArchetype as makeV2Archetype,
  makeTestGameData as makeV2GameData,
} from "@workspace/game-v2/progression/__fixtures__/derive"
import { deriveHydratedCharacter } from "@workspace/game/engine"
import { makeArchetype as makeV1Archetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import { makeTestGameData as makeV1GameData } from "@workspace/game/engine/__fixtures__/game-data"

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
    zoneEffects: spec.contextEffects ?? [],
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
