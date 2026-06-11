import { describe, expect, it } from "vitest"

import { reduceCombat } from "@workspace/game/engine/__fixtures__/encounter"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import {
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

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
  let session = createCombatSession(ids)(SETUP)
  session = reduceCombat(session, { kind: "addZone", name: "Courtyard" }, ids)
  session = reduceCombat(session, { kind: "addZone", name: "Hall" }, ids)
  const [zoneA, zoneB] = Object.keys(session.zones)
  session = reduceCombat(
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
    const session = createCombatSession(sequentialIds())(SETUP)

    const next = reduceCombat(
      session,
      { kind: "addZone", name: "Courtyard", notes: "muddy" },
      sequentialIds()
    )

    expect(next.zones).toEqual({
      "zone-0": { id: "zone-0", name: "Courtyard", notes: "muddy" },
    })
  })

  it("omits notes when none are supplied", () => {
    const session = createCombatSession(sequentialIds())(SETUP)

    const next = reduceCombat(
      session,
      { kind: "addZone", name: "Hall" },
      sequentialIds()
    )

    expect(next.zones["zone-0"]).toEqual({ id: "zone-0", name: "Hall" })
    expect(next.zones["zone-0"]).not.toHaveProperty("notes")
  })

  it("honors a client-supplied zoneId over the minted fallback (UNN-347)", () => {
    const session = createCombatSession(sequentialIds())(SETUP)

    const next = reduceCombat(
      session,
      { kind: "addZone", name: "Courtyard", zoneId: "client-zone" },
      () => "should-not-be-used"
    )

    expect(next.zones).toEqual({
      "client-zone": { id: "client-zone", name: "Courtyard" },
    })
  })
})

describe("reduceCombatSession — removeZone", () => {
  it("drops the zone and prunes its id from neighbors' adjacency lists", () => {
    const { session, zoneA, zoneB } = sessionWithEdge()

    const next = reduceCombat(session, {
      kind: "removeZone",
      zoneId: zoneA,
    })

    expect(next.zones).not.toHaveProperty(zoneA)
    expect(next.adjacency).not.toHaveProperty(zoneA)
    expect(next.adjacency[zoneB] ?? []).not.toContain(zoneA)
  })

  it("does not mutate any combatant's zoneId", () => {
    const { session, zoneA } = sessionWithEdge()

    const next = reduceCombat(session, {
      kind: "removeZone",
      zoneId: zoneA,
    })

    expect(next.combatants[0]!.zoneId).toBe(session.combatants[0]!.zoneId)
  })

  it("is a no-op when the zone id is unknown", () => {
    const { session } = sessionWithEdge()

    const next = reduceCombat(session, {
      kind: "removeZone",
      zoneId: "ghost",
    })

    expect(next).toBe(session)
  })

  it("leaves a dangling adjacency entry untouched when its zone is unknown", () => {
    const { session } = sessionWithEdge()
    const withOrphan: CombatSession = {
      ...session,
      adjacency: { ...session.adjacency, orphan: ["zone-0"] },
    }

    const next = reduceCombat(withOrphan, {
      kind: "removeZone",
      zoneId: "orphan",
    })

    expect(next).toBe(withOrphan)
    expect(next.adjacency).toHaveProperty("orphan")
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

    const next = reduceCombat(session, {
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

    const next = reduceCombat(session, {
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

    const next = reduceCombat(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA,
      zoneIdB: "ghost",
      adjacent: true,
    })

    expect(next).toBe(session)
  })

  it("is a no-op when the first zone is unknown", () => {
    const { session, zoneB } = sessionWithEdge()

    const next = reduceCombat(session, {
      kind: "setZoneAdjacency",
      zoneIdA: "ghost",
      zoneIdB: zoneB,
      adjacent: true,
    })

    expect(next).toBe(session)
  })

  it("is a no-op when clearing an edge that does not exist", () => {
    const ids = sequentialIds()
    let session = createCombatSession(ids)(SETUP)
    session = reduceCombat(session, { kind: "addZone", name: "A" }, ids)
    session = reduceCombat(session, { kind: "addZone", name: "B" }, ids)
    const [zoneA, zoneB] = Object.keys(session.zones)

    const next = reduceCombat(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA!,
      zoneIdB: zoneB!,
      adjacent: false,
    })

    expect(next).toBe(session)
  })

  it("leaves existing neighbors untouched when clearing a non-existent edge", () => {
    const ids = sequentialIds()
    let session = createCombatSession(ids)(SETUP)
    session = reduceCombat(session, { kind: "addZone", name: "A" }, ids)
    session = reduceCombat(session, { kind: "addZone", name: "B" }, ids)
    session = reduceCombat(session, { kind: "addZone", name: "C" }, ids)
    const [zoneA, zoneB, zoneC] = Object.keys(session.zones)
    session = reduceCombat(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA!,
      zoneIdB: zoneB!,
      adjacent: true,
    })
    expect(session.adjacency[zoneA!]).toEqual([zoneB])

    const next = reduceCombat(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA!,
      zoneIdB: zoneC!,
      adjacent: false,
    })

    expect(next.adjacency[zoneA!]).toEqual([zoneB])
  })

  it("removes only the named edge, leaving other neighbors intact", () => {
    const ids = sequentialIds()
    let session = createCombatSession(ids)(SETUP)
    session = reduceCombat(session, { kind: "addZone", name: "A" }, ids)
    session = reduceCombat(session, { kind: "addZone", name: "B" }, ids)
    session = reduceCombat(session, { kind: "addZone", name: "C" }, ids)
    const [zoneA, zoneB, zoneC] = Object.keys(session.zones)
    for (const other of [zoneB!, zoneC!]) {
      session = reduceCombat(session, {
        kind: "setZoneAdjacency",
        zoneIdA: zoneA!,
        zoneIdB: other,
        adjacent: true,
      })
    }
    expect(session.adjacency[zoneA!]).toEqual([zoneB, zoneC])

    const next = reduceCombat(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA!,
      zoneIdB: zoneC!,
      adjacent: false,
    })

    expect(next.adjacency[zoneA!]).toEqual([zoneB])
    expect(next.adjacency[zoneC!] ?? []).not.toContain(zoneA)
  })

  it("is a no-op when the two zone ids are equal (no self-loop)", () => {
    const { session, zoneA } = sessionWithEdge()

    const next = reduceCombat(session, {
      kind: "setZoneAdjacency",
      zoneIdA: zoneA,
      zoneIdB: zoneA,
      adjacent: true,
    })

    expect(next).toBe(session)
    expect(session.adjacency[zoneA]).not.toContain(zoneA)
  })
})

describe("reduceCombatSession — renameZone", () => {
  it("updates the zone's display name", () => {
    const { session, zoneA } = sessionWithEdge()

    const next = reduceCombat(session, {
      kind: "renameZone",
      zoneId: zoneA,
      name: "Inner Courtyard",
    })

    expect(next.zones[zoneA]!.name).toBe("Inner Courtyard")
  })

  it("is a no-op when the zone id is unknown", () => {
    const { session } = sessionWithEdge()

    const next = reduceCombat(session, {
      kind: "renameZone",
      zoneId: "ghost",
      name: "Nowhere",
    })

    expect(next).toBe(session)
  })
})
