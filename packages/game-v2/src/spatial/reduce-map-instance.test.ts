import { describe, expect, it } from "vitest"

import {
  engaged,
  free,
  makeConnection,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
  pid,
  reduceInstance,
} from "./__fixtures__/spatial"
import type { MapGeometryEvent } from "./geometry-event"
import type { MapInstanceState } from "./map-instance.schema"
import { reduceMapGeometry } from "./reduce-map-geometry"

/** Neighbor zone ids of `zoneId`, derived straight from the undirected connection
 *  record (the `adjacentZones` selector is a separate, later concern). */
const adjacentIds = (instance: MapInstanceState, zoneId: string): string[] =>
  Object.values(instance.geometry.connections)
    .filter((conn) => conn.fromZoneId === zoneId || conn.toZoneId === zoneId)
    .map((conn) =>
      conn.fromZoneId === zoneId ? conn.toZoneId : conn.fromZoneId
    )

/** Two connected zones (a–b), the rich geometry shape. */
const twoZones = () => ({
  geometry: makeGeometry(
    [
      makeZone("zone-a", { name: "Courtyard" }),
      makeZone("zone-b", { name: "Hall" }),
    ],
    [makeConnection("conn-ab", "zone-a", "zone-b")]
  ),
})

describe("reduceMapInstance — moveCombatant", () => {
  const placed = () =>
    makeMapInstanceState({ ...twoZones(), occupancy: { c0: free("zone-a") } })

  it("moves the token to the target zone", () => {
    const next = reduceInstance(placed(), {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.occupancy.c0!.zoneId).toBe("zone-b")
  })

  it("applies a non-adjacent target verbatim (guides, does not block)", () => {
    const next = reduceInstance(placed(), {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-detached",
    })

    expect(next.occupancy.c0!.zoneId).toBe("zone-detached")
  })

  it("is a no-op when the combatant has no token", () => {
    const state = placed()
    const next = reduceInstance(state, {
      kind: "moveCombatant",
      tokenKey: "ghost",
      toZoneId: "zone-b",
    })

    expect(next).toBe(state)
  })

  it("is a no-op when moving to the already-occupied zone", () => {
    const state = placed()
    const next = reduceInstance(state, {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-a",
    })

    expect(next).toBe(state)
  })
})

describe("reduceMapInstance — moveCombatant → reveal", () => {
  const placed = () =>
    makeMapInstanceState({ ...twoZones(), occupancy: { c0: free("zone-a") } })

  it("reveals the entered zone to players", () => {
    const next = reduceInstance(placed(), {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.reveal.revealedZoneIds).toContain("zone-b")
  })

  it("does not reveal a phantom (non-existent) destination zone", () => {
    const next = reduceInstance(placed(), {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-detached",
    })

    expect(next.reveal.revealedZoneIds).not.toContain("zone-detached")
  })

  it("re-revealing an already-revealed zone does not duplicate it", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: free("zone-a") },
      reveal: {
        revealedZoneIds: ["zone-b"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    })

    const next = reduceInstance(state, {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.reveal.revealedZoneIds).toEqual(["zone-b"])
  })

  it("does not write the touched connection into revealedConnectionIds (known exits derive)", () => {
    const next = reduceInstance(placed(), {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.reveal.revealedConnectionIds).toEqual([])
  })
})

describe("reduceMapInstance — moveCombatant engagement invariant (D28#1 SUPERSEDE)", () => {
  // ⚠ These assert the deliberate non-parity behavior: moving breaks the same-zone
  // melee lock (v2 couples move + lock; SD7 / D28#1). The SUPERSEDE is relative to the
  // UNN-315 requirements baseline that had *decoupled* them — do NOT "fix" these to
  // keep the lock across a move.
  it("severs a cross-zone engagement on both tokens when one moves away", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: {
        c0: engaged("zone-a", ["c1"]),
        c1: engaged("zone-a", ["c0"]),
      },
    })

    const next = reduceInstance(state, {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.occupancy.c0!.engagement).toEqual({ status: "free" })
    expect(next.occupancy.c1!.engagement).toEqual({ status: "free" })
  })

  it("keeps the engagement when the token moves into the target's zone", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: {
        c0: engaged("zone-a", ["c1"]),
        c1: engaged("zone-b", ["c0"]),
      },
    })

    const next = reduceInstance(state, {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.occupancy.c0!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c1"],
    })
    expect(next.occupancy.c1!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c0"],
    })
  })

  it("severs only the cross-zone partner, keeping a co-located one", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: {
        c0: engaged("zone-a", ["c1", "c2"]),
        c1: engaged("zone-b", ["c0"]),
        c2: engaged("zone-a", ["c0"]),
      },
    })

    const next = reduceInstance(state, {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.occupancy.c0!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c1"],
    })
    expect(next.occupancy.c1!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c0"],
    })
    expect(next.occupancy.c2!.engagement).toEqual({ status: "free" })
  })

  it("tolerates a stale engagement target that has no token", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: engaged("zone-a", ["c1", "ghost"]), c1: free("zone-a") },
    })

    const next = reduceInstance(state, {
      kind: "moveCombatant",
      tokenKey: "c0",
      toZoneId: "zone-b",
    })

    expect(next.occupancy.c0!.engagement).toEqual({ status: "free" })
    expect(next.occupancy.c1!.engagement).toEqual({ status: "free" })
  })
})

