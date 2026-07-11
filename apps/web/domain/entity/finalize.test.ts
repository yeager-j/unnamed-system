import { describe, expect, it } from "vitest"

import { emptyNarrative } from "@workspace/game-v2/narrative"

import { getArchetype, startingWeaponForLineage } from "@/domain/game-engine-v2"

import { draftEntityComponents } from "./draft"
import { buildFinalizePatch, type FinalizeDeps } from "./finalize"

/**
 * The pure finalize transition (UNN-556). Deps are the production catalog
 * bindings with a deterministic id mint, so the golden-master pins real
 * catalog behavior (warrior → longsword, warrior's mechanic + granted
 * talents).
 */
const deps: FinalizeDeps = {
  getArchetype,
  startingWeaponForLineage,
  newId: () => "seeded-item-id",
}

/** A complete, gate-passing draft: origin picked, allocation valid, named. */
function completeDraft() {
  return {
    ...draftEntityComponents(),
    virtues: {
      ranks: { expression: 2, empathy: 1, wisdom: 1, focus: 0 },
      sparkLog: [],
    },
    archetypes: {
      active: "warrior",
      origin: "warrior",
      savedArchetypeRanks: 0,
      roster: [{ key: "warrior", rank: 2, inheritanceSlots: [] }],
    },
  }
}

describe("buildFinalizePatch", () => {
  it("refuses per gated step, in wizard order", () => {
    const noOrigin = buildFinalizePatch(
      "Alia",
      { ...completeDraft(), archetypes: undefined },
      deps
    )
    expect(noOrigin).toMatchObject({
      ok: false,
      error: { kind: "missing-requirement", stepSlug: "corpus" },
    })

    const badAllocation = buildFinalizePatch(
      "Alia",
      {
        ...completeDraft(),
        virtues: {
          ranks: { expression: 2, empathy: 1, wisdom: 0, focus: 0 },
          sparkLog: [],
        },
      },
      deps
    )
    expect(badAllocation).toMatchObject({
      ok: false,
      error: { kind: "missing-requirement", stepSlug: "ortus" },
    })

    const unnamed = buildFinalizePatch("   ", completeDraft(), deps)
    expect(unnamed).toMatchObject({
      ok: false,
      error: { kind: "missing-requirement", stepSlug: "persona" },
    })
  })

  it("refuses an origin key the catalog does not resolve", () => {
    const draft = completeDraft()
    draft.archetypes.origin = "not-a-real-archetype"
    const result = buildFinalizePatch("Alia", draft, deps)
    expect(result).toEqual({ ok: false, error: "no-origin-archetype" })
  })

  it("refuses a lineage with no authored starting weapon", () => {
    const result = buildFinalizePatch("Alia", completeDraft(), {
      ...deps,
      startingWeaponForLineage: () => undefined,
    })
    expect(result).toEqual({
      ok: false,
      error: "no-starting-weapon-for-lineage",
    })
  })

  it("prunes origin-granted keys from the stored talents", () => {
    const warrior = getArchetype("warrior")
    const granted = warrior?.talents[0]
    if (!granted) throw new Error("warrior grants no talents in the catalog")

    const result = buildFinalizePatch(
      "Alia",
      {
        ...completeDraft(),
        talents: [{ key: granted }, { key: "player-added" }],
      },
      deps
    )
    if (!result.ok) throw new Error("expected ok")
    expect(result.value.talents).toEqual([{ key: "player-added" }])
  })

  it("mint golden-master: the full patch over a max-complexity draft", () => {
    const draft = {
      ...completeDraft(),
      path: { choice: "health-focused" as const },
      talents: [{ key: "iron-stomach" }, { key: "night-owl" }],
      narrative: {
        ...emptyNarrative(),
        backstory: "Forged in the pit.",
        knives: [{ title: "The debt", description: "unpaid" }],
        chains: [{ title: "The guild", description: null }],
      },
    }

    const result = buildFinalizePatch("Alia", draft, deps)
    if (!result.ok) throw new Error("expected ok")

    // Pin the exact patch: status flip + seeded equipment/mechanics/exhaustion
    // + pruned talents — and NOTHING else (no pool values, no narrative echo).
    expect(result.value).toMatchSnapshot()
    expect(Object.keys(result.value).sort()).toEqual([
      "equipment",
      "exhaustion",
      "mechanics",
      "status",
      "talents",
    ])
    expect(result.value.equipment).toEqual({
      items: [
        {
          id: "seeded-item-id",
          catalogItemKey: "longsword",
          equipped: true,
          quantity: 1,
        },
      ],
      currency: 0,
    })
  })
})
