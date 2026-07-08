import { describe, expect, it } from "vitest"

import { emptyNarrative } from "@workspace/game-v2/narrative"

import { combatEntityWriteSchema, entityWriteSchema } from "./write.schema"
import { applyEntityWrite, ENTITY_WRITERS } from "./writers"

describe("entityWriteSchema — the storage-blind descriptor", () => {
  it.each([
    { component: "vitals", op: "damage", amount: 5 },
    { component: "vitals", op: "heal", amount: 3 },
    { component: "skillPool", op: "setMax", amount: 12 },
    { component: "resources", op: "usePrisma" },
    {
      component: "mechanics",
      mechanic: "perfection",
      transition: { op: "adjust", delta: 1 },
    },
    {
      component: "mechanics",
      mechanic: "frenzy",
      transition: { op: "setFrenzyMode", value: true },
    },
    { component: "rest", op: "fullRest" },
    { component: "rest", op: "partialRest", skillDiceToSpend: 2, rolled: 7 },
    { component: "rest", op: "respite", hitDiceToSpend: 1, rolled: 4 },
    { component: "exhaustion", op: "setLevel", level: 3 },
    { component: "level", op: "awardVictory" },
    { component: "level", op: "levelUp" },
    { component: "archetypes", op: "setActive", archetypeKey: "mage" },
  ])("accepts %j", (write) => {
    expect(entityWriteSchema.safeParse(write).success).toBe(true)
  })

  it.each([
    { component: "vitals", op: "damage", amount: 0 },
    { component: "vitals", op: "damage", amount: -3 },
    { component: "vitals", op: "usePrisma" },
    { component: "resources", op: "damage", amount: 1 },
    { component: "rest", op: "partialRest", skillDiceToSpend: -1, rolled: 4 },
    { component: "rest", op: "respite", hitDiceToSpend: 1, rolled: 2.5 },
    { component: "exhaustion", op: "setLevel", level: 7 },
    { component: "level", op: "setLevel", value: 5 },
    // A foreign transition descriptor fails the per-mechanic registry schema.
    {
      component: "mechanics",
      mechanic: "perfection",
      transition: { op: "setMode", value: true },
    },
    // A mechanic with no write surface rejects at the boundary.
    { component: "mechanics", mechanic: "enchantment", transition: {} },
  ])("rejects %j", (write) => {
    expect(entityWriteSchema.safeParse(write).success).toBe(false)
  })
})

describe("applyEntityWrite — pools", () => {
  const components = {
    vitals: { base: 20, damage: 5 },
    skillPool: { base: 10, spSpent: 4 },
  }

  it("damage adds signed depletion (v2 semantics)", () => {
    const result = applyEntityWrite(components, {
      component: "vitals",
      op: "damage",
      amount: 7,
    })
    expect(result).toEqual({
      ok: true,
      value: { vitals: { base: 20, damage: 12 } },
    })
  })

  it("heal floors at 0 and preserves an over-max balance (no-op)", () => {
    const healed = applyEntityWrite(components, {
      component: "vitals",
      op: "heal",
      amount: 9,
    })
    expect(healed).toEqual({
      ok: true,
      value: { vitals: { base: 20, damage: 0 } },
    })

    const overMax = applyEntityWrite(
      { vitals: { base: 20, damage: -3 } },
      { component: "vitals", op: "heal", amount: 5 }
    )
    expect(overMax).toEqual({
      ok: true,
      value: { vitals: { base: 20, damage: -3 } },
    })
  })

  it("skillPool damage/heal ride spend/recover", () => {
    const spent = applyEntityWrite(components, {
      component: "skillPool",
      op: "damage",
      amount: 2,
    })
    expect(spent).toEqual({
      ok: true,
      value: { skillPool: { base: 10, spSpent: 6 } },
    })
  })

  it("setMax writes the authored base", () => {
    const result = applyEntityWrite(components, {
      component: "vitals",
      op: "setMax",
      amount: 30,
    })
    expect(result).toEqual({
      ok: true,
      value: { vitals: { base: 30, damage: 5 } },
    })
  })

  it("refuses a write against an absent component (capability-missing)", () => {
    const result = applyEntityWrite(
      { vitals: { base: 20, damage: 0 } },
      { component: "skillPool", op: "damage", amount: 1 }
    )
    expect(result).toEqual({ ok: false, error: "capability-missing" })
  })
})