describe("reduceMapInstance — placeCombatant (upsert)", () => {
  const unplaced = () => makeMapInstanceState(twoZones())

  it("mints a Free token in the target zone for an un-tokened combatant", () => {
    const next = reduceInstance(unplaced(), {
      kind: "placeCombatant",
      tokenKey: "c0",
      zoneId: "zone-a",
    })

    expect(next.occupancy.c0).toEqual({
      zoneId: "zone-a",
      engagement: { status: "free" },
    })
  })

  it("reveals nothing — placement is DM authoring, not observed movement", () => {
    const placed = reduceInstance(unplaced(), {
      kind: "placeCombatant",
      tokenKey: "c0",
      zoneId: "zone-a",
    })
    expect(placed.occupancy.c0!.zoneId).toBe("zone-a")
    expect(placed.reveal.revealedZoneIds).toEqual([])
  })

  it("moves an existing token with full move semantics (severs cross-zone engagement)", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: {
        c0: engaged("zone-a", ["c1"]),
        c1: engaged("zone-a", ["c0"]),
      },
    })

    const next = reduceInstance(state, {
      kind: "placeCombatant",
      tokenKey: "c0",
      zoneId: "zone-b",
    })

    expect(next.occupancy.c0!.zoneId).toBe("zone-b")
    expect(next.occupancy.c0!.engagement).toEqual({ status: "free" })
    expect(next.occupancy.c1!.engagement).toEqual({ status: "free" })
  })

  it("is a no-op when re-placing a token in its occupied zone", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: free("zone-a") },
    })

    const next = reduceInstance(state, {
      kind: "placeCombatant",
      tokenKey: "c0",
      zoneId: "zone-a",
    })

    expect(next).toBe(state)
  })
})

