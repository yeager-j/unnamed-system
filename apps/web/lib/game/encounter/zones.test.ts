import { describe, expect, it } from "vitest"

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
]

function sequentialIds() {
  let n = 0
  return () => `zone-${n++}`
}

/** A session pre-seeded with two adjacent zones (`zone-0` ↔ `zone-1`), built
 *  through the reducer so the graph is shaped exactly as it would be at runtime. */
function sessionWithEdge(): {
  session: CombatSession
  zoneA: string
  zoneB: string
} {
  const ids = sequentialIds()
  let session = createCombatSession(SETUP, ids)
  session = reduceCombatSession(
    session,
    { kind: "addZone", name: "Courtyard" },
    ids
  )
  session = reduceCombatSession(session, { kind: "addZone", name: "Hall" }, ids)
  const [zoneA, zoneB] = Object.keys(session.zones)
  session = reduceCombatSession(
    session,
    {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA!,
      zoneIdB: zoneB!,
      adjacent: true,
    },
    ids
  )
  return { session, zoneA: zoneA!, zoneB: zoneB! }
}

describe("reduceCombatSession — addZone", () => {
  it("mints a stable id and stores a self-describing zone with name and notes", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(
      session,
      { kind: "addZone", name: "Courtyard", notes: "muddy" },
      sequentialIds()
    )

    expect(next.zones).toEqual({
      "zone-0": { id: "zone-0", name: "Courtyard", notes: "muddy" },
    })
  })

  it("omits notes when none are supplied", () => {
    const session = createCombatSession(SETUP, sequentialIds())

    const next = reduceCombatSession(
      session,
      { kind: "addZone", name: "Hall" },
      sequentialIds()
    )

    expect(next.zones["zone-0"]).toEqual({ id: "zone-0", name: "Hall" })
    expect(next.zones["zone-0"]).not.toHaveProperty("notes")
  })
})

describe("reduceCombatSession — removeZone", () => {
  it("drops the zone and prunes its id from neighbors' adjacency lists", () => {
    const { session, zoneA, zoneB } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "removeZone",
      zoneId: zoneA,
    })

    expect(next.zones).not.toHaveProperty(zoneA)
    expect(next.adjacency).not.toHaveProperty(zoneA)
    expect(next.adjacency[zoneB] ?? []).not.toContain(zoneA)
  })

  it("does not mutate any combatant's zoneId", () => {
    const { session, zoneA } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "removeZone",
      zoneId: zoneA,
    })

    expect(next.combatants[0]!.zoneId).toBe(session.combatants[0]!.zoneId)
  })

  it("is a no-op when the zone id is unknown", () => {
    const { session } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "removeZone",
      zoneId: "ghost",
    })

    expect(next).toBe(session)
  })
})

describe("reduceCombatSession — setZoneAdjacency", () => {
  it("records an undirected edge in both directions", () => {
    const { session, zoneA, zoneB } = sessionWithEdge()

    expect(session.adjacency[zoneA]).toEqual([zoneB])
    expect(session.adjacency[zoneB]).toEqual([zoneA])
  })

  it("is idempotent — re-adding an existing edge does not duplicate it", () => {
    const { session, zoneA, zoneB } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA,
      zoneIdB: zoneB,
      adjacent: true,
    })

    expect(next.adjacency[zoneA]).toEqual([zoneB])
    expect(next.adjacency[zoneB]).toEqual([zoneA])
  })

  it("clears the edge in both directions when adjacent is false", () => {
    const { session, zoneA, zoneB } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA,
      zoneIdB: zoneB,
      adjacent: false,
    })

    expect(next.adjacency[zoneA] ?? []).not.toContain(zoneB)
    expect(next.adjacency[zoneB] ?? []).not.toContain(zoneA)
  })

  it("is a no-op when either zone is unknown", () => {
    const { session, zoneA } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA,
      zoneIdB: "ghost",
      adjacent: true,
    })

    expect(next).toBe(session)
  })
})

describe("reduceCombatSession — renameZone", () => {
  it("updates the zone's display name", () => {
    const { session, zoneA } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "renameZone",
      zoneId: zoneA,
      name: "Inner Courtyard",
    })

    expect(next.zones[zoneA]!.name).toBe("Inner Courtyard")
  })

  it("is a no-op when the zone id is unknown", () => {
    const { session } = sessionWithEdge()

    const next = reduceCombatSession(session, {
      kind: "renameZone",
      zoneId: "ghost",
      name: "Nowhere",
    })

    expect(next).toBe(session)
  })
})
