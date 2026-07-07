import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"

import { getArchetype, resolveEntity } from "@/lib/game-engine-v2"

import { buildAffinityStrip } from "./affinity-strip"
import { buildRailView } from "./rail-view"

const profile = {
  name: "Cassian Vale",
  pronouns: "they/them",
  portraitUrl: null,
}

function knight(overrides: Partial<Entity["components"]> = {}): Entity {
  return {
    id: "rail-test",
    components: {
      identity: { name: profile.name },
      level: { value: 4, victories: 8 },
      path: { choice: "balanced" },
      attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
      vitals: { base: 0, damage: 5 },
      skillPool: { base: 0, spSpent: 3 },
      resources: { hitDiceUsed: 1, skillDiceUsed: 0, prismaUsed: 1 },
      exhaustion: { level: 2 },
      archetypes: {
        active: "knight",
        origin: "knight",
        savedArchetypeRanks: 0,
        roster: [
          { key: "knight", rank: 2, inheritanceSlots: [] },
          { key: "mage", rank: 1, inheritanceSlots: [] },
        ],
      },
      mechanics: { states: { valor: { kind: "valor", value: 3 } } },
      ...overrides,
    },
  }
}

describe("buildRailView", () => {
  it("shapes identity, pools, victories, prisma, and exhaustion from the loaded pair", () => {
    const entity = knight()
    const rail = buildRailView(
      profile,
      entity,
      resolveEntity(entity),
      getArchetype
    )

    expect(rail.name).toBe("Cassian Vale")
    expect(rail.pronouns).toBe("they/them")
    expect(rail.level).toBe(4)
    expect(rail.hp?.max).toBeGreaterThan(0)
    expect(rail.hp?.current).toBe(rail.hp!.max - 5)
    expect(rail.sp?.current).toBe(rail.sp!.max - 3)
    expect(rail.victories).toEqual({
      banked: 8,
      threshold: 7,
      toNext: 0,
      canLevelUp: true,
      atMaxLevel: false,
    })
    expect(rail.prisma).toEqual({
      current: 1,
      max: 2,
      healFormula: "2d8 + 4",
    })
    expect(rail.exhaustion?.level).toBe(2)
  })

  it("builds the switch menu from the roster with mechanic-name hints", () => {
    const entity = knight()
    const rail = buildRailView(
      profile,
      entity,
      resolveEntity(entity),
      getArchetype
    )

    expect(rail.archetype?.activeKey).toBe("knight")
    expect(rail.archetype?.activeRank).toBe(2)
    expect(rail.archetype?.options).toHaveLength(2)
    const knightOption = rail.archetype!.options.find(
      (option) => option.key === "knight"
    )
    expect(knightOption?.isActive).toBe(true)
    expect(knightOption?.mechanicName).toBe("Valor")
  })

  it("returns null sections for read-units that didn't resolve", () => {
    const bare: Entity = {
      id: "bare",
      components: { identity: { name: "Bare" } },
    }
    const rail = buildRailView(profile, bare, resolveEntity(bare), getArchetype)
    expect(rail.level).toBeNull()
    expect(rail.hp).toBeNull()
    expect(rail.victories).toBeNull()
    expect(rail.prisma).toBeNull()
    expect(rail.archetype).toBeNull()
  })
})

describe("buildAffinityStrip", () => {
  it("emits the 11 resistible types in rulebook order, neutral-filled", () => {
    const entity = knight()
    const strip = buildAffinityStrip(resolveEntity(entity))
    expect(strip).toHaveLength(11)
    expect(strip[0]?.type).toBe("slash")
    // The Knight charts Resist Slash via its Archetype base.
    expect(strip.every((cell) => cell.affinity !== undefined)).toBe(true)
  })

  it("reads all-neutral with no affinity chart", () => {
    const bare: Entity = {
      id: "bare",
      components: { identity: { name: "Bare" } },
    }
    const strip = buildAffinityStrip(resolveEntity(bare))
    expect(strip.every((cell) => cell.affinity === "neutral")).toBe(true)
  })
})