describe("applyEntityWrite — resources", () => {
  const use = { component: "resources", op: "usePrisma" } as const

  it("uses a charge under the base cap", () => {
    expect(
      applyEntityWrite(
        { resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 1 } },
        use
      )
    ).toEqual({
      ok: true,
      value: {
        resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 2 },
      },
    })
  })

  it("refuses at the cap (no-prisma-charges)", () => {
    expect(
      applyEntityWrite(
        { resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 2 } },
        use
      )
    ).toEqual({
      ok: false,
      error: "no-prisma-charges",
    })
  })

  it("refuses without the component (capability-missing)", () => {
    expect(applyEntityWrite({}, use)).toEqual({
      ok: false,
      error: "capability-missing",
    })
  })
})

describe("applyEntityWrite — mechanics", () => {
  it("applies a validated transition through the registry", () => {
    const result = applyEntityWrite(
      {
        mechanics: {
          states: { perfection: { kind: "perfection", rank: 2 } },
        },
      },
      {
        component: "mechanics",
        mechanic: "perfection",
        transition: { op: "adjust", delta: 1 },
      }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        mechanics: { states: { perfection: { kind: "perfection", rank: 3 } } },
      },
    })
  })

  it("coerces an absent-but-owned state to the mechanic's initial state (the read path's fallback)", () => {
    // Finalize only seeds the Origin's mechanic; a later roster entry has no
    // stored state until first touched, yet its widget renders from the
    // synthesized initial state — the first write must transition from that.
    const result = applyEntityWrite(
      { mechanics: { states: {} } },
      {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 1 },
      }
    )
    expect(result).toEqual({
      ok: true,
      value: { mechanics: { states: { valor: { kind: "valor", value: 1 } } } },
    })
  })

  it("refuses without the mechanics component (capability-missing)", () => {
    const result = applyEntityWrite(
      {},
      {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 1 },
      }
    )
    expect(result).toEqual({ ok: false, error: "capability-missing" })
  })
})

describe("entityWriteSchema — the creation families (UNN-556)", () => {
  it.each([
    { component: "path", op: "setChoice", choice: "health-focused" },
    { component: "archetypes", op: "setOrigin", archetypeKey: "warrior" },
    { component: "talents", op: "setGained", keys: ["acrobat", "chef"] },
    {
      component: "virtues",
      op: "setAllocation",
      ranks: { expression: 2, empathy: 1, wisdom: 1, focus: 0 },
    },
    { component: "narrative", op: "setField", field: "hopes", value: "peace" },
    { component: "narrative", op: "addListEntry", list: "knives" },
    { component: "narrative", op: "removeListEntry", list: "chains", index: 0 },
    { component: "virtues", op: "addSpark", virtue: "empathy" },
    { component: "virtues", op: "rankUp", virtue: "focus" },
    { component: "talents", op: "add", key: "chef" },
    { component: "talents", op: "remove", key: "chef" },
    {
      component: "narrative",
      op: "setListEntry",
      list: "knives",
      index: 1,
      field: "title",
      value: "The debt",
    },
  ])("accepts %j", (write) => {
    expect(entityWriteSchema.safeParse(write).success).toBe(true)
  })

  it.each([
    { component: "path", op: "setChoice", choice: "hp" },
    { component: "archetypes", op: "setOrigin", archetypeKey: "" },
    // over the player-added cap
    { component: "talents", op: "setGained", keys: ["a", "b", "c"] },
    // duplicate keys
    { component: "talents", op: "setGained", keys: ["chef", "chef"] },
    // out-of-domain rank on the wire
    {
      component: "virtues",
      op: "setAllocation",
      ranks: { expression: 3, empathy: 1, wisdom: 1, focus: 0 },
    },
    // not a Virtue
    { component: "virtues", op: "addSpark", virtue: "courage" },
    { component: "talents", op: "add", key: "" },
    { component: "narrative", op: "setField", field: "knives", value: "x" },
    {
      component: "narrative",
      op: "setListEntry",
      list: "knives",
      index: -1,
      field: "title",
      value: "x",
    },
  ])("rejects %j", (write) => {
    expect(entityWriteSchema.safeParse(write).success).toBe(false)
  })
})