describe("reduceMapInstance — engagement (symmetric)", () => {
  const pair = () =>
    makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: free("zone-a"), c1: free("zone-a") },
    })

  it("setEngagement mirrors onto the target", () => {
    const next = reduceInstance(pair(), {
      kind: "setEngagement",
      tokenKey: "c0",
      targetCombatantIds: [pid("c1")],
    })

    expect(next.occupancy.c0!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c1"],
    })
    expect(next.occupancy.c1!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c0"],
    })
  })

  it("reverts a dropped partner to Free while keeping a retained one", () => {
    const engagedTrio = reduceInstance(
      makeMapInstanceState({
        occupancy: { c0: free("z"), c1: free("z"), c2: free("z") },
      }),
      {
        kind: "setEngagement",
        tokenKey: "c0",
        targetCombatantIds: [pid("c1"), pid("c2")],
      }
    )

    const next = reduceInstance(engagedTrio, {
      kind: "setEngagement",
      tokenKey: "c0",
      targetCombatantIds: [pid("c1")],
    })

    expect(next.occupancy.c1!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c0"],
    })
    expect(next.occupancy.c2!.engagement).toEqual({ status: "free" })
  })

  it("dropping one partner leaves that partner's other links intact", () => {
    const base = makeMapInstanceState({
      occupancy: { c0: free("z"), c1: free("z"), c2: free("z"), c3: free("z") },
    })
    const c1WithC2 = reduceInstance(base, {
      kind: "setEngagement",
      tokenKey: "c1",
      targetCombatantIds: [pid("c2")],
    })
    const c0WithC1 = reduceInstance(c1WithC2, {
      kind: "setEngagement",
      tokenKey: "c0",
      targetCombatantIds: [pid("c1")],
    })

    const next = reduceInstance(c0WithC1, {
      kind: "setEngagement",
      tokenKey: "c0",
      targetCombatantIds: [pid("c3")],
    })

    expect(next.occupancy.c1!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c2"],
    })
  })

  it("clearEngagement leaves a freed partner's other links intact", () => {
    const base = makeMapInstanceState({
      occupancy: { c0: free("z"), c1: free("z"), c2: free("z") },
    })
    const c1WithC2 = reduceInstance(base, {
      kind: "setEngagement",
      tokenKey: "c1",
      targetCombatantIds: [pid("c2")],
    })
    const c0WithC1 = reduceInstance(c1WithC2, {
      kind: "setEngagement",
      tokenKey: "c0",
      targetCombatantIds: [pid("c1")],
    })

    const next = reduceInstance(c0WithC1, {
      kind: "clearEngagement",
      tokenKey: "c0",
    })

    expect(next.occupancy.c1!.engagement).toEqual({
      status: "engaged",
      targetCombatantIds: ["c2"],
    })
  })

  it("clearEngagement frees the token and removes it from each partner", () => {
    const engagedPair = reduceInstance(pair(), {
      kind: "setEngagement",
      tokenKey: "c0",
      targetCombatantIds: [pid("c1")],
    })

    const next = reduceInstance(engagedPair, {
      kind: "clearEngagement",
      tokenKey: "c0",
    })

    expect(next.occupancy.c0!.engagement).toEqual({ status: "free" })
    expect(next.occupancy.c1!.engagement).toEqual({ status: "free" })
  })

  it("is a no-op for an unknown combatant", () => {
    const state = pair()
    const next = reduceInstance(state, {
      kind: "setEngagement",
      tokenKey: "ghost",
      targetCombatantIds: [pid("c1")],
    })

    expect(next).toBe(state)
  })

  it("is a no-op when clearing an already-Free token", () => {
    const state = pair()
    const next = reduceInstance(state, {
      kind: "clearEngagement",
      tokenKey: "c0",
    })

    expect(next).toBe(state)
  })
})

