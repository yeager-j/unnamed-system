import { describe, expect, it } from "vitest"

import { EDIT_SURFACE_CLASS, type VersionClass } from "./version-classes"

describe("EDIT_SURFACE_CLASS", () => {
  it("pins the rationale-bearing surface assignments", () => {
    // The per-surface-not-per-table call: the wallet rides inventoryVersion
    // because it lives on the Inventory tab (UNN-223), despite being a
    // `characters` column.
    expect(EDIT_SURFACE_CLASS.currency).toBe("inventory")
    expect(EDIT_SURFACE_CLASS.inventoryItems).toBe("inventory")

    // Same domain (Virtues), different surfaces, different classes: builder
    // allocation is identity; sheet rank-up / spark are progression.
    expect(EDIT_SURFACE_CLASS.virtuesAllocation).toBe("identity")
    expect(EDIT_SURFACE_CLASS.virtueRankUp).toBe("progression")
    expect(EDIT_SURFACE_CLASS.spark).toBe("progression")

    expect(EDIT_SURFACE_CLASS.activeArchetype).toBe("identity")
    expect(EDIT_SURFACE_CLASS.victories).toBe("progression")
  })

  it("exercises every version class (no class is dead)", () => {
    const used = new Set<VersionClass>(Object.values(EDIT_SURFACE_CLASS))
    expect([...used].sort()).toEqual([
      "identity",
      "inventory",
      "progression",
      "vitals",
    ])
  })
})