describe("combatEntityWriteSchema — the encounter-wire subset (UNN-556)", () => {
  it.each([
    { component: "vitals", op: "damage", amount: 5 },
    { component: "resources", op: "usePrisma" },
    {
      component: "mechanics",
      mechanic: "perfection",
      transition: { op: "adjust", delta: 1 },
    },
  ])("still accepts the combat arm %j", (write) => {
    expect(combatEntityWriteSchema.safeParse(write).success).toBe(true)
  })

  it.each([
    { component: "path", op: "setChoice", choice: "balanced" },
    { component: "archetypes", op: "setOrigin", archetypeKey: "warrior" },
    { component: "talents", op: "setGained", keys: ["chef"] },
    {
      component: "virtues",
      op: "setAllocation",
      ranks: { expression: 2, empathy: 1, wisdom: 1, focus: 0 },
    },
    { component: "narrative", op: "setField", field: "hopes", value: "x" },
    { component: "narrative", op: "addListEntry", list: "chains" },
    { component: "rest", op: "fullRest" },
    { component: "exhaustion", op: "setLevel", level: 2 },
    { component: "level", op: "awardVictory" },
    { component: "archetypes", op: "setActive", archetypeKey: "mage" },
    { component: "virtues", op: "addSpark", virtue: "wisdom" },
    { component: "virtues", op: "rankUp", virtue: "wisdom" },
    { component: "talents", op: "add", key: "chef" },
    { component: "talents", op: "remove", key: "chef" },
    { component: "equipment", op: "equip", itemId: "a" },
    {
      component: "equipment",
      op: "add",
      catalogItemKey: "soul-drop",
      quantity: 1,
      idSeed: "0f37bd58-9f9a-4bb1-b34d-6f7f0e2f8f11",
    },
    { component: "equipment", op: "addCurrency", amount: 5 },
  ])("rejects the character-only family %j", (write) => {
    expect(combatEntityWriteSchema.safeParse(write).success).toBe(false)
  })
})

describe("applyEntityWrite — character transitions (UNN-557)", () => {
  const resting = {
    vitals: { base: 0, damage: 12 },
    skillPool: { base: 0, spSpent: 9 },
    resources: { hitDiceUsed: 2, skillDiceUsed: 3, prismaUsed: 1 },
    exhaustion: { level: 2 },
    level: { value: 4, victories: 0 },
    path: { choice: "balanced" as const },
  }

  it("rest.fullRest zeroes every spend and steps exhaustion down (whole components)", () => {
    const result = applyEntityWrite(resting, {
      component: "rest",
      op: "fullRest",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        vitals: { base: 0, damage: 0 },
        skillPool: { base: 0, spSpent: 0 },
        resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
        exhaustion: { level: 1 },
      },
    })
  })

  it("rest.partialRest spends skill dice + recovers rolled SP; patch omits untouched components", () => {
    const result = applyEntityWrite(resting, {
      component: "rest",
      op: "partialRest",
      skillDiceToSpend: 2,
      rolled: 6,
    })
    expect(result).toEqual({
      ok: true,
      value: {
        vitals: { base: 0, damage: 0 },
        skillPool: { base: 0, spSpent: 3 },
        resources: { hitDiceUsed: 2, skillDiceUsed: 5, prismaUsed: 1 },
      },
    })
  })

  it("rest.respite refuses an over-spend of hit dice (failure matrix)", () => {
    // L4 ⇒ maxHitDice 5; 2 used ⇒ 3 unspent.
    const result = applyEntityWrite(resting, {
      component: "rest",
      op: "respite",
      hitDiceToSpend: 4,
      rolled: 10,
    })
    expect(result).toEqual({ ok: false, error: "insufficient-hit-dice" })
  })

  it("rest refuses when a resting component is absent (capability-missing)", () => {
    const { exhaustion: _exhaustion, ...withoutExhaustion } = resting
    const result = applyEntityWrite(withoutExhaustion, {
      component: "rest",
      op: "fullRest",
    })
    expect(result).toEqual({ ok: false, error: "capability-missing" })
  })

  it("exhaustion.setLevel writes the level", () => {
    const result = applyEntityWrite(resting, {
      component: "exhaustion",
      op: "setLevel",
      level: 5,
    })
    expect(result).toEqual({ ok: true, value: { exhaustion: { level: 5 } } })
  })

  it("level.awardVictory / removeVictory track the bank", () => {
    const awarded = applyEntityWrite(resting, {
      component: "level",
      op: "awardVictory",
    })
    expect(awarded).toEqual({
      ok: true,
      value: { level: { value: 4, victories: 1 } },
    })

    const removed = applyEntityWrite(resting, {
      component: "level",
      op: "removeVictory",
    })
    expect(removed).toEqual({
      ok: true,
      value: { level: { value: 4, victories: 0 } },
    })
  })

  it("level.levelUp spends 7 victories into level + saved ranks (progression-only patch)", () => {
    const components = {
      level: { value: 4, victories: 8 },
      archetypes: {
        active: "knight",
        origin: "knight",
        savedArchetypeRanks: 1,
        roster: [{ key: "knight", rank: 3, inheritanceSlots: [] }],
      },
    }
    const result = applyEntityWrite(components, {
      component: "level",
      op: "levelUp",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        level: { value: 5, victories: 1 },
        archetypes: { ...components.archetypes, savedArchetypeRanks: 3 },
      },
    })
  })

  it("level.levelUp refuses under 7 victories", () => {
    const result = applyEntityWrite(
      { ...resting, archetypes: { ...knightRoster() } },
      { component: "level", op: "levelUp" }
    )
    expect(result).toEqual({ ok: false, error: "insufficient-victories" })
  })

  it("archetypes.setActive re-points active within the roster", () => {
    const components = {
      archetypes: {
        ...knightRoster(),
        roster: [
          { key: "knight", rank: 3, inheritanceSlots: [] },
          { key: "mage", rank: 1, inheritanceSlots: [] },
        ],
      },
    }
    const result = applyEntityWrite(components, {
      component: "archetypes",
      op: "setActive",
      archetypeKey: "mage",
    })
    expect(result).toEqual({
      ok: true,
      value: { archetypes: { ...components.archetypes, active: "mage" } },
    })
  })

  it("archetypes.setActive refuses a key outside the roster (not-unlocked)", () => {
    const result = applyEntityWrite(
      { archetypes: knightRoster() },
      { component: "archetypes", op: "setActive", archetypeKey: "priest" }
    )
    expect(result).toEqual({ ok: false, error: "not-unlocked" })
  })
})

