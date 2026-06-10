import { describe, expect, it } from "vitest"

import { reduceCombat } from "@workspace/game/engine/__fixtures__/encounter"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { type CombatantSetup, type Counters } from "@workspace/game/foundation"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

/** combatant-0 PC, combatant-1 inline enemy. */
const SETUP: CombatantSetup[] = [
  { side: "players", ref: { kind: "pc", characterId: "char-1" }, zoneId: "z" },
  {
    side: "enemies",
    ref: {
      kind: "enemy",
      statBlock: {
        name: "Shadow",
        maxHP: 20,
        currentHP: 20,
        maxSP: 0,
        currentSP: 0,
        attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
      },
    },
    zoneId: "z",
  },
]

function build() {
  return createCombatSession(SETUP, sequentialIds())
}

function countersOf(
  session: ReturnType<typeof build>,
  id: string
): Counters | undefined {
  return session.combatants.find((c) => c.id === id)?.counters
}

describe("reduceCombatSession — adjustCounter / clearCounter", () => {
  it("adjustCounter adds a counter from absent (0)", () => {
    const next = reduceCombat(build(), {
      kind: "adjustCounter",
      combatantId: "combatant-1",
      counter: "lumina",
      delta: 1,
    })
    expect(countersOf(next, "combatant-1")).toEqual({ lumina: 1 })
  })

  it("adjustCounter accumulates across nudges (delta merges, not overwrites)", () => {
    let next = reduceCombat(build(), {
      kind: "adjustCounter",
      combatantId: "combatant-1",
      counter: "lumina",
      delta: 1,
    })
    next = reduceCombat(next, {
      kind: "adjustCounter",
      combatantId: "combatant-1",
      counter: "lumina",
      delta: 2,
    })
    expect(countersOf(next, "combatant-1")).toEqual({ lumina: 3 })
  })

  it("adjustCounter floors at 0 and drops the key (overshoot can't go negative)", () => {
    const seeded = reduceCombat(build(), {
      kind: "adjustCounter",
      combatantId: "combatant-1",
      counter: "lumina",
      delta: 2,
    })
    const next = reduceCombat(seeded, {
      kind: "adjustCounter",
      combatantId: "combatant-1",
      counter: "lumina",
      delta: -5,
    })
    expect(countersOf(next, "combatant-1")).toEqual({})
  })

  it("clearCounter removes the counter outright", () => {
    const seeded = reduceCombat(build(), {
      kind: "adjustCounter",
      combatantId: "combatant-1",
      counter: "lumina",
      delta: 3,
    })
    const next = reduceCombat(seeded, {
      kind: "clearCounter",
      combatantId: "combatant-1",
      counter: "lumina",
    })
    expect(countersOf(next, "combatant-1")).toEqual({})
  })

  it("clearCounter for an absent counter is a harmless no-change", () => {
    const next = reduceCombat(build(), {
      kind: "clearCounter",
      combatantId: "combatant-1",
      counter: "lumina",
    })
    expect(countersOf(next, "combatant-1")).toEqual({})
  })

  it("works on a PC combatant (overlay is identical to an enemy's)", () => {
    const next = reduceCombat(build(), {
      kind: "adjustCounter",
      combatantId: "combatant-0",
      counter: "lumina",
      delta: 1,
    })
    expect(countersOf(next, "combatant-0")).toEqual({ lumina: 1 })
  })

  it("is a no-op for an unknown combatant id", () => {
    const session = build()
    const next = reduceCombat(session, {
      kind: "adjustCounter",
      combatantId: "nobody",
      counter: "lumina",
      delta: 1,
    })
    expect(next).toBe(session)
  })

  it("does not mutate a frozen input", () => {
    const session = build()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((c) => Object.freeze(c))

    const next = reduceCombat(session, {
      kind: "adjustCounter",
      combatantId: "combatant-0",
      counter: "lumina",
      delta: 1,
    })

    expect(next).not.toBe(session)
    expect(session.combatants[0]!.counters).toEqual({})
  })
})
