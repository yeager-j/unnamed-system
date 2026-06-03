import { describe, expect, it } from "vitest"

import { pendingCombatants } from "./selectors"
import { createCombatSession, type CombatantSetup } from "./session"

const SETUP: CombatantSetup[] = [
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-1" },
    zoneId: "zone-a",
  },
  {
    side: "players",
    ref: { kind: "pc", characterId: "char-2" },
    zoneId: "zone-a",
  },
  {
    side: "enemies",
    ref: { kind: "pc", characterId: "char-3" },
    zoneId: "zone-b",
  },
]

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

describe("pendingCombatants", () => {
  it("returns everyone when no one has acted and none are Fallen", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const pending = pendingCombatants(session, new Set())

    expect(pending.map((c) => c.id)).toEqual([
      "combatant-0",
      "combatant-1",
      "combatant-2",
    ])
  })

  it("excludes combatants who have already acted this round", () => {
    const fresh = createCombatSession(SETUP, sequentialIds())
    const session = {
      ...fresh,
      combatants: fresh.combatants.map((c, i) =>
        i === 0 ? { ...c, hasActedThisRound: true } : c
      ),
    }

    const pending = pendingCombatants(session, new Set())

    expect(pending.map((c) => c.id)).toEqual(["combatant-1", "combatant-2"])
  })

  it("excludes Fallen combatants by injected id", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const pending = pendingCombatants(session, new Set(["combatant-1"]))

    expect(pending.map((c) => c.id)).toEqual(["combatant-0", "combatant-2"])
  })

  it("excludes a combatant that is both acted and Fallen without double-counting", () => {
    const fresh = createCombatSession(SETUP, sequentialIds())
    const session = {
      ...fresh,
      combatants: fresh.combatants.map((c, i) =>
        i === 0 ? { ...c, hasActedThisRound: true } : c
      ),
    }

    const pending = pendingCombatants(
      session,
      new Set(["combatant-0", "combatant-2"])
    )

    expect(pending.map((c) => c.id)).toEqual(["combatant-1"])
  })
})
