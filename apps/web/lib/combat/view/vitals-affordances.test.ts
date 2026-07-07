import { describe, expect, it } from "vitest"

import { vitalsAffordances } from "./vitals-affordances"

describe("vitalsAffordances", () => {
  it("gates setMax to the inline home (a PC's max derives from the engine)", () => {
    expect(vitalsAffordances(false, false).setMax).toBe(true)
    expect(vitalsAffordances(true, false).setMax).toBe(false)
  })

  it("gates usePrisma on a resolved Prisma pool", () => {
    expect(vitalsAffordances(false, false).usePrisma).toBe(false)
    expect(vitalsAffordances(true, true).usePrisma).toBe(true)
    expect(vitalsAffordances(false, true).usePrisma).toBe(true)
  })
})
