import { describe, expect, it } from "vitest"

import { reduceCombat } from "@workspace/game/engine/__fixtures__/encounter"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import {
  type Combatant,
  type CombatantSetup,
} from "@workspace/game/foundation/encounter/session"
import { ACTION_ECONOMY_ACTIONS } from "@workspace/game/foundation/encounter/session-event"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

const SETUP: CombatantSetup[] = [
  { side: "players", ref: { kind: "pc", characterId: "char-1" }, zoneId: "z" },
]

function build() {
  return createCombatSession(SETUP, sequentialIds())
}

function combatantOf(
  session: ReturnType<typeof build>,
  id: string
): Combatant | undefined {
  return session.combatants.find((c) => c.id === id)
}

const FIELD = {
  move: "moveAvailable",
  standard: "standardAvailable",
  reaction: "reactionAvailable",
} as const

describe("reduceCombatSession — setActionEconomy", () => {
  it("a fresh combatant starts with all three actions available", () => {
    const combatant = combatantOf(build(), "combatant-0")!
    expect(combatant.moveAvailable).toBe(true)
    expect(combatant.standardAvailable).toBe(true)
    expect(combatant.reactionAvailable).toBe(true)
  })

  for (const action of ACTION_ECONOMY_ACTIONS) {
    it(`toggles ${action} off and back on`, () => {
      const off = reduceCombat(build(), {
        kind: "setActionEconomy",
        combatantId: "combatant-0",
        action,
        available: false,
      })
      expect(combatantOf(off, "combatant-0")![FIELD[action]]).toBe(false)

      const on = reduceCombat(off, {
        kind: "setActionEconomy",
        combatantId: "combatant-0",
        action,
        available: true,
      })
      expect(combatantOf(on, "combatant-0")![FIELD[action]]).toBe(true)
    })
  }

  it("touches only the named action, leaving the others", () => {
    const next = reduceCombat(build(), {
      kind: "setActionEconomy",
      combatantId: "combatant-0",
      action: "standard",
      available: false,
    })
    const combatant = combatantOf(next, "combatant-0")!
    expect(combatant.standardAvailable).toBe(false)
    expect(combatant.moveAvailable).toBe(true)
    expect(combatant.reactionAvailable).toBe(true)
  })

  it("is a no-op for an unknown combatant id", () => {
    const session = build()
    const next = reduceCombat(session, {
      kind: "setActionEconomy",
      combatantId: "nobody",
      action: "move",
      available: false,
    })
    expect(next).toBe(session)
  })
})
