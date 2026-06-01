import { describe, expect, it } from "vitest"

import { reduceCombatSession } from "./reduce-session"
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
]

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

/** A fresh session with the first combatant drafted as the current actor. */
function startedSession() {
  const session = createCombatSession(SETUP, sequentialIds())
  return { ...session, currentActorId: session.combatants[0]!.id }
}

describe("reduceCombatSession — endTurn", () => {
  it("marks the current actor as acted and clears the floor", () => {
    const session = startedSession()

    const { session: next, edits } = reduceCombatSession(session, {
      kind: "endTurn",
    })

    expect(next.currentActorId).toBeNull()
    expect(next.combatants[0]!.hasActedThisRound).toBe(true)
    expect(next.combatants[1]!.hasActedThisRound).toBe(false)
    expect(edits).toEqual([])
  })

  it("is a no-op when there is no current actor", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const result = reduceCombatSession(session, { kind: "endTurn" })

    expect(result.session).toBe(session)
    expect(result.edits).toEqual([])
  })
})

describe("reduceCombatSession — purity", () => {
  it("does not mutate its input and returns a new session on change", () => {
    const session = startedSession()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((combatant) => Object.freeze(combatant))

    const { session: next } = reduceCombatSession(session, { kind: "endTurn" })

    // A mutation of the frozen input would throw under strict mode; reaching
    // here means the reducer built a new session instead.
    expect(next).not.toBe(session)
    expect(session.currentActorId).toBe(session.combatants[0]!.id)
    expect(session.combatants[0]!.hasActedThisRound).toBe(false)
  })
})
