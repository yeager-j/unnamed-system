import { describe, expect, it } from "vitest"

import { entityWriteSchema } from "./write.schema"
import { applyEntityWrite } from "./writers"

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
