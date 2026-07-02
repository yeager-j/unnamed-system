import { describe, expect, it } from "vitest"

import { vitalsAffordances } from "./vitals-affordances"

describe("vitalsAffordances", () => {
  it("gates setMax to the inline home (a PC's max derives from the engine)", () => {
    expect(vitalsAffordances(false, {}).setMax).toBe(true)
    expect(vitalsAffordances(true, {}).setMax).toBe(false)
  })

  it("gates usePrisma on a resolved cap — absent today, so never rendered", () => {
    expect(vitalsAffordances(false, {}).usePrisma).toBe(false)
    expect(vitalsAffordances(true, {}).usePrisma).toBe(false)
    expect(vitalsAffordances(false, { maxPrisma: 3 }).usePrisma).toBe(true)
  })
})