describe("reduceMapInstance — enchantment (singleton)", () => {
  const oneZone = () =>
    makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a", { name: "A" })]),
    })

  it("applies a new Enchantment at Forte 1", () => {
    const next = reduceInstance(oneZone(), {
      kind: "applyEnchantment",
      zoneId: "zone-a",
      enchantment: "toccata",
    })

    expect(next.enchantment).toEqual({
      zoneId: "zone-a",
      type: "toccata",
      forte: 1,
    })
  })

  it("raises Forte on re-applying the same type to the same zone (capped)", () => {
    let state = oneZone()
    for (let i = 0; i < 5; i++) {
      state = reduceInstance(state, {
        kind: "applyEnchantment",
        zoneId: "zone-a",
        enchantment: "toccata",
      })
    }

    expect(state.enchantment).toEqual({
      zoneId: "zone-a",
      type: "toccata",
      forte: 3,
    })
  })

  it("replaces (Forte 1) when the type changes on the same zone", () => {
    const first = reduceInstance(oneZone(), {
      kind: "applyEnchantment",
      zoneId: "zone-a",
      enchantment: "toccata",
    })
    const next = reduceInstance(first, {
      kind: "applyEnchantment",
      zoneId: "zone-a",
      enchantment: "requiem",
    })

    expect(next.enchantment).toEqual({
      zoneId: "zone-a",
      type: "requiem",
      forte: 1,
    })
  })

  it("replaces (Forte 1) when a second zone is Enchanted", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([
        makeZone("zone-a", { name: "A" }),
        makeZone("zone-b", { name: "B" }),
      ]),
      enchantment: { zoneId: "zone-a", type: "toccata", forte: 3 },
    })

    const next = reduceInstance(state, {
      kind: "applyEnchantment",
      zoneId: "zone-b",
      enchantment: "toccata",
    })

    expect(next.enchantment).toEqual({
      zoneId: "zone-b",
      type: "toccata",
      forte: 1,
    })
  })

  it("is a no-op when the zone is unknown", () => {
    const state = oneZone()
    const next = reduceInstance(state, {
      kind: "applyEnchantment",
      zoneId: "ghost",
      enchantment: "toccata",
    })

    expect(next).toBe(state)
  })

  it("clears an active Enchantment, and no-ops when none is active", () => {
    const enchanted = makeMapInstanceState({
      enchantment: { zoneId: "zone-a", type: "toccata", forte: 2 },
    })
    expect(
      reduceInstance(enchanted, { kind: "clearEnchantment" }).enchantment
    ).toBeNull()

    const empty = makeMapInstanceState()
    expect(reduceInstance(empty, { kind: "clearEnchantment" })).toBe(empty)
  })
})

