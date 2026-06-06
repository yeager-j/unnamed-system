import { describe, expect, it } from "vitest"

import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/character"
import { reduceCombatSession } from "@workspace/game/engine/encounter/reduce-session"
import {
  createCombatSession,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

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
 * Spreads the overlay directly so the expiry tests stay independent of the
 * `setBattleConditionAxis` setter they don't exercise.
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

    const next = reduceCombatSession(session, { kind: "endTurn" })

    expect(next.currentActorId).toBe(actorId)
    expect(next.combatants[0]!.hasActedThisRound).toBe(true)
    expect(next.combatants[1]!.hasActedThisRound).toBe(false)
  })

  it("is a no-op when there is no current actor", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, { kind: "endTurn" })

    expect(next).toBe(session)
  })

  it("mints a real id via the default generator when none is supplied", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, { kind: "addZone", name: "Gate" })

    const zones = Object.values(next.zones)
    expect(zones).toHaveLength(1)
    expect(typeof zones[0]!.id).toBe("string")
    expect(zones[0]!.id).not.toBe("undefined")
    expect(zones[0]!.id.length).toBeGreaterThan(0)
  })
})

describe("reduceCombatSession — startCombat", () => {
  it("records advantage and firstSide on a fresh draft session", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, {
      kind: "startCombat",
      advantage: "players",
      firstSide: "players",
    })

    expect(next.advantage).toBe("players")
    expect(next.firstSide).toBe("players")
  })

  it("records firstSide even when advantage is neutral", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, {
      kind: "startCombat",
      advantage: "neutral",
      firstSide: "enemies",
    })

    expect(next.advantage).toBe("neutral")
    expect(next.firstSide).toBe("enemies")
  })

  it("records a non-neutral advantage and firstSide verbatim, without normalising them", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, {
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
    )

    const next = reduceCombatSession(started, {
      kind: "startCombat",
      advantage: "enemies",
      firstSide: "enemies",
    })

    expect(next).toBe(started)
    expect(next.advantage).toBe("players")
    expect(next.firstSide).toBe("players")
  })

  it("does not mutate a frozen draft input", () => {
    const session = createCombatSession(SETUP, sequentialIds())
    Object.freeze(session)
    Object.freeze(session.combatants)

    const next = reduceCombatSession(session, {
      kind: "startCombat",
      advantage: "enemies",
      firstSide: "enemies",
    })

    expect(next).not.toBe(session)
    expect(session.advantage).toBeNull()
    expect(session.firstSide).toBeNull()
  })
})

describe("reduceCombatSession — draftCombatant", () => {
  /** A fresh session whose first combatant carries ailments + a spent reaction. */
  function withFirstCombatant(
    ailments: string[],
    reactionAvailable: boolean
  ): CombatSession {
    const session = createCombatSession(SETUP, sequentialIds())
    const [first, ...rest] = session.combatants
    return {
      ...session,
      combatants: [{ ...first!, ailments, reactionAvailable }, ...rest],
    }
  }

  it("sets currentActorId to the drafted combatant", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, {
      kind: "draftCombatant",
      combatantId: "combatant-1",
    })

    expect(next.currentActorId).toBe("combatant-1")
  })

  it("clears the Downed ailment, keeps other ailments, and refreshes the reaction", () => {
    const session = withFirstCombatant(["downed", "burn"], false)

    const next = reduceCombatSession(session, {
      kind: "draftCombatant",
      combatantId: "combatant-0",
    })

    expect(next.combatants[0]!.ailments).toEqual(["burn"])
    expect(next.combatants[0]!.reactionAvailable).toBe(true)
  })

  it("refreshes the whole action economy (move + standard + reaction)", () => {
    const fresh = createCombatSession(SETUP, sequentialIds())
    const [first, ...rest] = fresh.combatants
    const spent: CombatSession = {
      ...fresh,
      combatants: [
        {
          ...first!,
          moveAvailable: false,
          standardAvailable: false,
          reactionAvailable: false,
        },
        ...rest,
      ],
    }

    const next = reduceCombatSession(spent, {
      kind: "draftCombatant",
      combatantId: "combatant-0",
    })

    expect(next.combatants[0]!.moveAvailable).toBe(true)
    expect(next.combatants[0]!.standardAvailable).toBe(true)
    expect(next.combatants[0]!.reactionAvailable).toBe(true)
  })

  it("does not mark the drafted combatant as acted", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, {
      kind: "draftCombatant",
      combatantId: "combatant-0",
    })

    expect(next.combatants[0]!.hasActedThisRound).toBe(false)
  })

  it("is a no-op for an unknown combatant id (returns the same session)", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, {
      kind: "draftCombatant",
      combatantId: "nobody",
    })

    expect(next).toBe(session)
  })
})

