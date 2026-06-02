import { describe, expect, it } from "vitest"

import { DEFAULT_BATTLE_CONDITIONS } from "@/lib/game/character"

import { reduceCombatSession } from "./reduce-session"
import {
  createCombatSession,
  type CombatantSetup,
  type CombatSession,
} from "./session"

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

/**
 * A started session whose current actor (combatant[0]) carries an explicit
 * battle-condition overlay + durations — the state an expiry resets to neutral.
 * There is no event yet to *set* an axis's increased/decreased state (the panel
 * events arrive in UNN-309+), so the fixture spreads the overlay directly.
 */
function startedWithOverlay(
  battleConditions: CombatSession["combatants"][number]["battleConditions"],
  conditionDurations: CombatSession["combatants"][number]["conditionDurations"]
): CombatSession {
  const session = startedSession()
  const [actor, ...rest] = session.combatants
  return {
    ...session,
    combatants: [{ ...actor!, battleConditions, conditionDurations }, ...rest],
  }
}

describe("reduceCombatSession — endTurn", () => {
  it("marks the current actor as acted and keeps them as current actor", () => {
    const session = startedSession()
    const actorId = session.currentActorId

    const { session: next, edits } = reduceCombatSession(session, {
      kind: "endTurn",
    })

    expect(next.currentActorId).toBe(actorId)
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

describe("reduceCombatSession — applyBattleConditionDuration", () => {
  it("extends rather than stacks (Tarukaja twice → 6)", () => {
    const started = startedSession()
    const actorId = started.currentActorId!

    const once = reduceCombatSession(started, {
      kind: "applyBattleConditionDuration",
      combatantId: actorId,
      axis: "attack",
      turns: 3,
    }).session
    const twice = reduceCombatSession(once, {
      kind: "applyBattleConditionDuration",
      combatantId: actorId,
      axis: "attack",
      turns: 3,
    }).session

    expect(twice.combatants[0]!.conditionDurations.attack).toBe(6)
  })

  it("is session-only (emits no edits)", () => {
    const started = startedSession()

    const result = reduceCombatSession(started, {
      kind: "applyBattleConditionDuration",
      combatantId: started.currentActorId!,
      axis: "attack",
      turns: 2,
    })

    expect(result.edits).toEqual([])
  })

  it("is a no-op for an unknown combatant", () => {
    const started = startedSession()

    const result = reduceCombatSession(started, {
      kind: "applyBattleConditionDuration",
      combatantId: "nobody",
      axis: "attack",
      turns: 2,
    })

    expect(result.session.combatants).toEqual(started.combatants)
  })
})

describe("reduceCombatSession — endTurn duration clock", () => {
  /** Both combatants get `attack: 2`; the first is the current actor. */
  function startedWithDurations() {
    const fresh = createCombatSession(SETUP, sequentialIds())
    const [first, second] = fresh.combatants
    const afterFirst = reduceCombatSession(fresh, {
      kind: "applyBattleConditionDuration",
      combatantId: first!.id,
      axis: "attack",
      turns: 2,
    }).session
    const afterBoth = reduceCombatSession(afterFirst, {
      kind: "applyBattleConditionDuration",
      combatantId: second!.id,
      axis: "attack",
      turns: 2,
    }).session
    return { ...afterBoth, currentActorId: first!.id }
  }

  it("decrements only the current actor's durations", () => {
    const session = startedWithDurations()

    const { session: next } = reduceCombatSession(session, { kind: "endTurn" })

    expect(next.combatants[0]!.conditionDurations.attack).toBe(1)
    expect(next.combatants[1]!.conditionDurations.attack).toBe(2)
  })

  it("emits nothing while remaining > 0", () => {
    const session = startedWithDurations()

    const { edits } = reduceCombatSession(session, { kind: "endTurn" })

    expect(edits).toEqual([])
  })

  it("resets the actor's battle-condition axis to neutral on expiry (no edit)", () => {
    const session = startedWithOverlay(
      { ...DEFAULT_BATTLE_CONDITIONS, attack: "increased" },
      { attack: 1 }
    )
    const actorId = session.currentActorId

    const { session: next, edits } = reduceCombatSession(session, {
      kind: "endTurn",
    })

    expect(edits).toEqual([])
    expect(next.combatants[0]!.battleConditions.attack).toBe("neutral")
    expect(next.combatants[0]!.conditionDurations.attack).toBeUndefined()
    expect(next.currentActorId).toBe(actorId)
  })

  it("expires only the axis that hit 0, decrementing the rest", () => {
    const session = startedWithOverlay(
      {
        ...DEFAULT_BATTLE_CONDITIONS,
        attack: "increased",
        defense: "increased",
      },
      { attack: 1, defense: 3 }
    )

    const { session: next, edits } = reduceCombatSession(session, {
      kind: "endTurn",
    })

    expect(edits).toEqual([])
    expect(next.combatants[0]!.battleConditions.attack).toBe("neutral")
    expect(next.combatants[0]!.conditionDurations.attack).toBeUndefined()
    expect(next.combatants[0]!.battleConditions.defense).toBe("increased")
    expect(next.combatants[0]!.conditionDurations.defense).toBe(2)
  })
})
