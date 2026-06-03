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

function enemyStatBlock() {
  return {
    name: "Shadow",
    maxHP: 20,
    currentHP: 20,
    maxSP: 0,
    currentSP: 0,
    attributes: { strength: 4, magic: 1, agility: 3, luck: 2 },
  }
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

describe("reduceCombatSession — startCombat", () => {
  it("records advantage and firstSide on a fresh draft session", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const { session: next, edits } = reduceCombatSession(session, {
      kind: "startCombat",
      advantage: "players",
      firstSide: "players",
    })

    expect(next.advantage).toBe("players")
    expect(next.firstSide).toBe("players")
    expect(edits).toEqual([])
  })

  it("records firstSide even when advantage is neutral", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const { session: next } = reduceCombatSession(session, {
      kind: "startCombat",
      advantage: "neutral",
      firstSide: "enemies",
    })

    expect(next.advantage).toBe("neutral")
    expect(next.firstSide).toBe("enemies")
  })

  it("records a non-neutral advantage and firstSide verbatim, without normalising them", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const { session: next } = reduceCombatSession(session, {
      kind: "startCombat",
      advantage: "players",
      firstSide: "enemies",
    })

    expect(next.advantage).toBe("players")
    expect(next.firstSide).toBe("enemies")
  })

  it("is a no-op on an already-started session (cannot start twice)", () => {
    const started = reduceCombatSession(
      createCombatSession(SETUP, sequentialIds()),
      { kind: "startCombat", advantage: "players", firstSide: "players" }
    ).session

    const result = reduceCombatSession(started, {
      kind: "startCombat",
      advantage: "enemies",
      firstSide: "enemies",
    })

    expect(result.session).toBe(started)
    expect(result.session.advantage).toBe("players")
    expect(result.session.firstSide).toBe("players")
    expect(result.edits).toEqual([])
  })

  it("does not mutate a frozen draft input", () => {
    const session = createCombatSession(SETUP, sequentialIds())
    Object.freeze(session)
    Object.freeze(session.combatants)

    const { session: next } = reduceCombatSession(session, {
      kind: "startCombat",
      advantage: "enemies",
      firstSide: "enemies",
    })

    expect(next).not.toBe(session)
    expect(session.advantage).toBeNull()
    expect(session.firstSide).toBeNull()
  })
})

describe("reduceCombatSession — advanceRound", () => {
  /** Both combatants have acted; the first is still the current actor. */
  function endOfRound() {
    const session = startedSession()
    const [first, second] = session.combatants
    return {
      ...session,
      combatants: [
        { ...first!, hasActedThisRound: true },
        { ...second!, hasActedThisRound: true },
      ],
    }
  }

  it("increments the round, clears all acted flags, and nulls the current actor", () => {
    const session = endOfRound()

    const { session: next, edits } = reduceCombatSession(session, {
      kind: "advanceRound",
    })

    expect(next.round).toBe(2)
    expect(next.currentActorId).toBeNull()
    expect(next.combatants.every((c) => !c.hasActedThisRound)).toBe(true)
    expect(edits).toEqual([])
  })

  it("still increments the round when no one has acted (idempotent safeguard)", () => {
    const session = startedSession()

    const { session: next } = reduceCombatSession(session, {
      kind: "advanceRound",
    })

    expect(next.round).toBe(2)
    expect(next.currentActorId).toBeNull()
  })
})

describe("reduceCombatSession — addCombatant", () => {
  const JOINER: CombatantSetup = {
    side: "enemies",
    ref: { kind: "enemy", statBlock: enemyStatBlock() },
    zoneId: "zone-b",
  }

  it("appends a joiner with a minted id and hasActedThisRound = true", () => {
    const session = startedSession()

    const { session: next, edits } = reduceCombatSession(
      session,
      { kind: "addCombatant", setup: JOINER },
      () => "joiner-id"
    )

    expect(next.combatants).toHaveLength(3)
    const joiner = next.combatants[2]!
    expect(joiner.id).toBe("joiner-id")
    expect(joiner.hasActedThisRound).toBe(true)
    expect(joiner.side).toBe("enemies")
    expect(edits).toEqual([])
  })

  it("leaves the existing combatants untouched", () => {
    const session = startedSession()

    const { session: next } = reduceCombatSession(
      session,
      { kind: "addCombatant", setup: JOINER },
      () => "joiner-id"
    )

    expect(next.combatants.slice(0, 2)).toEqual(session.combatants)
  })
})

describe("reduceCombatSession — removeCombatant", () => {
  it("removes the matching combatant", () => {
    const session = startedSession()
    const removedId = session.combatants[1]!.id

    const { session: next, edits } = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: removedId,
    })

    expect(next.combatants).toHaveLength(1)
    expect(next.combatants.some((c) => c.id === removedId)).toBe(false)
    expect(edits).toEqual([])
  })

  it("clears the current actor when it is the one removed", () => {
    const session = startedSession()

    const { session: next } = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: session.currentActorId!,
    })

    expect(next.currentActorId).toBeNull()
  })

  it("leaves the current actor when a different combatant is removed", () => {
    const session = startedSession()
    const actorId = session.currentActorId

    const { session: next } = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: session.combatants[1]!.id,
    })

    expect(next.currentActorId).toBe(actorId)
  })

  it("is a no-op for an unknown combatant id (returns the same session)", () => {
    const session = startedSession()

    const result = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: "nobody",
    })

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

  it("does not mutate a frozen input on advanceRound", () => {
    const session = startedSession()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((combatant) => Object.freeze(combatant))

    const { session: next } = reduceCombatSession(session, {
      kind: "advanceRound",
    })

    expect(next).not.toBe(session)
    expect(session.round).toBe(1)
    expect(session.currentActorId).toBe(session.combatants[0]!.id)
  })

  it("does not mutate a frozen input on addCombatant", () => {
    const session = startedSession()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((combatant) => Object.freeze(combatant))

    const { session: next } = reduceCombatSession(
      session,
      {
        kind: "addCombatant",
        setup: {
          side: "enemies",
          ref: { kind: "enemy", statBlock: enemyStatBlock() },
          zoneId: "zone-b",
        },
      },
      () => "joiner-id"
    )

    expect(next).not.toBe(session)
    expect(session.combatants).toHaveLength(2)
  })

  it("does not mutate a frozen input on removeCombatant", () => {
    const session = startedSession()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((combatant) => Object.freeze(combatant))

    const { session: next } = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: session.combatants[0]!.id,
    })

    expect(next).not.toBe(session)
    expect(session.combatants).toHaveLength(2)
    expect(session.currentActorId).toBe(session.combatants[0]!.id)
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
