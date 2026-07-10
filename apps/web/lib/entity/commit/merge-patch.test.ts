import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"

import { combinePatches, mergeComponentPatch } from "./merge-patch"

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

describe("combinePatches", () => {
  it("is right-biased — the later patch wins a shared key", () => {
    const combined = combinePatches(
      { vitals: { base: 20, damage: 5 } },
      { vitals: { base: 20, damage: 12 } }
    )
    expect(combined.vitals).toEqual({ base: 20, damage: 12 })
  })

  it("delete-then-set composes to a set", () => {
    const combined = combinePatches(
      { skillPool: undefined },
      { skillPool: { base: 10, spSpent: 3 } }
    )
    expect(combined.skillPool).toEqual({ base: 10, spSpent: 3 })
  })

  it("set-then-delete composes to a delete (the explicit-undefined key survives)", () => {
    const combined = combinePatches(
      { skillPool: { base: 10, spSpent: 3 } },
      { skillPool: undefined }
    )
    expect("skillPool" in combined).toBe(true)
    expect(combined.skillPool).toBeUndefined()
  })
})
