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
  ])("accepts %j", (write) => {
    expect(entityWriteSchema.safeParse(write).success).toBe(true)
  })

  it.each([
    { component: "vitals", op: "damage", amount: 0 },
    { component: "vitals", op: "damage", amount: -3 },
    { component: "vitals", op: "usePrisma" },
    { component: "resources", op: "damage", amount: 1 },
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
    const result = applyEntityWrite(
      components,
      { component: "vitals", op: "damage", amount: 7 },
      {}
    )
    expect(result).toEqual({
      ok: true,
      value: { vitals: { base: 20, damage: 12 } },
    })
  })

  it("heal floors at 0 and preserves an over-max balance (no-op)", () => {
    const healed = applyEntityWrite(
      components,
      { component: "vitals", op: "heal", amount: 9 },
      {}
    )
    expect(healed).toEqual({
      ok: true,
      value: { vitals: { base: 20, damage: 0 } },
    })

    const overMax = applyEntityWrite(
      { vitals: { base: 20, damage: -3 } },
      { component: "vitals", op: "heal", amount: 5 },
      {}
    )
    expect(overMax).toEqual({
      ok: true,
      value: { vitals: { base: 20, damage: -3 } },
    })
  })

  it("skillPool damage/heal ride spend/recover", () => {
    const spent = applyEntityWrite(
      components,
      { component: "skillPool", op: "damage", amount: 2 },
      {}
    )
    expect(spent).toEqual({
      ok: true,
      value: { skillPool: { base: 10, spSpent: 6 } },
    })
  })

  it("setMax writes the authored base", () => {
    const result = applyEntityWrite(
      components,
      { component: "vitals", op: "setMax", amount: 30 },
      {}
    )
    expect(result).toEqual({
      ok: true,
      value: { vitals: { base: 30, damage: 5 } },
    })
  })

  it("refuses a write against an absent component (capability-missing)", () => {
    const result = applyEntityWrite(
      { vitals: { base: 20, damage: 0 } },
      { component: "skillPool", op: "damage", amount: 1 },
      {}
    )
    expect(result).toEqual({ ok: false, error: "capability-missing" })
  })
})

describe("applyEntityWrite — resources (deps-driven refusal)", () => {
  const components = {
    resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 1 },
  }
  const use = { component: "resources", op: "usePrisma" } as const

  it("refuses without a resolved max (no-prisma-max)", () => {
    expect(applyEntityWrite(components, use, {})).toEqual({
      ok: false,
      error: "no-prisma-max",
    })
  })

  it("refuses at the cap (no-prisma-charges)", () => {
    expect(applyEntityWrite(components, use, { maxPrisma: 1 })).toEqual({
      ok: false,
      error: "no-prisma-charges",
    })
  })

  it("uses a charge under the cap", () => {
    expect(applyEntityWrite(components, use, { maxPrisma: 2 })).toEqual({
      ok: true,
      value: {
        resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 2 },
      },
    })
  })

  it("refuses without the component (capability-missing)", () => {
    expect(applyEntityWrite({}, use, { maxPrisma: 2 })).toEqual({
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
      },
      {}
    )
    expect(result).toEqual({
      ok: true,
      value: {
        mechanics: { states: { perfection: { kind: "perfection", rank: 3 } } },
      },
    })
  })

  it("refuses when the participant lacks that mechanic's state", () => {
    const result = applyEntityWrite(
      { mechanics: { states: {} } },
      {
        component: "mechanics",
        mechanic: "valor",
        transition: { op: "adjust", delta: 1 },
      },
      {}
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
  ])("rejects the character-only family %j", (write) => {
    expect(combatEntityWriteSchema.safeParse(write).success).toBe(false)
  })
})

describe("applyEntityWrite — creation families (UNN-556)", () => {
  it("path.setChoice replaces the choice (identity class)", () => {
    const result = applyEntityWrite(
      { path: { choice: "balanced" } },
      { component: "path", op: "setChoice", choice: "skill-focused" },
      {}
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
      { component: "archetypes", op: "setOrigin", archetypeKey: "warrior" },
      {}
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
      { component: "archetypes", op: "setOrigin", archetypeKey: "mage" },
      {}
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
      { component: "talents", op: "setGained", keys: ["acrobat", "chef"] },
      {}
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
      },
      {}
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
      { component: "virtues", op: "setAllocation", ranks },
      {}
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
      },
      {}
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
      },
      {}
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
      { component: "narrative", op: "setField", field: "hopes", value: "" },
      {}
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
      { component: "narrative", op: "addListEntry", list: "knives" },
      {}
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
      },
      {}
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
      },
      {}
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
      },
      {}
    )
    expect(result).toEqual({
      ok: true,
      value: {
        narrative: { ...base, chains: [{ title: "B", description: null }] },
      },
    })
  })
})

function zeroRanks() {
  return { expression: 0, empathy: 0, wisdom: 0, focus: 0 }
}
