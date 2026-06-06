import { describe, expect, it } from "vitest"

import { reduceCombatSession } from "@workspace/game/engine/encounter/reduce-session"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { type CombatantSetup } from "@workspace/game/foundation/encounter/session"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

const STAT_BLOCK = {
  name: "Cave Bat",
  maxHP: 8,
  currentHP: 8,
  maxSP: 10,
  currentSP: 10,
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

function catalogRefOf(session: ReturnType<typeof build>, id: string) {
  const ref = session.combatants.find((c) => c.id === id)?.ref
  return ref?.kind === "catalog-enemy" ? ref : null
}

describe("adjustEnemyVitals", () => {
  it("sets an inline enemy's currentSP to the given value", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "currentSP",
      value: 4,
    })
    expect(statBlockOf(next, "combatant-1")?.currentSP).toBe(4)
  })

  it("floors an inline enemy's currentSP at 0", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "currentSP",
      value: -2,
    })
    expect(statBlockOf(next, "combatant-1")?.currentSP).toBe(0)
  })

  it("sets an inline enemy's maxSP", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "maxSP",
      value: 20,
    })
    expect(statBlockOf(next, "combatant-1")?.maxSP).toBe(20)
  })

  it("clamps an inline enemy's currentSP when maxSP drops below it", () => {
    // Cave Bat is at 10/10 SP; lowering max to 4 caps current at 4.
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "maxSP",
      value: 4,
    })
    expect(statBlockOf(next, "combatant-1")).toMatchObject({
      maxSP: 4,
      currentSP: 4,
    })
  })

  it("falls back to 0 for an unknown catalog enemy's max when setting maxHP", () => {
    const session = createCombatSession(
      [
        {
          side: "enemies",
          ref: { kind: "catalog-enemy", enemyKey: "not-a-real-enemy" },
          zoneId: "z",
        },
      ],
      () => "lone"
    )

    const next = reduceCombatSession(session, {
      kind: "adjustEnemyVitals",
      combatantId: "lone",
      field: "maxHP",
      value: 7,
    })

    expect(catalogRefOf(next, "lone")).toMatchObject({ maxHP: 7, currentHP: 0 })
  })

  it("sets an inline enemy's currentHP to the given value", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "currentHP",
      value: 3,
    })
    expect(statBlockOf(next, "combatant-1")?.currentHP).toBe(3)
  })

  it("floors currentHP at 0 (overkill can't go negative)", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "currentHP",
      value: -5,
    })
    expect(statBlockOf(next, "combatant-1")?.currentHP).toBe(0)
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

  it("clamps an inline enemy's currentHP when maxHP drops below it", () => {
    // Cave Bat is at 8/8; lowering max to 3 caps current at 3 (no 8/3).
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-1",
      field: "maxHP",
      value: 3,
    })
    expect(statBlockOf(next, "combatant-1")).toMatchObject({
      maxHP: 3,
      currentHP: 3,
    })
  })

  it("clamps a catalog enemy's currentHP when maxHP drops below it", () => {
    // The goblin's working HP defaults to its definition max; lowering max to 5
    // caps current at 5 (the 16/0 bug).
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-2",
      field: "maxHP",
      value: 5,
    })
    expect(catalogRefOf(next, "combatant-2")).toMatchObject({
      maxHP: 5,
      currentHP: 5,
    })
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

  it("sets a catalog enemy's working currentHP inline on the ref", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-2",
      field: "currentHP",
      value: 4,
    })
    expect(catalogRefOf(next, "combatant-2")?.currentHP).toBe(4)
  })

  it("sets and floors a catalog enemy's maxHP", () => {
    const next = reduceCombatSession(build(), {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-2",
      field: "maxHP",
      value: -3,
    })
    expect(catalogRefOf(next, "combatant-2")?.maxHP).toBe(0)
  })

  it("ignores SP fields for a catalog enemy (no SP)", () => {
    const session = build()
    const next = reduceCombatSession(session, {
      kind: "adjustEnemyVitals",
      combatantId: "combatant-2",
      field: "currentSP",
      value: 5,
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
