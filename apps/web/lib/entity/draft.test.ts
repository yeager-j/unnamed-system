import { describe, expect, it } from "vitest"

import { loadEntity } from "@workspace/game-v2/kernel/load-seam"

import { resolveEntity } from "@/lib/game-engine-v2"

import { draftEntityComponents } from "./draft"

/**
 * Mint-skeleton conformance (UNN-556): the exact bag `startEntityDraftAction`
 * inserts must round-trip the kernel load seam, and a fresh draft must resolve
 * with full pools at the balanced level-1 maxima — proving "finalize writes no
 * pool values" is structural, not a convention.
 */
describe("draftEntityComponents", () => {
  const loaded = loadEntity("draft-test", {
    ...draftEntityComponents(),
    identity: { name: "" },
  })

  it("round-trips the kernel load seam", () => {
    expect(loaded).toMatchObject({ ok: true })
  })

  it("resolves at the balanced level-1 maxima with full pools", () => {
    if (!loaded.ok) throw new Error("skeleton failed to load")
    const resolved = resolveEntity(loaded.value)
    expect(resolved.components.vitals).toEqual({ maxHP: 20, currentHP: 20 })
    expect(resolved.components.skillPool).toEqual({ maxSP: 50, currentSP: 50 })
  })

  it("leaves the creation-Writer components absent (NULL ⇔ absent)", () => {
    const skeleton = draftEntityComponents()
    for (const key of [
      "archetypes",
      "talents",
      "mechanics",
      "equipment",
      "exhaustion",
      "skills",
      "manualBonuses",
    ]) {
      expect(key in skeleton).toBe(false)
    }
  })
})
