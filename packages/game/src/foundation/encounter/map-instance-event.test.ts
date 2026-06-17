import { describe, expect, it } from "vitest"

import {
  isMapInstanceEvent,
  mapInstanceEventSchema,
} from "@workspace/game/foundation/encounter/map-instance-event"

describe("mapInstanceEventSchema", () => {
  it("accepts every spatial event kind with a valid payload", () => {
    const valid = [
      { kind: "addZone", name: "Courtyard" },
      {
        kind: "addZone",
        name: "Courtyard",
        zoneId: "client-zone",
        notes: "muddy",
      },
      { kind: "removeZone", zoneId: "zone-a" },
      {
        kind: "setZoneAdjacency",
        zoneIdA: "zone-a",
        zoneIdB: "zone-b",
        adjacent: true,
      },
      { kind: "renameZone", zoneId: "zone-a", name: "Hall" },
      { kind: "moveCombatant", combatantId: "c-1", toZoneId: "zone-b" },
      {
        kind: "setEngagement",
        combatantId: "c-1",
        targetCombatantIds: ["c-2"],
      },
      { kind: "clearEngagement", combatantId: "c-1" },
      { kind: "applyEnchantment", zoneId: "zone-a", enchantment: "toccata" },
      { kind: "clearEnchantment" },
    ]

    for (const event of valid) {
      expect(mapInstanceEventSchema.safeParse(event).success).toBe(true)
    }
  })

  it("rejects an empty zone name (matching zoneSchema's min(1))", () => {
    expect(
      mapInstanceEventSchema.safeParse({ kind: "addZone", name: "" }).success
    ).toBe(false)
    expect(
      mapInstanceEventSchema.safeParse({
        kind: "renameZone",
        zoneId: "zone-a",
        name: "",
      }).success
    ).toBe(false)
  })

  it("rejects setEngagement with no targets", () => {
    expect(
      mapInstanceEventSchema.safeParse({
        kind: "setEngagement",
        combatantId: "c-1",
        targetCombatantIds: [],
      }).success
    ).toBe(false)
  })

  it("rejects an out-of-range enchantment type", () => {
    expect(
      mapInstanceEventSchema.safeParse({
        kind: "applyEnchantment",
        zoneId: "zone-a",
        enchantment: "fortissimo",
      }).success
    ).toBe(false)
  })

  it("rejects a non-spatial (session) event kind", () => {
    expect(mapInstanceEventSchema.safeParse({ kind: "endTurn" }).success).toBe(
      false
    )
  })
})

describe("isMapInstanceEvent", () => {
  it("is true for every spatial kind and false for a session kind", () => {
    expect(
      isMapInstanceEvent({
        kind: "moveCombatant",
        combatantId: "c-1",
        toZoneId: "zone-a",
      })
    ).toBe(true)
    expect(
      isMapInstanceEvent({
        kind: "applyEnchantment",
        zoneId: "z",
        enchantment: "toccata",
      })
    ).toBe(true)
    expect(isMapInstanceEvent({ kind: "endTurn" })).toBe(false)
    expect(
      isMapInstanceEvent({ kind: "removeCombatant", combatantId: "c-1" })
    ).toBe(false)
  })
})