describe("reduceMapInstance — zone graph", () => {
  it("adds a zone under a supplied id, mapping notes to dmNotes with defaulted layout", () => {
    const next = reduceInstance(makeMapInstanceState(), {
      kind: "addZone",
      zoneId: "zone-a",
      name: "Courtyard",
      notes: "fountain",
    })

    expect(next.geometry.zones["zone-a"]).toEqual({
      id: "zone-a",
      name: "Courtyard",
      description: "",
      dmNotes: "fountain",
      position: { x: 0, y: 0 },
    })
  })

  it("mints an id via newId when none is supplied, with empty dmNotes", () => {
    const next = reduceInstance(
      makeMapInstanceState(),
      { kind: "addZone", name: "Minted" },
      () => "fresh-zone"
    )

    expect(next.geometry.zones["fresh-zone"]).toEqual({
      id: "fresh-zone",
      name: "Minted",
      description: "",
      dmNotes: "",
      position: { x: 0, y: 0 },
    })
  })

  it("does not duplicate an existing connection (idempotent)", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("zone-a", { name: "A" }), makeZone("zone-b", { name: "B" })],
        [makeConnection("conn-ab", "zone-a", "zone-b")]
      ),
    })

    const next = reduceInstance(state, {
      kind: "setZoneAdjacency",
      zoneIdA: "zone-a",
      zoneIdB: "zone-b",
      adjacent: true,
    })

    expect(Object.keys(next.geometry.connections)).toHaveLength(1)
    expect(adjacentIds(next, "zone-a")).toEqual(["zone-b"])
  })

  it("clearing a non-present edge leaves the other neighbors intact", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry(
        [
          makeZone("zone-a", { name: "A" }),
          makeZone("zone-b", { name: "B" }),
          makeZone("zone-c", { name: "C" }),
        ],
        [makeConnection("conn-ac", "zone-a", "zone-c")]
      ),
    })

    // a–b was never linked; clearing it must not disturb a–c.
    const next = reduceInstance(state, {
      kind: "setZoneAdjacency",
      zoneIdA: "zone-a",
      zoneIdB: "zone-b",
      adjacent: false,
    })

    expect(adjacentIds(next, "zone-a")).toEqual(["zone-c"])
  })

  it("no-ops adjacency when the first zone is missing", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a", { name: "A" })]),
    })

    expect(
      reduceInstance(state, {
        kind: "setZoneAdjacency",
        zoneIdA: "ghost",
        zoneIdB: "zone-a",
        adjacent: true,
      })
    ).toBe(state)
  })

  it("removes a zone with no active Enchantment without error", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: free("zone-a") },
    })

    const next = reduceInstance(state, { kind: "removeZone", zoneId: "zone-a" })

    expect(next.geometry.zones["zone-a"]).toBeUndefined()
    expect(adjacentIds(next, "zone-b")).toEqual([])
    expect(next.enchantment).toBeNull()
  })

  it("removes a zone, prunes its connections, and clears an Enchantment on it", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      enchantment: { zoneId: "zone-a", type: "toccata", forte: 2 },
    })

    const next = reduceInstance(state, { kind: "removeZone", zoneId: "zone-a" })

    expect(next.geometry.zones["zone-a"]).toBeUndefined()
    expect(next.geometry.connections["conn-ab"]).toBeUndefined()
    expect(adjacentIds(next, "zone-b")).toEqual([])
    expect(next.enchantment).toBeNull()
  })

  it("keeps an Enchantment on a different zone when removing", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      enchantment: { zoneId: "zone-b", type: "toccata", forte: 1 },
    })

    const next = reduceInstance(state, { kind: "removeZone", zoneId: "zone-a" })

    expect(next.enchantment).toEqual({
      zoneId: "zone-b",
      type: "toccata",
      forte: 1,
    })
  })

  it("writes an undirected connection and clears it", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([
        makeZone("zone-a", { name: "A" }),
        makeZone("zone-b", { name: "B" }),
      ]),
    })

    const linked = reduceInstance(
      state,
      {
        kind: "setZoneAdjacency",
        zoneIdA: "zone-a",
        zoneIdB: "zone-b",
        adjacent: true,
      },
      () => "conn-1"
    )
    expect(adjacentIds(linked, "zone-a")).toEqual(["zone-b"])
    expect(adjacentIds(linked, "zone-b")).toEqual(["zone-a"])

    const unlinked = reduceInstance(linked, {
      kind: "setZoneAdjacency",
      zoneIdA: "zone-a",
      zoneIdB: "zone-b",
      adjacent: false,
    })
    expect(adjacentIds(unlinked, "zone-a")).toEqual([])
    expect(adjacentIds(unlinked, "zone-b")).toEqual([])
    expect(Object.keys(unlinked.geometry.connections)).toHaveLength(0)
  })

  it("no-ops adjacency for a self-edge or a missing zone", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a", { name: "A" })]),
    })

    expect(
      reduceInstance(state, {
        kind: "setZoneAdjacency",
        zoneIdA: "zone-a",
        zoneIdB: "zone-a",
        adjacent: true,
      })
    ).toBe(state)

    expect(
      reduceInstance(state, {
        kind: "setZoneAdjacency",
        zoneIdA: "zone-a",
        zoneIdB: "ghost",
        adjacent: true,
      })
    ).toBe(state)
  })

  it("renames a zone, and no-ops on an unknown id", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a", { name: "Old" })]),
    })

    const renamed = reduceInstance(state, {
      kind: "renameZone",
      zoneId: "zone-a",
      name: "New",
    })
    expect(renamed.geometry.zones["zone-a"]!.name).toBe("New")

    expect(
      reduceInstance(state, { kind: "renameZone", zoneId: "ghost", name: "x" })
    ).toBe(state)
  })
})

