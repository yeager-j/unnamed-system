import { describe, expect, it } from "vitest"

import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import { resolveArchetypes } from "@workspace/game-v2/archetypes/resolved"
import type { Lineage } from "@workspace/game-v2/kernel/vocab"

const lineageOf: Record<string, Lineage> = {
  warrior: "warrior",
  mage: "mage",
}
const getArchetype = (key: string): { lineage: Lineage } | undefined =>
  lineageOf[key] ? { lineage: lineageOf[key] } : undefined

function archetypes(overrides: Partial<Archetypes> = {}): Archetypes {
  return {
    active: "warrior",
    origin: "warrior",
    savedArchetypeRanks: 3,
    roster: [
      { key: "warrior", rank: 5, inheritanceSlots: [] },
      { key: "mage", rank: 2, inheritanceSlots: [] },
    ],
    ...overrides,
  }
}

describe("resolveArchetypes (the resolved read-unit the sheet reads off ResolvedEntity)", () => {
  it("passes active/origin/savedRanks through verbatim", () => {
    const resolved = resolveArchetypes(archetypes(), getArchetype)
    expect(resolved.active).toBe("warrior")
    expect(resolved.origin).toBe("warrior")
    expect(resolved.savedArchetypeRanks).toBe(3)
  })

  it("derives activeLineage from the active Archetype's catalog Lineage", () => {
    expect(resolveArchetypes(archetypes(), getArchetype).activeLineage).toBe(
      "warrior"
    )
    expect(
      resolveArchetypes(archetypes({ active: "mage" }), getArchetype)
        .activeLineage
    ).toBe("mage")
  })

  it("activeLineage is null when no Archetype is active", () => {
    expect(
      resolveArchetypes(archetypes({ active: null }), getArchetype)
        .activeLineage
    ).toBeNull()
  })

  it("activeLineage is null when the active key is not in the catalog (drift)", () => {
    expect(
      resolveArchetypes(archetypes({ active: "ghost" }), getArchetype)
        .activeLineage
    ).toBeNull()
  })

  it("derives per-entry `mastered` at the >= 5 boundary, carrying slots through", () => {
    const resolved = resolveArchetypes(archetypes(), getArchetype)
    expect(resolved.roster).toEqual([
      { key: "warrior", rank: 5, mastered: true, inheritanceSlots: [] },
      { key: "mage", rank: 2, mastered: false, inheritanceSlots: [] },
    ])
  })

  it("preserves each roster entry's configured inheritance slots", () => {
    const slots = [
      { slotIndex: 0, sourceArchetypeKey: "mage", skillKey: "fireball" },
    ]
    const resolved = resolveArchetypes(
      archetypes({
        roster: [{ key: "warrior", rank: 3, inheritanceSlots: slots }],
      }),
      getArchetype
    )
    expect(resolved.roster[0]!.inheritanceSlots).toEqual(slots)
  })
})
