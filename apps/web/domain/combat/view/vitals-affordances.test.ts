import { describe, expect, it } from "vitest"

import { vitalsAffordances } from "./vitals-affordances"

describe("vitalsAffordances", () => {
  it("gates setMax to the enemy home (a PC's max derives from the engine)", () => {
    expect(vitalsAffordances("enemy", false).setMax).toBe(true)
    expect(vitalsAffordances("pc", false).setMax).toBe(false)
  })

  it("gates usePrisma on a resolved Prisma pool", () => {
    expect(vitalsAffordances("enemy", false).usePrisma).toBe(false)
    expect(vitalsAffordances("pc", true).usePrisma).toBe(true)
    expect(vitalsAffordances("enemy", true).usePrisma).toBe(true)
  })
})