function knightRoster() {
  return {
    active: "knight",
    origin: "knight",
    savedArchetypeRanks: 0,
    roster: [{ key: "knight", rank: 3, inheritanceSlots: [] }],
  }
}

describe("applyEntityWrite — creation families (UNN-556)", () => {
  it("path.setChoice replaces the choice (identity class)", () => {
    const result = applyEntityWrite(
      { path: { choice: "balanced" } },
      { component: "path", op: "setChoice", choice: "skill-focused" }
    )
    expect(result).toEqual({
      ok: true,
      value: { path: { choice: "skill-focused" } },
    })
    expect(ENTITY_WRITERS.path.durableClass).toBe("identity")
  })

  it("archetypes.setOrigin creates from absent at the Origin auto-rank", () => {
    const result = applyEntityWrite(
      {},
      { component: "archetypes", op: "setOrigin", archetypeKey: "warrior" }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        archetypes: {
          active: "warrior",
          origin: "warrior",
          savedArchetypeRanks: 0,
          roster: [{ key: "warrior", rank: 2, inheritanceSlots: [] }],
        },
      },
    })
    expect(ENTITY_WRITERS.archetypes.durableClass).toBe("progression")
  })

  it("archetypes.setOrigin switch is delete-and-replace, preserving saved ranks", () => {
    const result = applyEntityWrite(
      {
        archetypes: {
          active: "warrior",
          origin: "warrior",
          savedArchetypeRanks: 3,
          roster: [{ key: "warrior", rank: 2, inheritanceSlots: [] }],
        },
      },
      { component: "archetypes", op: "setOrigin", archetypeKey: "mage" }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        archetypes: {
          active: "mage",
          origin: "mage",
          savedArchetypeRanks: 3,
          roster: [{ key: "mage", rank: 2, inheritanceSlots: [] }],
        },
      },
    })
  })

  it("talents.setGained replaces the whole list", () => {
    const result = applyEntityWrite(
      { talents: [{ key: "old" }] },
      { component: "talents", op: "setGained", keys: ["acrobat", "chef"] }
    )
    expect(result).toEqual({
      ok: true,
      value: { talents: [{ key: "acrobat" }, { key: "chef" }] },
    })
    expect(ENTITY_WRITERS.talents.durableClass).toBe("identity")
  })

  it("virtues.setAllocation accepts a partial mid-flow allocation", () => {
    const result = applyEntityWrite(
      { virtues: { ranks: zeroRanks(), sparkLog: ["wisdom"] } },
      {
        component: "virtues",
        op: "setAllocation",
        ranks: { expression: 2, empathy: 0, wisdom: 0, focus: 0 },
      }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        virtues: {
          ranks: { expression: 2, empathy: 0, wisdom: 0, focus: 0 },
          sparkLog: ["wisdom"],
        },
      },
    })
    expect(ENTITY_WRITERS.virtues.durableClass).toBe("progression")
  })

  it.each([
    // two Virtues at +2
    { expression: 2, empathy: 2, wisdom: 0, focus: 0 },
    // three Virtues at +1
    { expression: 1, empathy: 1, wisdom: 1, focus: 0 },
  ])("virtues.setAllocation refuses the cap violation %j", (ranks) => {
    const result = applyEntityWrite(
      { virtues: { ranks: zeroRanks(), sparkLog: [] } },
      { component: "virtues", op: "setAllocation", ranks }
    )
    expect(result).toEqual({ ok: false, error: "allocation-cap-exceeded" })
  })

  it("virtues.setAllocation creates from absent with an empty Spark log", () => {
    const result = applyEntityWrite(
      {},
      {
        component: "virtues",
        op: "setAllocation",
        ranks: { expression: 0, empathy: 1, wisdom: 0, focus: 0 },
      }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        virtues: {
          ranks: { expression: 0, empathy: 1, wisdom: 0, focus: 0 },
          sparkLog: [],
        },
      },
    })
  })

  it("narrative.setField creates from absent with full schema totality", () => {
    const result = applyEntityWrite(
      {},
      {
        component: "narrative",
        op: "setField",
        field: "hopes",
        value: "peace",
      }
    )
    expect(result).toEqual({
      ok: true,
      value: { narrative: { ...emptyNarrative(), hopes: "peace" } },
    })
    expect(ENTITY_WRITERS.narrative.durableClass).toBe("identity")
  })

  it("narrative.setField stores an empty string as null (canonical payload)", () => {
    const result = applyEntityWrite(
      { narrative: { ...emptyNarrative(), hopes: "peace" } },
      { component: "narrative", op: "setField", field: "hopes", value: "" }
    )
    expect(result).toEqual({
      ok: true,
      value: { narrative: emptyNarrative() },
    })
  })

  it("narrative.addListEntry appends an empty beat", () => {
    const base = { ...emptyNarrative(), backstory: "kept" }
    const result = applyEntityWrite(
      { narrative: base },
      { component: "narrative", op: "addListEntry", list: "knives" }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        narrative: { ...base, knives: [{ title: "", description: null }] },
      },
    })
  })

  it("narrative.setListEntry edits one entry field in place", () => {
    const base = {
      ...emptyNarrative(),
      knives: [
        { title: "The debt", description: "unpaid" },
        { title: "Mira", description: null },
      ],
    }
    const result = applyEntityWrite(
      { narrative: base },
      {
        component: "narrative",
        op: "setListEntry",
        list: "knives",
        index: 1,
        field: "description",
        value: "my sister",
      }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        narrative: {
          ...base,
          knives: [
            { title: "The debt", description: "unpaid" },
            { title: "Mira", description: "my sister" },
          ],
        },
      },
    })
  })

  it("narrative.setListEntry refuses an out-of-range index (raced a remove)", () => {
    const result = applyEntityWrite(
      { narrative: emptyNarrative() },
      {
        component: "narrative",
        op: "setListEntry",
        list: "knives",
        index: 0,
        field: "title",
        value: "x",
      }
    )
    expect(result).toEqual({ ok: false, error: "entry-not-found" })
  })

  it("narrative.removeListEntry splices the addressed entry", () => {
    const base = {
      ...emptyNarrative(),
      chains: [
        { title: "A", description: null },
        { title: "B", description: null },
      ],
    }
    const result = applyEntityWrite(
      { narrative: base },
      {
        component: "narrative",
        op: "removeListEntry",
        list: "chains",
        index: 0,
      }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        narrative: { ...base, chains: [{ title: "B", description: null }] },
      },
    })
  })
})

