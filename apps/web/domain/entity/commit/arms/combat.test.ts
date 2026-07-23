import { describe, expect, it } from "vitest"

import {
  mechanicsWriter,
  resourcesWriter,
  skillPoolWriter,
  vitalsWriter,
} from "./combat"

describe("vitalsWriter", () => {
  it("writes vitals and skill-pool depletion through their own components", () => {
    expect(
      vitalsWriter.applyOp(
        { vitals: { base: 20, damage: 2 } },
        { component: "vitals", op: "damage", amount: 3 }
      )
    ).toEqual({ ok: true, value: { vitals: { base: 20, damage: 5 } } })
    expect(
      skillPoolWriter.applyOp(
        { skillPool: { base: 10, spSpent: 2 } },
        { component: "skillPool", op: "heal", amount: 1 }
      )
    ).toEqual({ ok: true, value: { skillPool: { base: 10, spSpent: 1 } } })
  })
})

describe("skillPoolWriter", () => {
  it("refuses when the skill-pool capability is absent", () => {
    expect(
      skillPoolWriter.applyOp(
        {},
        {
          component: "skillPool",
          op: "damage",
          amount: 1,
        }
      )
    ).toEqual({ ok: false, error: "capability-missing" })
  })
})

describe("resourcesWriter", () => {
  it("refuses when the resources capability is absent", () => {
    expect(
      resourcesWriter.applyOp({}, { component: "resources", op: "usePrisma" })
    ).toEqual({ ok: false, error: "capability-missing" })
  })
})

describe("mechanicsWriter", () => {
  it("refuses when the mechanics capability is absent", () => {
    expect(
      mechanicsWriter.applyOp(
        {},
        {
          component: "mechanics",
          mechanic: "valor",
          transition: { op: "adjust", delta: 1 },
        }
      )
    ).toEqual({ ok: false, error: "capability-missing" })
  })
})
