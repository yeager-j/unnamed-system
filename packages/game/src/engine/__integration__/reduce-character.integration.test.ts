import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  FIXTURE_CHARACTER_ID,
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import {
  makeArmor,
  makeConsumable,
  makeWeapon,
} from "@workspace/game/engine/__fixtures__/fixtures"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  makeAttackSkill,
  makePassiveSkill,
} from "@workspace/game/engine/__fixtures__/skills"
import { makeTalent } from "@workspace/game/engine/__fixtures__/talents"
import { MAX_CURRENCY } from "@workspace/game/engine/character/currency"
import {
  deriveHydratedCharacter,
  toRawInputs,
  type RawCharacterInputs,
} from "@workspace/game/engine/character/derive-hydrated-character"
import { reduceCharacter } from "@workspace/game/engine/character/reduce-character"
import type { CharacterEdit } from "@workspace/game/foundation/character/character-edit"
import type { HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import type { InventoryItemRow } from "@workspace/game/foundation/character/records"
import type { CombatContext } from "@workspace/game/foundation/character/state"

/**
 * A synthetic catalog covering the whole reduce pipeline. Every key below is a
 * real catalog slug used as an **opaque id** — the Archetypes, Skills, items,
 * Talent, and the cleave HP cost are values this file *assigns*, so the tests
 * assert the reducer's *behavior* (re-derive, clamp, no-op, mechanic dispatch)
 * and never the shipped catalog's balance. A rebalance can't break this slice.
 *
 * The five Archetypes carry the five distinct mechanics, and Warrior vs Mage
 * differ in attributes / affinities / Skills so a switch is observable.
 */
const CLEAVE_HP_PERCENT = 10

const fxWarrior = makeArchetype({
  key: "warrior",
  lineage: "warrior",
  mechanic: "perfection",
  attributes: { strength: 3, magic: 0, agility: 1, luck: 0 },
  affinities: { fire: "weak" },
  mastery: { kind: "hp", amount: 20 },
  skills: [
    { skill: "cleave", rank: 1 },
    { skill: "windblade", rank: 2 },
  ],
  synthesisSkill: { skill: "elemental-apocalypse", rank: 5 },
})
const fxMage = makeArchetype({
  key: "mage",
  lineage: "mage",
  mechanic: "stains",
  attributes: { strength: 0, magic: 3, agility: 0, luck: 1 },
  affinities: { ice: "resist" },
  mastery: { kind: "sp", amount: 20 },
  skills: [
    { skill: "zio", rank: 1 },
    { skill: "agi", rank: 1 },
  ],
})
const fxKnight = makeArchetype({
  key: "knight",
  lineage: "knight",
  mechanic: "valor",
})
const fxHealer = makeArchetype({
  key: "healer",
  lineage: "healer",
  mechanic: "path-of-dawn",
})
const fxWarlock = makeArchetype({
  key: "warlock",
  lineage: "warlock",
  mechanic: "path-of-dusk",
})

const TEST_DATA = makeTestGameData({
  archetypes: [fxWarrior, fxMage, fxKnight, fxHealer, fxWarlock],
  skills: [
    makeAttackSkill({
      key: "cleave",
      cost: { kind: "hp-percent", amount: CLEAVE_HP_PERCENT },
    }),
    makePassiveSkill({ key: "windblade" }),
    makePassiveSkill({ key: "elemental-apocalypse" }),
    makePassiveSkill({ key: "zio" }),
    makePassiveSkill({ key: "agi" }),
  ],
  items: [
    makeArmor("bladeturn-mail", [
      { type: "affinity", damageTypes: ["slash"], affinity: "resist" },
    ]),
    makeWeapon("runed-cane", [
      { type: "attribute", target: "magic", amount: 1 },
    ]),
    makeConsumable("soul-drop"),
  ],
  talents: [makeTalent("alchemy", "Alchemy")],
})

/** Test wrappers binding the fixture catalog so the boundary call sites stay
 *  terse; the engine itself takes the lookups + id generator explicitly. */
const derive = (raw: RawCharacterInputs, context?: CombatContext) =>
  deriveHydratedCharacter(TEST_DATA)(raw, context)
const reduce = (
  character: HydratedCharacter,
  edit: CharacterEdit,
  newId: () => string = () => crypto.randomUUID()
) => reduceCharacter(TEST_DATA, newId)(character, edit)

const inventoryRow = (
  partial: Pick<
    InventoryItemRow,
    "id" | "catalogItemKey" | "equipped" | "quantity"
  >
): InventoryItemRow => ({ characterId: FIXTURE_CHARACTER_ID, ...partial })

/** A Warrior (active) with an unequipped affinity-armor, an attribute-granting
 *  weapon, and a consumable stack — enough to prove every derived field
 *  re-computes. Cloned per call so tests can't leak. */
function makeRaw(): RawCharacterInputs {
  return makeRawCharacterInputs({
    row: { activeArchetypeId: "arch-1", originCharacterArchetypeId: "arch-1" },
    archetypeRows: [
      makeArchetypeRow({ id: "arch-1", archetypeKey: "warrior", rank: 1 }),
    ],
    inventoryRows: [
      inventoryRow({
        id: "row-mail",
        catalogItemKey: "bladeturn-mail",
        equipped: false,
        quantity: 1,
      }),
      inventoryRow({
        id: "row-cane",
        catalogItemKey: "runed-cane",
        equipped: false,
        quantity: 1,
      }),
      inventoryRow({
        id: "row-drop",
        catalogItemKey: "soul-drop",
        equipped: false,
        quantity: 5,
      }),
    ],
  })
}

const make = () => derive(makeRaw())

describe("toRawInputs / deriveHydratedCharacter round-trip", () => {
  it("re-deriving from the stripped inputs reproduces the character", () => {
    const character = make()
    expect(derive(toRawInputs(character))).toEqual(character)
  })
})

describe("deriveHydratedCharacter combat context", () => {
  it("folds zoneEffects into resolved Attack Rolls with their source label", () => {
    const raw = makeRaw()
    raw.inventoryRows = raw.inventoryRows.map((row) =>
      row.id === "row-cane" ? { ...row, equipped: true } : row
    )

    const base = derive(raw)
    const enchanted = derive(raw, {
      zoneEffects: [{ type: "attackRoll", amount: 2, source: "Toccata" }],
    })

    expect(enchanted.weaponAttackRoll?.total).toBe(
      (base.weaponAttackRoll?.total ?? 0) + 2
    )
    expect(enchanted.weaponAttackRoll?.sources).toContainEqual({
      source: "Toccata",
      amount: 2,
    })
  })
})

describe("deriveHydratedCharacter skill hydration", () => {
  it("resolves an hp-percent Skill cost against the character's derived max HP", () => {
    // Pinned at a higher Level so the derived max HP is well above the
    // floor-at-1 in resolveCost: the resolved amount must equal
    // floor(maxHP * pct / 100) and be > 1, so a wrong max HP flowing into the
    // hydration call site (UNN-350 seam) can't be masked by the floor.
    const raw = makeRaw()
    raw.row.level = 5
    const character = derive(raw)

    const cleave = character.skills.find((skill) => skill.key === "cleave")
    expect(cleave?.resolvedCost).toEqual({
      kind: "hp",
      amount: Math.floor((character.maxHP * CLEAVE_HP_PERCENT) / 100),
    })
    expect(cleave?.resolvedCost?.amount).toBeGreaterThan(1)
  })
})

describe("reduceCharacter", () => {
  it("equipping armor re-derives the affinity chart", () => {
    const character = make()
    expect(character.affinityChart.slash).not.toBe("resist")

    const next = reduce(character, {
      kind: "inventory",
      mutation: { kind: "equip", itemId: "row-mail" },
    })

    expect(next.affinityChart.slash).toBe("resist")
    expect(next.inventory.find((i) => i.id === "row-mail")?.equipped).toBe(true)
  })

  it("equipping a weapon re-derives attributes and the weapon attack roll", () => {
    const character = make()
    expect(character.weaponAttackRoll).toBeNull()

    const next = reduce(character, {
      kind: "inventory",
      mutation: { kind: "equip", itemId: "row-cane" },
    })

    expect(next.attributes.magic).toBe(character.attributes.magic + 1)
    expect(next.weaponAttackRoll).not.toBeNull()
  })

  it("adding a stackable consumable tops up the existing stack", () => {
    const next = reduce(
      make(),
      {
        kind: "inventory",
        mutation: { kind: "add", catalogItemKey: "soul-drop", quantity: 3 },
      },
      () => "should-not-be-used"
    )

    const drops = next.inventory.filter((i) => i.catalogItemKey === "soul-drop")
    expect(drops).toHaveLength(1)
    expect(drops[0]?.quantity).toBe(8)
  })

  it("setting a stack to 0 removes the row", () => {
    const next = reduce(make(), {
      kind: "inventory",
      mutation: { kind: "setQuantity", itemId: "row-drop", quantity: 0 },
    })

    expect(next.inventory.some((i) => i.id === "row-drop")).toBe(false)
  })

  it("clamps currency to [0, MAX_CURRENCY]", () => {
    const character = make()
    expect(reduce(character, { kind: "currency", delta: -1000 }).currency).toBe(
      0
    )
    expect(
      reduce(character, { kind: "currency", delta: 1_000_000_000 }).currency
    ).toBe(MAX_CURRENCY)
  })

  it("returns the input unchanged when the engine rejects the edit", () => {
    const character = make()
    const next = reduce(character, {
      kind: "inventory",
      mutation: { kind: "remove", itemId: "does-not-exist" },
    })
    expect(next).toBe(character)
  })

  it("awards victories and clamps at 0", () => {
    const character = make()
    expect(reduce(character, { kind: "victories", delta: 2 }).victories).toBe(2)
    expect(reduce(character, { kind: "victories", delta: -5 }).victories).toBe(
      0
    )
  })

  it("applies damage and clamps heal at max HP", () => {
    const character = make()
    const hurt = reduce(character, { kind: "damage", amount: 5 })
    expect(hurt.currentHP).toBe(character.currentHP - 5)
    const healed = reduce(hurt, { kind: "heal", amount: 9999 })
    expect(healed.currentHP).toBe(character.maxHP)
  })

  it("steps exhaustion and clamps at 0", () => {
    const character = make()
    const up = reduce(character, {
      kind: "exhaustion",
      direction: "increment",
    })
    expect(up.exhaustion).toBe(1)
    expect(
      reduce(character, { kind: "exhaustion", direction: "decrement" })
        .exhaustion
    ).toBe(0)
  })

  it("sets ailments and battle conditions, and clearCombatState wipes them", () => {
    const character = make()
    const ailing = reduce(character, {
      kind: "ailments",
      ailments: ["downed"],
    })
    expect(ailing.ailments).toEqual(["downed"])

    const buffed = reduce(ailing, {
      kind: "battleConditionAxis",
      axis: "attack",
      state: "increased",
    })
    expect(buffed.battleConditions?.attack).toBe("increased")

    const cleared = reduce(buffed, { kind: "clearCombatState" })
    expect(cleared.ailments).toEqual([])
    expect(cleared.battleConditions?.attack).toBe("neutral")
  })

  it("spends a Prisma charge and refuses at 0", () => {
    const character = make()
    const used = reduce(character, { kind: "usePrisma" })
    expect(used.prismaCharges).toBe(character.prismaCharges - 1)

    const empty = reduce(character, { kind: "currency", delta: 0 })
    const drained = { ...empty, prismaCharges: 0 }
    expect(reduce(drained, { kind: "usePrisma" })).toBe(drained)
  })

  it("steps the active Archetype's Perfection mechanic", () => {
    const character = make()
    const next = reduce(character, {
      kind: "perfection",
      op: "increment",
    })
    const mechanic = next.activeMechanic?.state
    expect(mechanic?.kind).toBe("perfection")
    expect(mechanic).toMatchObject({ rank: 1 })
  })

  /** A character whose single (active) Archetype is `archetypeKey`, so a
   *  mechanic edit for that Archetype's mechanic resolves and applies. */
  function makeWithActiveArchetype(archetypeKey: string): HydratedCharacter {
    const raw = makeRaw()
    raw.archetypeRows = [
      makeArchetypeRow({ id: "arch-1", archetypeKey, rank: 1 }),
    ]
    return derive(raw)
  }

  it("steps the active Archetype's Valor mechanic", () => {
    const knight = makeWithActiveArchetype("knight")
    const next = reduce(knight, {
      kind: "valor",
      direction: "increment",
    })
    expect(next.activeMechanic?.state.kind).toBe("valor")
    expect(next.activeMechanic?.state).not.toEqual(knight.activeMechanic?.state)
  })

  it("sets a slot on the active Archetype's Stains mechanic", () => {
    const mage = makeWithActiveArchetype("mage")
    const next = reduce(mage, {
      kind: "stains",
      op: "setSlot",
      slotIndex: 0,
      element: "fire",
    })
    expect(next.activeMechanic?.state.kind).toBe("stains")
    expect(next.activeMechanic?.state).not.toEqual(mage.activeMechanic?.state)
  })

  it("toggles the active Archetype's Path of Dawn mode", () => {
    const healer = makeWithActiveArchetype("healer")
    const next = reduce(healer, { kind: "pathOfDawn", dawnMode: true })
    expect(next.activeMechanic?.state.kind).toBe("path-of-dawn")
    expect(next.activeMechanic?.state).not.toEqual(healer.activeMechanic?.state)
  })

  it("toggles the active Archetype's Path of Dusk mode", () => {
    const warlock = makeWithActiveArchetype("warlock")
    const next = reduce(warlock, {
      kind: "pathOfDusk",
      duskMode: true,
    })
    expect(next.activeMechanic?.state.kind).toBe("path-of-dusk")
    expect(next.activeMechanic?.state).not.toEqual(
      warlock.activeMechanic?.state
    )
  })

  it("toggles a battle-condition flag", () => {
    const character = make()
    const next = reduce(character, {
      kind: "battleConditionFlag",
      flag: "charged",
      value: true,
    })
    expect(next.battleConditions?.charged).toBe(true)
  })

  it("spends and recovers SP", () => {
    const character = make()
    const spent = reduce(character, { kind: "spendSP", amount: 5 })
    expect(spent.currentSP).toBe(character.currentSP - 5)

    const recovered = reduce(spent, { kind: "recoverSP", amount: 3 })
    expect(recovered.currentSP).toBe(spent.currentSP + 3)
  })

  it("casts a Skill, paying its resolved cost", () => {
    const character = make()
    const next = reduce(character, {
      kind: "cast",
      skillKey: "cleave",
    })
    expect(next.currentHP).toBeLessThan(character.currentHP)
  })

  it("ranks up a Virtue once the Spark log is full", () => {
    const raw = makeRaw()
    raw.row.sparkLog = Array(7).fill("wisdom")
    const character = derive(raw)

    const next = reduce(character, {
      kind: "rankUpVirtue",
      virtue: "wisdom",
    })

    expect(next.virtueWisdom).toBe(character.virtueWisdom + 1)
    expect(next.sparkLog).toEqual([])
  })

  it("ignores a mechanic edit that doesn't match the active Archetype's mechanic", () => {
    // Establish a Perfection state on the active Archetype, then dispatch a
    // Valor edit: it must be a no-op rather than corrupting the Perfection
    // state through the transform's cast.
    const perfected = reduce(make(), {
      kind: "perfection",
      op: "increment",
    })
    expect(reduce(perfected, { kind: "valor", direction: "increment" })).toBe(
      perfected
    )
  })

  it("adds and removes gained talents", () => {
    const character = make()
    const added = reduce(character, {
      kind: "talentAdd",
      talentKey: "alchemy",
    })
    expect(added.gainedTalents).toContain("alchemy")
    const removed = reduce(added, {
      kind: "talentRemove",
      talentKey: "alchemy",
    })
    expect(removed.gainedTalents).not.toContain("alchemy")
  })

  it("adds a spark tagged with a virtue", () => {
    const character = make()
    const next = reduce(character, {
      kind: "addSpark",
      virtue: "wisdom",
    })
    expect(next.sparkLog).toEqual([...character.sparkLog, "wisdom"])
  })

  it("switches the active Archetype and re-derives attributes, affinities, skills, and mechanic", () => {
    const raw = makeRaw()
    raw.archetypeRows.push(
      makeArchetypeRow({ id: "arch-2", archetypeKey: "mage", rank: 1 })
    )
    const character = derive(raw)
    expect(character.activeArchetypeKey).toBe("warrior")

    const next = reduce(character, {
      kind: "switchActiveArchetype",
      characterArchetypeId: "arch-2",
    })

    expect(next.activeArchetypeId).toBe("arch-2")
    expect(next.activeArchetypeKey).toBe("mage")
    expect(next.attributes).not.toEqual(character.attributes)
    expect(next.affinityChart).not.toEqual(character.affinityChart)
    expect(next.skills).not.toEqual(character.skills)
    expect(next.activeMechanic?.state.kind).toBe("stains")
    expect(character.activeMechanic?.state.kind).toBe("perfection")
  })

  /** Warrior (active) + Mage so a slot can inherit across Archetypes. */
  function makeWithMage() {
    const raw = makeRaw()
    raw.archetypeRows.push(
      makeArchetypeRow({ id: "arch-2", archetypeKey: "mage", rank: 1 })
    )
    return derive(raw)
  }

  it("threads a slot inherited by the active Archetype into the Skills list", () => {
    const character = makeWithMage()
    expect(character.skills.some((s) => s.key === "agi")).toBe(false)

    const next = reduce(character, {
      kind: "setInheritanceSlot",
      characterArchetypeId: "arch-1",
      slotIndex: 0,
      sourceCharacterArchetypeId: "arch-2",
      skillKey: "agi",
    })

    expect(next.skills.some((s) => s.key === "agi")).toBe(true)
    expect(
      next.archetypeRows.find((a) => a.id === "arch-1")?.inheritanceSlots
    ).toEqual([
      { slotIndex: 0, sourceCharacterArchetypeId: "arch-2", skillKey: "agi" },
    ])
  })

  it("persists a slot on an inactive Archetype without touching the Skills list", () => {
    const character = makeWithMage()

    const next = reduce(character, {
      kind: "setInheritanceSlot",
      characterArchetypeId: "arch-2",
      slotIndex: 0,
      sourceCharacterArchetypeId: "arch-1",
      skillKey: "cleave",
    })

    expect(next.skills).toEqual(character.skills)
    expect(
      next.archetypeRows.find((a) => a.id === "arch-2")?.inheritanceSlots
    ).toEqual([
      {
        slotIndex: 0,
        sourceCharacterArchetypeId: "arch-1",
        skillKey: "cleave",
      },
    ])
  })

  it("clears a configured slot, dropping the inherited Skill", () => {
    const filled = reduce(makeWithMage(), {
      kind: "setInheritanceSlot",
      characterArchetypeId: "arch-1",
      slotIndex: 0,
      sourceCharacterArchetypeId: "arch-2",
      skillKey: "agi",
    })
    expect(filled.skills.some((s) => s.key === "agi")).toBe(true)

    const cleared = reduce(filled, {
      kind: "setInheritanceSlot",
      characterArchetypeId: "arch-1",
      slotIndex: 0,
      sourceCharacterArchetypeId: null,
      skillKey: null,
    })

    expect(cleared.skills.some((s) => s.key === "agi")).toBe(false)
    expect(
      cleared.archetypeRows.find((a) => a.id === "arch-1")?.inheritanceSlots
    ).toEqual([
      { slotIndex: 0, sourceCharacterArchetypeId: null, skillKey: null },
    ])
  })

  it("returns the input unchanged when the owner Archetype row is unknown", () => {
    const character = makeWithMage()
    expect(
      reduce(character, {
        kind: "setInheritanceSlot",
        characterArchetypeId: "does-not-exist",
        slotIndex: 0,
        sourceCharacterArchetypeId: "arch-2",
        skillKey: "agi",
      })
    ).toBe(character)
  })

  /** A finalized Warrior (active, arch-1) carrying `savedRanks` Saved Ranks. */
  function makeWithSavedRanks(savedRanks: number) {
    const raw = makeRaw()
    raw.row.savedArchetypeRanks = savedRanks
    return derive(raw)
  }

  it("unlocks a new Archetype at Rank 1 and spends a Saved Rank", () => {
    const character = makeWithSavedRanks(2)
    expect(character.archetypeRows.some((a) => a.archetypeKey === "mage")).toBe(
      false
    )

    const next = reduce(character, {
      kind: "unlockArchetype",
      archetypeKey: "mage",
    })

    const mage = next.archetypeRows.find((a) => a.archetypeKey === "mage")
    expect(mage?.rank).toBe(1)
    expect(mage?.inheritanceSlots).toEqual([])
    expect(next.savedArchetypeRanks).toBe(1)
  })

  it("does not unlock an already-owned Archetype", () => {
    const character = makeWithSavedRanks(2)
    expect(
      reduce(character, {
        kind: "unlockArchetype",
        archetypeKey: "warrior",
      })
    ).toBe(character)
  })

  it("does not unlock when no Saved Rank is available", () => {
    const character = makeWithSavedRanks(0)
    expect(
      reduce(character, {
        kind: "unlockArchetype",
        archetypeKey: "mage",
      })
    ).toBe(character)
  })

  it("does not unlock an unknown Archetype key", () => {
    const character = makeWithSavedRanks(2)
    expect(
      reduce(character, {
        kind: "unlockArchetype",
        archetypeKey: "not-a-real-archetype",
      })
    ).toBe(character)
  })

  it("ranks up an owned Archetype, spends a Rank, and re-derives active Skills", () => {
    const character = makeWithSavedRanks(2)
    const rankOneSkills = character.skills.length

    const next = reduce(character, {
      kind: "rankUpArchetype",
      characterArchetypeId: "arch-1",
    })

    expect(next.archetypeRows.find((a) => a.id === "arch-1")?.rank).toBe(2)
    expect(next.savedArchetypeRanks).toBe(1)
    // Warrior's Rank-2 Skill becomes active once the row reaches Rank 2.
    expect(next.skills.length).toBeGreaterThan(rankOneSkills)
  })

  it("does not rank up at the Mastery Rank", () => {
    const raw = makeRaw()
    raw.row.savedArchetypeRanks = 2
    raw.archetypeRows[0]!.rank = 5
    const character = derive(raw)

    expect(
      reduce(character, {
        kind: "rankUpArchetype",
        characterArchetypeId: "arch-1",
      })
    ).toBe(character)
  })

  it("does not rank up when no Saved Rank is available", () => {
    const character = makeWithSavedRanks(0)
    expect(
      reduce(character, {
        kind: "rankUpArchetype",
        characterArchetypeId: "arch-1",
      })
    ).toBe(character)
  })

  it("does not rank up an unknown Archetype row", () => {
    const character = makeWithSavedRanks(2)
    expect(
      reduce(character, {
        kind: "rankUpArchetype",
        characterArchetypeId: "does-not-exist",
      })
    ).toBe(character)
  })
})

describe("deriveHydratedCharacter weapon & skill attack-roll wiring", () => {
  const KIND_BONUS = 3
  const PER_ALLY = 2

  /** A Warrior whose passives grant (a) an attack-kind-filtered flat Attack-Roll
   *  bonus and (b) a party-lineage-scaled bonus, plus a weapon to swing — so the
   *  weapon Attack Roll's kind discriminant and partyComposition flow are both
   *  observable, and a passive's (empty) damage bonuses are too. */
  const wiringWarrior = makeArchetype({
    key: "warrior",
    lineage: "warrior",
    mechanic: "perfection",
    skills: [
      { skill: "shield-arts", rank: 1 },
      { skill: "flash-bomb", rank: 1 },
    ],
  })
  const WIRING_DATA = makeTestGameData({
    archetypes: [wiringWarrior],
    skills: [
      makePassiveSkill({
        key: "shield-arts",
        effects: [
          {
            type: "attackRoll",
            when: { skillKinds: ["attack"] },
            amount: KIND_BONUS,
            source: "Attack Booster",
          },
        ],
      }),
      makePassiveSkill({
        key: "flash-bomb",
        effects: [
          {
            type: "attackRoll",
            scaler: {
              kind: "perPartyLineage",
              lineage: "mage",
              amount: PER_ALLY,
              includesSelf: true,
            },
            source: "Magic Circle",
          },
        ],
      }),
    ],
    items: [makeWeapon("blade")],
  })
  const deriveWiring = (raw: RawCharacterInputs, context?: CombatContext) =>
    deriveHydratedCharacter(WIRING_DATA)(raw, context)

  function wiringRaw(): RawCharacterInputs {
    return makeRawCharacterInputs({
      row: {
        activeArchetypeId: "arch-1",
        originCharacterArchetypeId: "arch-1",
      },
      archetypeRows: [
        makeArchetypeRow({ id: "arch-1", archetypeKey: "warrior", rank: 1 }),
      ],
      inventoryRows: [
        inventoryRow({
          id: "row-blade",
          catalogItemKey: "blade",
          equipped: true,
          quantity: 1,
        }),
      ],
    })
  }

  it("leaves weaponDamageBonuses empty when no weapon is equipped", () => {
    const raw = wiringRaw()
    raw.inventoryRows = []
    const character = deriveWiring(raw)
    expect(character.weaponAttackRoll).toBeNull()
    expect(character.weaponDamageBonuses).toEqual([])
  })

  it("leaves a passive Skill's resolvedDamageBonuses empty (it makes no Attack Roll)", () => {
    const booster = deriveWiring(wiringRaw()).skills.find(
      (skill) => skill.key === "shield-arts"
    )
    expect(booster?.resolvedDamageBonuses).toEqual([])
  })

  it("folds an attack-kind-filtered passive bonus into the weapon Attack Roll", () => {
    const character = deriveWiring(wiringRaw())
    expect(character.weaponAttackRoll?.sources).toContainEqual({
      source: "Attack Booster",
      amount: KIND_BONUS,
    })
  })

  it("scales the weapon Attack Roll by party composition", () => {
    const base = deriveWiring(wiringRaw())
    const withParty = deriveWiring(wiringRaw(), {
      partyComposition: { mage: 2 },
    })
    expect(
      (withParty.weaponAttackRoll?.total ?? 0) -
        (base.weaponAttackRoll?.total ?? 0)
    ).toBe(PER_ALLY * 2)
  })
})
