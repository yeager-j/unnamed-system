import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes"
import { createGameEngine } from "@workspace/game-v2/composition"
import { makeItemLookups } from "@workspace/game-v2/items/__fixtures__/catalog"
import type { Item as V2Item } from "@workspace/game-v2/items/item.schema"
import type { CombatantEffect } from "@workspace/game-v2/kernel"
import {
  makeArchetype as makeV2Archetype,
  makeTestGameData as makeV2GameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"
import type { Skill as V2Skill } from "@workspace/game-v2/skills/skill.schema"
import { isFallen as v2IsFallen } from "@workspace/game-v2/vitals/operations"
import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "@workspace/game/engine"
import { makeArchetype as makeV1Archetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import { makeTestGameData as makeV1GameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  makeAttackSkill as makeV1AttackSkill,
  makePassiveSkill as makeV1PassiveSkill,
} from "@workspace/game/engine/__fixtures__/skills"
import { isFallen as v1IsFallen } from "@workspace/game/foundation"
import type { CombatContext } from "@workspace/game/foundation/character/state"
import type { Item as V1Item } from "@workspace/game/foundation/items/schema"
import type { Skill as V1Skill } from "@workspace/game/foundation/skills/schema"

import { createDeriveHydratedCharacterV2 } from "@/lib/game-v2/derive-hydrated-character"
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
  const archetypes: Record<string, Archetype> = {}
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
  const archetypes: Record<string, Archetype> = {}
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

/**
 * **Full-sheet projection golden-master (UNN-533, PR11a).** Runs the whole
 * v2-backed `createDeriveHydratedCharacterV2` projection against v1's
 * `deriveHydratedCharacter` over fixture catalogs — the edges the real-catalog
 * seed-parity suite (`derive-parity.test.ts`) can't reach: an `hp-percent` cost's
 * floor, a `perPartyLineage` scaler with a party context, a null mechanic state's
 * `initialState()` coercion, an unknown catalog item, and the one documented
 * SUPERSEDE where the engines deliberately diverge.
 *
 * The dual materialization is deliberate: the two catalogs share keys but not
 * shapes (v2 Skills/Items are facet-composed — UNN-506/UNN-503), so each spec
 * authors its v1 and v2 artifacts side by side, sharing the effect literals
 * (identical schemas on both sides).
 */
function projectBoth(opts: {
  raw: RawCharacterInputs
  context?: CombatContext
  v1Archetypes?: readonly ReturnType<typeof makeV1Archetype>[]
  v2Archetypes?: Record<string, Archetype>
  v1Skills?: readonly V1Skill[]
  v2Skills?: readonly V2Skill[]
  v1Items?: readonly V1Item[]
  v2Items?: readonly V2Item[]
}) {
  const lookups = makeV1GameData({
    archetypes: opts.v1Archetypes,
    skills: opts.v1Skills,
    items: opts.v1Items,
  })
  const engine = createGameEngine({
    ...makeV2GameData(opts.v2Archetypes ?? {}),
    ...makeItemLookups({ items: opts.v2Items, skills: opts.v2Skills }),
  })
  return {
    v1: deriveHydratedCharacter(lookups)(opts.raw, opts.context),
    v2: createDeriveHydratedCharacterV2(lookups, engine)(
      opts.raw,
      opts.context
    ),
  }
}

describe("v1 ↔ v2 full-sheet projection golden-master", () => {
  it("matches skills (hp-percent cost, scaler Attack Roll), weapon readouts, items, and talents", () => {
    // Effect literals are shared verbatim by both catalogs (identical schemas).
    const circleEffects = [
      {
        type: "attackRoll" as const,
        source: "Fixture Circle",
        scaler: {
          kind: "perPartyLineage" as const,
          lineage: "mage" as const,
          amount: 1,
          includesSelf: false,
        },
        when: { deliveries: ["magical" as const] },
      },
    ]
    const attackRoll = { attribute: "ma" as const, tiers: [] }

    // The granted Skill reuses the real key "garu" as an opaque id — v1's item
    // `skillKey` is registry-narrowed, but the fixture object is what resolves.
    const v1Skills: V1Skill[] = [
      makeV1AttackSkill({
        key: "agi",
        cost: { kind: "hp-percent", amount: 5 },
        damageType: "fire",
        delivery: "magical",
        attackRoll,
      }),
      makeV1PassiveSkill({ key: "magic-circle", effects: circleEffects }),
      makeV1PassiveSkill({ key: "garu" }),
    ]
    const v2Skills: V2Skill[] = [
      {
        kind: "attack",
        key: "agi",
        name: "agi",
        tagline: "agi",
        description: "agi",
        isSynthesis: false,
        cost: { kind: "hp-percent", amount: 5 },
        range: { kind: "known", value: "engaged" },
        damage: { damageType: "fire", delivery: "magical" },
        attackRoll,
      },
      {
        kind: "passive",
        key: "magic-circle",
        name: "magic-circle",
        tagline: "magic-circle",
        description: "magic-circle",
        isSynthesis: false,
        effects: circleEffects,
      },
      {
        kind: "passive",
        key: "garu",
        name: "garu",
        tagline: "garu",
        description: "garu",
        isSynthesis: false,
      },
    ]

    const v1Items: V1Item[] = [
      {
        key: "fixture-blade",
        name: "Fixture Blade",
        description: "A fixture weapon.",
        stackSize: 1,
        equip: {
          slot: "weapon",
          effects: [{ type: "attribute", target: "magic", amount: 1 }],
          intrinsicAttack: {
            range: { kind: "known", value: "engaged" },
            damageType: "strike",
            delivery: "physical",
            attackRoll: { attribute: "st", tiers: [] },
          },
        },
      },
      {
        key: "fixture-band",
        name: "Fixture Band",
        description: "A fixture accessory.",
        stackSize: 1,
        equip: {
          slot: "accessory",
          effects: [{ type: "skill", skillKey: "garu" }],
        },
      },
    ]
    const v2Items: V2Item[] = [
      {
        key: "fixture-blade",
        name: "Fixture Blade",
        description: "A fixture weapon.",
        stackSize: 1,
        equip: {
          slot: "weapon",
          effects: [{ type: "attribute", target: "magic", amount: 1 }],
          intrinsicAttack: {
            range: { kind: "known", value: "engaged" },
            damageType: "strike",
            delivery: "physical",
            attackRoll: { attribute: "st", tiers: [] },
          },
        },
      },
      {
        key: "fixture-band",
        name: "Fixture Band",
        description: "A fixture accessory.",
        stackSize: 1,
        equip: {
          slot: "accessory",
          effects: [{ type: "skill", skillKey: "garu" }],
        },
      },
    ]

    const raw = makeRawCharacterInputs({
      row: {
        level: 3,
        activeArchetypeId: "arch-mage",
        gainedTalents: ["climb"],
      },
      archetypeRows: [
        makeArchetypeRow({
          id: "arch-mage",
          archetypeKey: "mage",
          rank: 1,
        }),
      ],
      inventoryRows: [
        {
          id: "inv-blade",
          characterId: "fixture-char",
          catalogItemKey: "fixture-blade",
          equipped: true,
          quantity: 1,
        },
        {
          id: "inv-band",
          characterId: "fixture-char",
          catalogItemKey: "fixture-band",
          equipped: true,
          quantity: 1,
        },
        {
          id: "inv-spare",
          characterId: "fixture-char",
          catalogItemKey: "fixture-blade",
          equipped: false,
          quantity: 2,
        },
      ],
    })

    const archetypeSpec = () => ({
      key: "mage",
      attributes: { strength: 0, magic: 4, agility: 1, luck: 1 },
      affinities: { fire: "resist" } as const,
      lineage: "mage" as const,
      talents: ["athletics", "lift"] as ("athletics" | "lift")[],
      skills: [
        { rank: 1, skill: "agi" as const },
        { rank: 1, skill: "magic-circle" as const },
      ],
    })

    const { v1, v2 } = projectBoth({
      raw,
      context: { partyComposition: { mage: 3, warrior: 1 } },
      v1Archetypes: [makeV1Archetype(archetypeSpec())],
      v2Archetypes: { mage: makeV2Archetype(archetypeSpec()) },
      v1Skills,
      v2Skills,
      v1Items,
      v2Items,
    })

    expect(v2).toEqual(v1)
    // Guard against a vacuous pass: the interesting readouts must be live.
    expect(v1.skills.map((s) => s.key)).toEqual(["agi", "magic-circle", "garu"])
    expect(v1.skills[0]?.resolvedCost).not.toBeNull()
    expect(v1.skills[0]?.resolvedAttackRoll?.sources.length).toBeGreaterThan(1)
    expect(v1.weaponAttackRoll).not.toBeNull()
    expect(v1.talents).toEqual(["athletics", "climb", "lift"])
  })

  it("coerces a null mechanic state to initialState() for the active archetype", () => {
    const archetype = {
      key: "warrior",
      attributes: { strength: 3, magic: 0, agility: 1, luck: 0 },
      mastery: { kind: "hp", amount: 0 },
      lineage: "warrior",
      mechanic: "perfection",
    } as const

    const raw = makeRawCharacterInputs({
      row: { activeArchetypeId: "arch-warrior" },
      archetypeRows: [
        makeArchetypeRow({
          id: "arch-warrior",
          archetypeKey: "warrior",
          mechanicState: null,
        }),
      ],
    })

    const { v1, v2 } = projectBoth({
      raw,
      v1Archetypes: [makeV1Archetype({ ...archetype })],
      v2Archetypes: { warrior: makeV2Archetype({ ...archetype }) },
    })

    expect(v2).toEqual(v1)
    expect(v1.activeMechanic).toEqual({
      kind: "perfection",
      state: { kind: "perfection", rank: 0 },
    })
  })

  it("folds a stored mechanic state's Attack-Roll effects into the weapon readout (Perfection rank 3)", () => {
    const archetype = {
      key: "warrior",
      attributes: { strength: 3, magic: 0, agility: 1, luck: 0 },
      lineage: "warrior",
      mechanic: "perfection",
    } as const
    const weapon = {
      key: "fixture-axe",
      name: "Fixture Axe",
      description: "A fixture weapon.",
      stackSize: 1,
      equip: {
        slot: "weapon" as const,
        intrinsicAttack: {
          range: { kind: "known" as const, value: "engaged" as const },
          damageType: "slash" as const,
          delivery: "physical" as const,
          attackRoll: { attribute: "st" as const, tiers: [] },
        },
      },
    }

    const raw = makeRawCharacterInputs({
      row: { activeArchetypeId: "arch-warrior" },
      archetypeRows: [
        makeArchetypeRow({
          id: "arch-warrior",
          archetypeKey: "warrior",
          mechanicState: { kind: "perfection", rank: 3 },
        }),
      ],
      inventoryRows: [
        {
          id: "inv-axe",
          characterId: "fixture-char",
          catalogItemKey: "fixture-axe",
          equipped: true,
          quantity: 1,
        },
      ],
    })

    const { v1, v2 } = projectBoth({
      raw,
      v1Archetypes: [makeV1Archetype({ ...archetype })],
      v2Archetypes: { warrior: makeV2Archetype({ ...archetype }) },
      v1Items: [weapon],
      v2Items: [weapon],
    })

    expect(v2).toEqual(v1)
    expect(v1.activeMechanic?.state).toEqual({ kind: "perfection", rank: 3 })
    // The Perfection bonus must actually land beside the attribute source.
    expect(v1.weaponAttackRoll?.sources.length).toBeGreaterThan(1)
  })

  it("hydrates an unknown catalog item as `item: undefined` on both engines", () => {
    const raw = makeRawCharacterInputs({
      inventoryRows: [
        {
          id: "inv-relic",
          characterId: "fixture-char",
          catalogItemKey: "long-lost-relic",
          equipped: true,
          quantity: 1,
        },
      ],
    })

    const { v1, v2 } = projectBoth({ raw })

    expect(v2).toEqual(v1)
    expect(v1.inventory[0]?.item).toBeUndefined()
    expect(v1.weaponAttackRoll).toBeNull()
  })

  it("SUPERSEDE (D19/UNN-503): equipment-granted Skills apply without an active archetype in v2 only", () => {
    // v1 gates equipment grants on an active archetype (`active ? activeSkillsFor
    // : []`); v2 collects them unconditionally — the accepted divergence, pinned
    // here so a red diff points at the decision, not a bug. The granted Skill is
    // effect-free, so every other derived field still matches.
    const granted = {
      kind: "passive" as const,
      key: "garu",
      name: "garu",
      tagline: "garu",
      description: "garu",
      isSynthesis: false,
    }
    const band: V1Item & V2Item = {
      key: "fixture-band",
      name: "Fixture Band",
      description: "A fixture accessory.",
      stackSize: 1,
      equip: {
        slot: "accessory",
        effects: [{ type: "skill", skillKey: "garu" }],
      },
    }

    const raw = makeRawCharacterInputs({
      inventoryRows: [
        {
          id: "inv-band",
          characterId: "fixture-char",
          catalogItemKey: "fixture-band",
          equipped: true,
          quantity: 1,
        },
      ],
    })

    const { v1, v2 } = projectBoth({
      raw,
      v1Skills: [makeV1PassiveSkill({ key: "garu" })],
      v2Skills: [granted],
      v1Items: [band],
      v2Items: [band],
    })

    expect(v1.skills).toEqual([])
    expect(v2.skills.map((s) => s.key)).toEqual(["garu"])
    expect({ ...v2, skills: [] }).toEqual({ ...v1, skills: [] })
  })
})
