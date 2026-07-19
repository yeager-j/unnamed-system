import { describe, expect, it } from "vitest"

import { emptyMapInstance } from "./instance-factory"
import { reduceMapInstance } from "./reduce-map-instance"
import { validateDirectMapInstanceEvent } from "./validate-map-instance-event"

function mapWithZones() {
  const withA = reduceMapInstance(() => "unused")(emptyMapInstance(), {
    kind: "editGeometry",
    event: {
      kind: "addZone",
      id: "a",
      pageId: "default",
      position: { x: 0, y: 0 },
    },
  })
  return reduceMapInstance(() => "unused")(withA, {
    kind: "editGeometry",
    event: {
      kind: "addZone",
      id: "b",
      pageId: "default",
      position: { x: 100, y: 0 },
    },
  })
}

describe("validateDirectMapInstanceEvent", () => {
  it("accepts a structurally valid edit", () => {
    expect(
      validateDirectMapInstanceEvent(mapWithZones(), {
        kind: "renameZone",
        zoneId: "a",
        name: "Atrium",
      })
    ).toEqual({ ok: true, value: undefined })
  })

  it("rejects unknown targets", () => {
    expect(
      validateDirectMapInstanceEvent(mapWithZones(), {
        kind: "moveCombatant",
        tokenKey: "missing",
        toZoneId: "a",
      })
    ).toEqual({ ok: false, error: "token-not-found" })
  })

  it("rejects destructive edits over occupied geometry", () => {
    const occupied = reduceMapInstance(() => "unused")(mapWithZones(), {
      kind: "placeCombatant",
      tokenKey: "pc-1",
      zoneId: "a",
    })
    expect(
      validateDirectMapInstanceEvent(occupied, {
        kind: "editGeometry",
        event: { kind: "deleteZone", zoneId: "a" },
      })
    ).toEqual({ ok: false, error: "zone-occupied" })
  })

  it("rejects identity collisions before reduction", () => {
    expect(
      validateDirectMapInstanceEvent(mapWithZones(), {
        kind: "editGeometry",
        event: {
          kind: "addConnection",
          id: "a",
          fromZoneId: "a",
          toZoneId: "b",
        },
      })
    ).toEqual({ ok: true, value: undefined })

    expect(
      validateDirectMapInstanceEvent(mapWithZones(), {
        kind: "addZone",
        zoneId: "a",
        name: "Duplicate",
      })
    ).toEqual({ ok: false, error: "identity-collision" })
  })
})
