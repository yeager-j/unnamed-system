import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"

import { resolveEntity } from "@/lib/game-engine-v2"

import { buildArchetypesTabView } from "./archetypes-tab"

function character(): Entity {
  return {
    id: "archetypes-tab-view",
    components: {
      level: { value: 1, victories: 0 },
      path: { choice: "balanced" },
      attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
      affinities: { base: {} },
      vitals: { base: 0, damage: 0 },
      skillPool: { base: 0, spSpent: 0 },
      talents: [{ key: "sneak" }],
      archetypes: {
        active: "warrior",
        origin: "warrior",
        savedArchetypeRanks: 0,
        roster: [{ key: "warrior", rank: 2, inheritanceSlots: [] }],
      },
    },
  }
}

describe("buildArchetypesTabView", () => {
  it("selects the active Archetype for the tab", () => {
    const view = buildArchetypesTabView(resolveEntity(character()))
    expect(view.activeEntry?.key).toBe("warrior")
  })
})
