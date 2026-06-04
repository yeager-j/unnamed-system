import { describe, expect, it } from "vitest"

import { reduceCombatSession } from "./reduce-session"
import { createCombatSession, type CombatantSetup } from "./session"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

const STAT_BLOCK = {
  name: "Cave Bat",
  maxHP: 8,
  currentHP: 8,
  maxSP: 0,
  currentSP: 0,
  attributes: { strength: 0, magic: 0, agility: 2, luck: 0 },
}

/** combatant-0 PC, combatant-1 inline enemy, combatant-2 catalog enemy. */
const SETUP: CombatantSetup[] = [
  { side: "players", ref: { kind: "pc", characterId: "char-1" }, zoneId: "z" },
  {
    side: "enemies",
    ref: { kind: "enemy", statBlock: STAT_BLOCK },
    zoneId: "z",
  },
  {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "z",
  },
]

function build() {
  return createCombatSession(SETUP, sequentialIds())
}

function statBlockOf(session: ReturnType<typeof build>, id: string) {
  const ref = session.combatants.find((c) => c.id === id)?.ref
  return ref?.kind === "enemy" ? ref.statBlock : null
}

describe("adjustEnemyVitals", () => {
  it("sets an inline enemy's currentHP to the given value", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "currentHP",
      value: 3,
    })
    expect(statBlockOf(next, "combatant-1")?.currentHP).toBe(3)
  })

  it("lets currentHP go negative (overkill)", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "currentHP",
      value: -5,
    })
    expect(statBlockOf(next, "combatant-1")?.currentHP).toBe(-5)
  })

  it("floors maxHP at 0", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "maxHP",
      value: -3,
    })
    expect(statBlockOf(next, "combatant-1")?.maxHP).toBe(0)
  })

  it("sets maxHP to a positive value", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "maxHP",
      value: 12,
    })
    expect(statBlockOf(next, "combatant-1")?.maxHP).toBe(12)
  })

  it("is a no-op for a PC combatant", () => {
    const session = build()
    const next = reduceCombatSession(session, {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-0",
      field: "currentHP",
      value: 1,
    })
    expect(next).toBe(session)
  })

  it("is a no-op for a catalog enemy (no inline stat block)", () => {
    const session = build()
    const next = reduceCombatSession(session, {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-2",
      field: "currentHP",
      value: 1,
    })
    expect(next).toBe(session)
  })

  it("is a no-op for an unknown combatant id", () => {
    const session = build()
    const next = reduceCombatSession(session, {
      kind: "adjustEnemyVitals",
      combatantId: "nope",
      field: "currentHP",
      value: 1,
    })
    expect(next).toBe(session)
  })
})