describe("reduceCombatSession — DM overrides", () => {
  it("setCurrentActor points the actor at any combatant without touching acted flags", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(session, {
      kind: "setCurrentActor",
      combatantId: "combatant-1",
    })

    expect(next.currentActorId).toBe("combatant-1")
    expect(next.combatants.every((c) => !c.hasActedThisRound)).toBe(true)
  })

  it("setCurrentActor writes an unknown id unconditionally (unlike setActed's no-op)", () => {
    // Guides, never rejects (ADR Decision 8): setCurrentActor only sets the
    // field, so a bogus id is written as-is rather than no-op'd.
    const session = startedSession()

    const next = reduceCombatSession(session, {
      kind: "setCurrentActor",
      combatantId: "nobody",
    })

    expect(next.currentActorId).toBe("nobody")
  })

  it("setActed sets the flag without touching the current actor", () => {
    const session = startedSession() // currentActorId === combatant-0

    const next = reduceCombatSession(session, {
      kind: "setActed",
      combatantId: "combatant-1",
      hasActed: true,
    })

    expect(next.combatants[1]!.hasActedThisRound).toBe(true)
    expect(next.currentActorId).toBe("combatant-0")
  })

  it("setActed can un-flag a combatant (hasActed: false)", () => {
    const fresh = createCombatSession(SETUP, sequentialIds())
    const session: CombatSession = {
      ...fresh,
      combatants: [
        { ...fresh.combatants[0]!, hasActedThisRound: true },
        ...fresh.combatants.slice(1),
      ],
    }

    const next = reduceCombatSession(session, {
      kind: "setActed",
      combatantId: "combatant-0",
      hasActed: false,
    })

    expect(next.combatants[0]!.hasActedThisRound).toBe(false)
  })

  it("setActed is a no-op for an unknown combatant id", () => {
    const session = startedSession()

    const next = reduceCombatSession(session, {
      kind: "setActed",
      combatantId: "nobody",
      hasActed: true,
    })

    expect(next).toBe(session)
  })

  it("setRound sets the round without touching combatant flags or the actor", () => {
    const session = startedSession()

    const next = reduceCombatSession(session, { kind: "setRound", round: 5 })

    expect(next.round).toBe(5)
    expect(next.currentActorId).toBe(session.currentActorId)
    expect(next.combatants.every((c) => !c.hasActedThisRound)).toBe(true)
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

    const next = reduceCombatSession(session, { kind: "advanceRound" })

    expect(next.round).toBe(2)
    expect(next.currentActorId).toBeNull()
    expect(next.combatants.every((c) => !c.hasActedThisRound)).toBe(true)
  })

  it("still increments the round when no one has acted (idempotent safeguard)", () => {
    const session = startedSession()

    const next = reduceCombatSession(session, { kind: "advanceRound" })

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

    const next = reduceCombatSession(
      session,
      { kind: "addCombatant", setup: JOINER },
      () => "joiner-id"
    )

    expect(next.combatants).toHaveLength(3)
    const joiner = next.combatants[2]!
    expect(joiner.id).toBe("joiner-id")
    expect(joiner.hasActedThisRound).toBe(true)
    expect(joiner.side).toBe("enemies")
  })

  it("leaves the existing combatants untouched", () => {
    const session = startedSession()

    const next = reduceCombatSession(
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

    const next = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: removedId,
    })

    expect(next.combatants).toHaveLength(1)
    expect(next.combatants.some((c) => c.id === removedId)).toBe(false)
  })

  it("clears the current actor when it is the one removed", () => {
    const session = startedSession()

    const next = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: session.currentActorId!,
    })

    expect(next.currentActorId).toBeNull()
  })

  it("leaves the current actor when a different combatant is removed", () => {
    const session = startedSession()
    const actorId = session.currentActorId

    const next = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: session.combatants[1]!.id,
    })

    expect(next.currentActorId).toBe(actorId)
  })

  it("is a no-op for an unknown combatant id (returns the same session)", () => {
    const session = startedSession()

    const next = reduceCombatSession(session, {
      kind: "removeCombatant",
      combatantId: "nobody",
    })

    expect(next).toBe(session)
  })
})