describe("reduceMapInstance — reveal overlay", () => {
  const mapWithHidden = () =>
    makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("zone-a", { name: "A" }), makeZone("zone-b", { name: "B" })],
        [
          makeConnection("conn-ab", "zone-a", "zone-b", {
            hidden: true,
            locked: true,
          }),
        ]
      ),
    })

  it("revealZone adds the zone, idempotently, and no-ops on an unknown id", () => {
    const once = reduceInstance(mapWithHidden(), {
      kind: "revealZone",
      zoneId: "zone-a",
    })
    expect(once.reveal.revealedZoneIds).toEqual(["zone-a"])

    const twice = reduceInstance(once, { kind: "revealZone", zoneId: "zone-a" })
    expect(twice.reveal.revealedZoneIds).toEqual(["zone-a"])

    const state = mapWithHidden()
    const ghost = reduceInstance(state, { kind: "revealZone", zoneId: "ghost" })
    expect(ghost).toBe(state)
    expect(ghost.reveal.revealedZoneIds).toEqual([])
  })

  it("hideZone removes a revealed zone and no-ops when absent", () => {
    const revealed = reduceInstance(mapWithHidden(), {
      kind: "revealZone",
      zoneId: "zone-a",
    })
    const hidden = reduceInstance(revealed, {
      kind: "hideZone",
      zoneId: "zone-a",
    })
    expect(hidden.reveal.revealedZoneIds).toEqual([])

    const state = mapWithHidden()
    expect(reduceInstance(state, { kind: "hideZone", zoneId: "zone-a" })).toBe(
      state
    )
  })

  it("revealConnection surfaces a hidden connection, idempotently, no-op on unknown", () => {
    const next = reduceInstance(mapWithHidden(), {
      kind: "revealConnection",
      connectionId: "conn-ab",
    })
    expect(next.reveal.revealedConnectionIds).toEqual(["conn-ab"])

    const ghost = reduceInstance(mapWithHidden(), {
      kind: "revealConnection",
      connectionId: "ghost",
    })
    expect(ghost.reveal.revealedConnectionIds).toEqual([])
  })

  it("hideConnection removes a revealed connection", () => {
    const revealed = reduceInstance(mapWithHidden(), {
      kind: "revealConnection",
      connectionId: "conn-ab",
    })
    const hidden = reduceInstance(revealed, {
      kind: "hideConnection",
      connectionId: "conn-ab",
    })
    expect(hidden.reveal.revealedConnectionIds).toEqual([])
  })

  it("unlockConnection opens a locked connection, idempotently, no-op on unknown", () => {
    const next = reduceInstance(mapWithHidden(), {
      kind: "unlockConnection",
      connectionId: "conn-ab",
    })
    expect(next.reveal.unlockedConnectionIds).toEqual(["conn-ab"])

    const ghost = reduceInstance(mapWithHidden(), {
      kind: "unlockConnection",
      connectionId: "ghost",
    })
    expect(ghost.reveal.unlockedConnectionIds).toEqual([])
  })

  it("lockConnection re-bars an unlocked connection", () => {
    const unlocked = reduceInstance(mapWithHidden(), {
      kind: "unlockConnection",
      connectionId: "conn-ab",
    })
    const locked = reduceInstance(unlocked, {
      kind: "lockConnection",
      connectionId: "conn-ab",
    })
    expect(locked.reveal.unlockedConnectionIds).toEqual([])
  })
})

