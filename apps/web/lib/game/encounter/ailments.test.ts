import { describe, expect, it } from "vitest"

import { reduceCombatSession } from "./reduce-session"
import { createCombatSession, type CombatantSetup } from "./session"

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

function ailmentsOf(
  session: ReturnType<typeof build>,
  id: string
): string[] | undefined {
  return session.combatants.find((c) => c.id === id)?.ailments
}

describe("reduceCombatSession — setAilment / clearAilment", () => {
  it("setAilment adds an ailment key", () => {
    const next = reduceCombatSession(build(), {
      kind: "setAilment",
      combatantId: "combatant-0",
      ailment: "burn",
    })
    expect(ailmentsOf(next, "combatant-0")).toEqual(["burn"])
  })

  it("setAilment is idempotent (no duplicate key)", () => {
    const once = reduceCombatSession(build(), {
      kind: "setAilment",
      combatantId: "combatant-0",
      ailment: "burn",
    })
    const twice = reduceCombatSession(once, {
      kind: "setAilment",
      combatantId: "combatant-0",
      ailment: "burn",
    })
    expect(ailmentsOf(twice, "combatant-0")).toEqual(["burn"])
  })

  it("permits multiple co-existing ailments (no one-at-a-time enforcement)", () => {
    let next = reduceCombatSession(build(), {
      kind: "setAilment",
      combatantId: "combatant-0",
      ailment: "burn",
    })
    next = reduceCombatSession(next, {
      kind: "setAilment",
      combatantId: "combatant-0",
      ailment: "freeze",
    })
    next = reduceCombatSession(next, {
      kind: "setAilment",
      combatantId: "combatant-0",
      ailment: "downed",
    })
    expect(ailmentsOf(next, "combatant-0")).toEqual([
      "burn",
      "freeze",
      "downed",
    ])
  })

  it("clearAilment removes one key, leaving the rest", () => {
    let next = reduceCombatSession(build(), {
      kind: "setAilment",
      combatantId: "combatant-1",
      ailment: "burn",
    })
    next = reduceCombatSession(next, {
      kind: "setAilment",
      combatantId: "combatant-1",
      ailment: "downed",
    })
    next = reduceCombatSession(next, {
      kind: "clearAilment",
      combatantId: "combatant-1",
      ailment: "burn",
    })
    expect(ailmentsOf(next, "combatant-1")).toEqual(["downed"])
  })

  it("clearAilment for an absent key is a harmless no-change", () => {
    const next = reduceCombatSession(build(), {
      kind: "clearAilment",
      combatantId: "combatant-0",
      ailment: "burn",
    })
    expect(ailmentsOf(next, "combatant-0")).toEqual([])
  })

  it("works on an enemy combatant (overlay is identical to a PC's)", () => {
    const next = reduceCombatSession(build(), {
      kind: "setAilment",
      combatantId: "combatant-1",
      ailment: "shock",
    })
    expect(ailmentsOf(next, "combatant-1")).toEqual(["shock"])
  })

  it("is a no-op for an unknown combatant id", () => {
    const session = build()
    const next = reduceCombatSession(session, {
      kind: "setAilment",
      combatantId: "nobody",
      ailment: "burn",
    })
    expect(next).toBe(session)
  })

  it("does not mutate a frozen input", () => {
    const session = build()
    Object.freeze(session)
    Object.freeze(session.combatants)
    session.combatants.forEach((c) => Object.freeze(c))

    const next = reduceCombatSession(session, {
      kind: "setAilment",
      combatantId: "combatant-0",
      ailment: "burn",
    })

    expect(next).not.toBe(session)
    expect(session.combatants[0]!.ailments).toEqual([])
  })
})
