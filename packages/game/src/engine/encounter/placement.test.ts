import { describe, expect, it } from "vitest"

import { reduceCombat } from "@workspace/game/engine/__fixtures__/encounter"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { type CombatantSetup } from "@workspace/game/foundation/encounter/session"

const SETUP: CombatantSetup[] = [
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-1" },
    zoneId: "zone-a",
  },
]

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

/** A session with one combatant placed in `zone-a` and a `zone-b` it can move to. */
function placedSession() {
  const base = createCombatSession(SETUP, sequentialIds())
  return {
    ...base,
    zones: {
      "zone-a": { id: "zone-a", name: "Courtyard" },
      "zone-b": { id: "zone-b", name: "Hall" },
    },
    adjacency: { "zone-a": ["zone-b"], "zone-b": ["zone-a"] },
  }
}

describe("reduceCombatSession — moveCombatant", () => {
  it("moves the combatant to the target zone", () => {
    const session = placedSession()

    const next = reduceCombat(session, {
      kind: "moveCombatant",
      combatantId: "combatant-0",
      toZoneId: "zone-b",
    })

    expect(next.combatants[0]!.zoneId).toBe("zone-b")
  })

  it("places an unplaced combatant into a starting zone", () => {
    const base = createCombatSession(
      [{ side: "players", ref: { kind: "pc", characterId: "x" }, zoneId: "" }],
      sequentialIds()
    )
    const session = {
      ...base,
      zones: { "zone-a": { id: "zone-a", name: "Courtyard" } },
    }

    const next = reduceCombat(session, {
      kind: "moveCombatant",
      combatantId: "combatant-0",
      toZoneId: "zone-a",
    })

    expect(next.combatants[0]!.zoneId).toBe("zone-a")
  })

  it("is a no-op when moving to the already-occupied zone", () => {
    const session = placedSession()

    const next = reduceCombat(session, {
      kind: "moveCombatant",
      combatantId: "combatant-0",
      toZoneId: "zone-a",
    })

    expect(next).toBe(session)
  })

  it("is a no-op when the combatant id is unknown", () => {
    const session = placedSession()

    const next = reduceCombat(session, {
      kind: "moveCombatant",
      combatantId: "ghost",
      toZoneId: "zone-b",
    })

    expect(next).toBe(session)
  })

  it("applies a non-adjacent target verbatim (guides, does not block)", () => {
    const session = placedSession()

    const next = reduceCombat(session, {
      kind: "moveCombatant",
      combatantId: "combatant-0",
      toZoneId: "zone-detached",
    })

    expect(next.combatants[0]!.zoneId).toBe("zone-detached")
  })
})