describe("reduceMapInstance — editGeometry (delegation)", () => {
  const edit = (event: MapGeometryEvent) =>
    ({ kind: "editGeometry", event }) as const

  const base = () => makeMapInstanceState(twoZones())

  const parityCases: MapGeometryEvent[] = [
    { kind: "addZone", id: "zone-c", position: { x: 40, y: 80 } },
    { kind: "renameZone", zoneId: "zone-a", name: "Atrium" },
    {
      kind: "setZoneText",
      zoneId: "zone-a",
      patch: { description: "A wide stone court.", dmNotes: "Trapdoor here." },
    },
    { kind: "moveZone", zoneId: "zone-b", position: { x: 200, y: 120 } },
    {
      kind: "addConnection",
      id: "conn-x",
      fromZoneId: "zone-a",
      toZoneId: "zone-c",
    },
    {
      kind: "setConnectionFlag",
      connectionId: "conn-ab",
      flag: "hidden",
      value: true,
    },
    { kind: "deleteConnection", connectionId: "conn-ab" },
  ]

  it.each(parityCases)(
    "applies $kind identically to reduceMapGeometry on the geometry slice",
    (event) => {
      const state = base()
      const next = reduceInstance(state, edit(event))

      expect(next.geometry).toEqual(reduceMapGeometry(state.geometry, event))
    }
  )

  it("leaves occupancy, engagement and the rest of the state untouched", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: free("zone-a") },
    })
    const next = reduceInstance(
      state,
      edit({ kind: "renameZone", zoneId: "zone-a", name: "Atrium" })
    )

    expect(next.occupancy).toEqual(state.occupancy)
  })

  it("is a no-op (same ref) when the inner edit is a no-op", () => {
    const state = base()

    const unknownRename = reduceInstance(
      state,
      edit({ kind: "renameZone", zoneId: "ghost", name: "Nowhere" })
    )
    expect(unknownRename).toBe(state)

    const emptyRename = reduceInstance(
      state,
      edit({ kind: "renameZone", zoneId: "zone-a", name: "   " })
    )
    expect(emptyRename).toBe(state)
  })
})

describe("reduceMapInstance — editGeometry (Instance-only cascades)", () => {
  const edit = (event: MapGeometryEvent) =>
    ({ kind: "editGeometry", event }) as const

  it("blocks deleting a Zone an occupancy token stands in (no-op)", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: free("zone-a") },
    })
    const next = reduceInstance(
      state,
      edit({ kind: "deleteZone", zoneId: "zone-a" })
    )

    expect(next).toBe(state)
  })

  it("deletes an unoccupied Zone and cascades its connections", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      occupancy: { c0: free("zone-b") },
    })
    const next = reduceInstance(
      state,
      edit({ kind: "deleteZone", zoneId: "zone-a" })
    )

    expect(next.geometry.zones["zone-a"]).toBeUndefined()
    expect(next.geometry.connections["conn-ab"]).toBeUndefined()
  })

  it("prunes the deleted Zone + its connections from the reveal overlay", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      reveal: {
        revealedZoneIds: ["zone-a", "zone-b"],
        revealedConnectionIds: ["conn-ab"],
        unlockedConnectionIds: ["conn-ab"],
      },
    })
    const next = reduceInstance(
      state,
      edit({ kind: "deleteZone", zoneId: "zone-a" })
    )

    expect(next.reveal.revealedZoneIds).toEqual(["zone-b"])
    expect(next.reveal.revealedConnectionIds).toEqual([])
    expect(next.reveal.unlockedConnectionIds).toEqual([])
  })

  it("clears the Enchantment when its Zone is deleted", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      enchantment: { zoneId: "zone-a", type: "toccata", forte: 1 },
    })
    const next = reduceInstance(
      state,
      edit({ kind: "deleteZone", zoneId: "zone-a" })
    )

    expect(next.enchantment).toBeNull()
  })

  it("keeps an Enchantment on a surviving Zone when another is deleted", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      enchantment: { zoneId: "zone-b", type: "toccata", forte: 2 },
    })
    const next = reduceInstance(
      state,
      edit({ kind: "deleteZone", zoneId: "zone-a" })
    )

    expect(next.enchantment).toEqual({
      zoneId: "zone-b",
      type: "toccata",
      forte: 2,
    })
  })

  it("prunes a deleted connection from the reveal overlay", () => {
    const state = makeMapInstanceState({
      ...twoZones(),
      reveal: {
        revealedZoneIds: ["zone-a", "zone-b"],
        revealedConnectionIds: ["conn-ab"],
        unlockedConnectionIds: ["conn-ab"],
      },
    })
    const next = reduceInstance(
      state,
      edit({ kind: "deleteConnection", connectionId: "conn-ab" })
    )

    expect(next.reveal.revealedConnectionIds).toEqual([])
    expect(next.reveal.unlockedConnectionIds).toEqual([])
    expect(next.reveal.revealedZoneIds).toEqual(["zone-a", "zone-b"])
  })
})