describe("reduceCombatSession — purity", () => {
  it("does not mutate its input and returns a new session on change", () => {
    const session = startedSession()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((combatant) => Object.freeze(combatant))

    const next = reduceCombatSession(session, { kind: "endTurn" })

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

    const next = reduceCombatSession(session, { kind: "advanceRound" })

    expect(next).not.toBe(session)
    expect(session.round).toBe(1)
    expect(session.currentActorId).toBe(session.combatants[0]!.id)
  })

  it("does not mutate a frozen input on addCombatant", () => {
    const session = startedSession()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((combatant) => Object.freeze(combatant))

    const next = reduceCombatSession(
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

    const next = reduceCombatSession(session, {
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
    })
    const twice = reduceCombatSession(once, {
      kind: "applyBattleConditionDuration",
      combatantId: actorId,
      axis: "attack",
      turns: 3,
    })

    expect(twice.combatants[0]!.conditionDurations.attack).toBe(6)
  })

  it("is a no-op for an unknown combatant", () => {
    const started = startedSession()

    const next = reduceCombatSession(started, {
      kind: "applyBattleConditionDuration",
      combatantId: "nobody",
      axis: "attack",
      turns: 2,
    })

    expect(next.combatants).toEqual(started.combatants)
  })
})

describe("reduceCombatSession — setBattleConditionAxis / Flag", () => {
  it("sets a tri-state axis directly", () => {
    const started = startedSession()
    const actorId = started.currentActorId!

    const next = reduceCombatSession(started, {
      kind: "setBattleConditionAxis",
      combatantId: actorId,
      axis: "attack",
      state: "increased",
    })

    expect(next.combatants[0]!.battleConditions.attack).toBe("increased")
  })

  it("can set an axis back to neutral", () => {
    const started = startedSession()
    const actorId = started.currentActorId!

    const increased = reduceCombatSession(started, {
      kind: "setBattleConditionAxis",
      combatantId: actorId,
      axis: "defense",
      state: "decreased",
    })
    const cleared = reduceCombatSession(increased, {
      kind: "setBattleConditionAxis",
      combatantId: actorId,
      axis: "defense",
      state: "neutral",
    })

    expect(cleared.combatants[0]!.battleConditions.defense).toBe("neutral")
  })

  it("toggles a single-use flag on and off", () => {
    const started = startedSession()
    const actorId = started.currentActorId!

    const on = reduceCombatSession(started, {
      kind: "setBattleConditionFlag",
      combatantId: actorId,
      flag: "charged",
      value: true,
    })
    expect(on.combatants[0]!.battleConditions.charged).toBe(true)

    const off = reduceCombatSession(on, {
      kind: "setBattleConditionFlag",
      combatantId: actorId,
      flag: "charged",
      value: false,
    })
    expect(off.combatants[0]!.battleConditions.charged).toBe(false)
  })

  it("is a no-op for an unknown combatant", () => {
    const started = startedSession()

    const next = reduceCombatSession(started, {
      kind: "setBattleConditionAxis",
      combatantId: "nobody",
      axis: "attack",
      state: "increased",
    })

    expect(next).toBe(started)
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
    })
    const afterBoth = reduceCombatSession(afterFirst, {
      kind: "applyBattleConditionDuration",
      combatantId: second!.id,
      axis: "attack",
      turns: 2,
    })
    return { ...afterBoth, currentActorId: first!.id }
  }

  it("decrements only the current actor's durations", () => {
    const session = startedWithDurations()

    const next = reduceCombatSession(session, { kind: "endTurn" })

    expect(next.combatants[0]!.conditionDurations.attack).toBe(1)
    expect(next.combatants[1]!.conditionDurations.attack).toBe(2)
  })

  it("resets the actor's battle-condition axis to neutral on expiry", () => {
    const session = startedWithOverlay(
      { ...DEFAULT_BATTLE_CONDITIONS, attack: "increased" },
      { attack: 1 }
    )
    const actorId = session.currentActorId

    const next = reduceCombatSession(session, { kind: "endTurn" })

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

    const next = reduceCombatSession(session, { kind: "endTurn" })

    expect(next.combatants[0]!.battleConditions.attack).toBe("neutral")
    expect(next.combatants[0]!.conditionDurations.attack).toBeUndefined()
    expect(next.combatants[0]!.battleConditions.defense).toBe("increased")
    expect(next.combatants[0]!.conditionDurations.defense).toBe(2)
  })

  it("leaves an axis with no duration untouched", () => {
    const session = startedWithOverlay(
      { ...DEFAULT_BATTLE_CONDITIONS, attack: "increased" },
      {}
    )

    const next = reduceCombatSession(session, { kind: "endTurn" })

    expect(next.combatants[0]!.battleConditions.attack).toBe("increased")
    expect(next.combatants[0]!.conditionDurations.attack).toBeUndefined()
  })

  it("marks the actual current actor as acted, not merely the first combatant", () => {
    const base = createCombatSession(SETUP, sequentialIds())
    const session = { ...base, currentActorId: base.combatants[1]!.id }

    const next = reduceCombatSession(session, { kind: "endTurn" })

    expect(next.combatants[1]!.hasActedThisRound).toBe(true)
    expect(next.combatants[0]!.hasActedThisRound).toBe(false)
  })

  it("is a no-op when the current actor id matches no combatant", () => {
    const base = createCombatSession(SETUP, sequentialIds())
    const session = { ...base, currentActorId: "ghost" }

    const next = reduceCombatSession(session, { kind: "endTurn" })

    expect(next).toBe(session)
  })
})
