import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"

import { mergeComponentPatch } from "./merge-patch"

describe("mergeComponentPatch", () => {
  const entity: Entity = {
    id: "e1",
    components: {
      vitals: { base: 20, damage: 5 },
      skillPool: { base: 10, spSpent: 0 },
    },
  }

  it("replaces patched components wholesale and leaves siblings untouched", () => {
    const merged = mergeComponentPatch(entity, {
      vitals: { base: 20, damage: 12 },
    })
    expect(merged.components.vitals).toEqual({ base: 20, damage: 12 })
    expect(merged.components.skillPool).toBe(entity.components.skillPool)
    expect(entity.components.vitals).toEqual({ base: 20, damage: 5 })
  })

  it("adds a component the entity did not carry", () => {
    const merged = mergeComponentPatch(entity, { path: { choice: "balanced" } })
    expect(merged.components.path).toEqual({ choice: "balanced" })
  })

  it("removes a component patched to undefined (NULL ⇔ absent)", () => {
    const merged = mergeComponentPatch(entity, { skillPool: undefined })
    expect("skillPool" in merged.components).toBe(false)
  })
})