describe("applyEntityWrite — the Spark loop + Talent learning (UNN-558)", () => {
  const fullLog = [
    "wisdom",
    "wisdom",
    "empathy",
    "focus",
    "wisdom",
    "empathy",
    "focus",
  ] as const

  it("virtues.addSpark appends the tagged Spark", () => {
    const result = applyEntityWrite(
      { virtues: { ranks: zeroRanks(), sparkLog: ["wisdom"] } },
      { component: "virtues", op: "addSpark", virtue: "empathy" }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        virtues: { ranks: zeroRanks(), sparkLog: ["wisdom", "empathy"] },
      },
    })
  })

  it("virtues.addSpark refuses the 8th Spark (log-full — the forced-rank-up prompt)", () => {
    const result = applyEntityWrite(
      { virtues: { ranks: zeroRanks(), sparkLog: [...fullLog] } },
      { component: "virtues", op: "addSpark", virtue: "wisdom" }
    )
    expect(result).toEqual({ ok: false, error: "log-full" })
  })

  it("virtues.rankUp bumps an eligible Virtue and clears the log", () => {
    const result = applyEntityWrite(
      { virtues: { ranks: zeroRanks(), sparkLog: [...fullLog] } },
      { component: "virtues", op: "rankUp", virtue: "wisdom" }
    )
    expect(result).toEqual({
      ok: true,
      value: {
        virtues: { ranks: { ...zeroRanks(), wisdom: 1 }, sparkLog: [] },
      },
    })
  })

  it("virtues.rankUp refuses before the log is full", () => {
    const result = applyEntityWrite(
      { virtues: { ranks: zeroRanks(), sparkLog: ["wisdom"] } },
      { component: "virtues", op: "rankUp", virtue: "wisdom" }
    )
    expect(result).toEqual({ ok: false, error: "log-not-full" })
  })

  it("virtues.rankUp refuses a Virtue absent from the log (eligibility)", () => {
    const result = applyEntityWrite(
      { virtues: { ranks: zeroRanks(), sparkLog: [...fullLog] } },
      { component: "virtues", op: "rankUp", virtue: "expression" }
    )
    expect(result).toEqual({ ok: false, error: "virtue-not-eligible" })
  })

  it("virtues.rankUp refuses at the rank ceiling, keeping the log spendable", () => {
    const components = {
      virtues: {
        ranks: { ...zeroRanks(), wisdom: 7 },
        sparkLog: [...fullLog],
      },
    }
    const result = applyEntityWrite(components, {
      component: "virtues",
      op: "rankUp",
      virtue: "wisdom",
    })
    expect(result).toEqual({ ok: false, error: "rank-capped" })
    expect(components.virtues.sparkLog).toHaveLength(7)
  })

  it("virtues.addSpark / rankUp refuse without the component", () => {
    const spark = applyEntityWrite(
      {},
      { component: "virtues", op: "addSpark", virtue: "wisdom" }
    )
    const rank = applyEntityWrite(
      {},
      { component: "virtues", op: "rankUp", virtue: "wisdom" }
    )
    expect(spark).toEqual({ ok: false, error: "capability-missing" })
    expect(rank).toEqual({ ok: false, error: "capability-missing" })
  })

  it("talents.add appends, creating from absent", () => {
    const result = applyEntityWrite(
      {},
      { component: "talents", op: "add", key: "chef" }
    )
    expect(result).toEqual({ ok: true, value: { talents: [{ key: "chef" }] } })
  })

  it("talents.add is idempotent on a duplicate key", () => {
    const result = applyEntityWrite(
      { talents: [{ key: "chef" }] },
      { component: "talents", op: "add", key: "chef" }
    )
    expect(result).toEqual({ ok: true, value: { talents: [{ key: "chef" }] } })
  })

  it("talents.remove filters the addressed key", () => {
    const result = applyEntityWrite(
      { talents: [{ key: "chef" }, { key: "acrobat" }] },
      { component: "talents", op: "remove", key: "chef" }
    )
    expect(result).toEqual({
      ok: true,
      value: { talents: [{ key: "acrobat" }] },
    })
  })

  it("talents.remove refuses a missing key (raced a remove)", () => {
    const result = applyEntityWrite(
      { talents: [{ key: "acrobat" }] },
      { component: "talents", op: "remove", key: "chef" }
    )
    expect(result).toEqual({ ok: false, error: "entry-not-found" })
  })
})

function zeroRanks() {
  return { expression: 0, empathy: 0, wisdom: 0, focus: 0 }
}
