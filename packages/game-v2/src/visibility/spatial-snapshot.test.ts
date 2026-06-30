import { describe, expect, it } from "vitest"

import {
  participantWith,
  sessionOf,
} from "@workspace/game-v2/encounter/__fixtures__/session"
import type {
  ParticipantView,
  ResolvedSession,
} from "@workspace/game-v2/encounter/participant-view"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  free,
  makeConnection,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { makeParticipantView, spectator } from "./__fixtures__/redaction"
import type { EncounterSnapshotMeta } from "./snapshot"
import {
  projectDungeonSnapshot,
  projectSpatialEncounterSnapshot,
  type DungeonRosterEntry,
  type DungeonSnapshotMeta,
} from "./spatial-snapshot"

const META: EncounterSnapshotMeta = {
  status: "live",
  name: "Delve Fight",
  campaignShortId: "camp1",
  version: 3,
}

const pid = asParticipantId

const viewOf = (entries: Array<[string, ParticipantView]>): ResolvedSession =>
  new Map(entries.map(([id, view]) => [pid(id), view]))

// z1 revealed, z2 unrevealed; p1 stands in z1, p2 in z2.
const session = sessionOf([
  participantWith({ id: "p1", side: "players" }),
  participantWith({ id: "p2", side: "enemies" }),
])
const view = viewOf([
  [
    "p1",
    makeParticipantView({
      id: "p1-e",
      components: { position: { zoneId: "z1" } },
    }),
  ],
  [
    "p2",
    makeParticipantView({
      id: "p2-e",
      side: "enemies",
      components: { position: { zoneId: "z2" } },
    }),
  ],
])

const delveInstance = makeMapInstanceState({
  geometry: makeGeometry(
    [makeZone("z1", { dmNotes: "trap here" }), makeZone("z2")],
    [makeConnection("c1", "z1", "z2")]
  ),
  occupancy: { p1: free("z1"), p2: free("z2") },
  enchantment: { zoneId: "z2", type: "toccata", forte: 1 },
  reveal: {
    revealedZoneIds: ["z1"],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  },
})

describe("projectSpatialEncounterSnapshot — composes over the envelope (SD10)", () => {
  it("passes the instanceVersion through alongside the combat fields", () => {
    const snap = projectSpatialEncounterSnapshot(
      session,
      view,
      spectator(),
      META,
      delveInstance,
      7
    )
    expect(snap.version).toBe(3)
    expect(snap.instanceVersion).toBe(7)
    expect(snap.round).toBe(session.round)
  })

  it("under fog: drops unrevealed zones and projects MapZone → { id, name }", () => {
    const snap = projectSpatialEncounterSnapshot(
      session,
      view,
      spectator(),
      META,
      delveInstance,
      7
    )
    expect(snap.zones).toEqual([{ id: "z1", name: "z1" }])
  })

  it("under fog: blanks zoneId for a combatant in an unrevealed zone (RED-9c)", () => {
    const snap = projectSpatialEncounterSnapshot(
      session,
      view,
      spectator(),
      META,
      delveInstance,
      7
    )
    const byId = new Map(snap.combatants.map((c) => [c.id, c]))
    expect(byId.get(pid("p1"))!.components.position).toEqual({ zoneId: "z1" })
    expect(byId.get(pid("p2"))!.components.position).toEqual({ zoneId: "" })
  })

  it("under fog: withholds an enchantment whose zone is unrevealed", () => {
    const snap = projectSpatialEncounterSnapshot(
      session,
      view,
      spectator(),
      META,
      delveInstance,
      7
    )
    expect(snap.enchantment).toBeUndefined()
  })

  it("under fog: surfaces a known-exit silhouette (far zone stripped)", () => {
    const snap = projectSpatialEncounterSnapshot(
      session,
      view,
      spectator(),
      META,
      delveInstance,
      7
    )
    expect(snap.connections).toEqual([])
    expect(snap.exits).toEqual([{ id: "c1", zoneId: "z1", locked: false }])
  })

  it("standalone (no reveal): shows the full map and leaves zoneIds untouched", () => {
    const standalone = makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("z1"), makeZone("z2")],
        [makeConnection("c1", "z1", "z2")]
      ),
      occupancy: { p1: free("z1"), p2: free("z2") },
    })
    const snap = projectSpatialEncounterSnapshot(
      session,
      view,
      spectator(),
      META,
      standalone,
      1
    )
    expect(snap.zones).toEqual([
      { id: "z1", name: "z1" },
      { id: "z2", name: "z2" },
    ])
    expect(snap.exits).toEqual([])
    const byId = new Map(snap.combatants.map((c) => [c.id, c]))
    expect(byId.get(pid("p2"))!.components.position).toEqual({ zoneId: "z2" })
  })
})

describe("projectDungeonSnapshot — the exploration-only sibling", () => {
  const DUNGEON_META: DungeonSnapshotMeta = {
    name: "The Crypt",
    status: "active",
    campaignShortId: "camp1",
    version: 2,
    instanceVersion: 5,
  }

  const roster: Record<string, DungeonRosterEntry> = {
    iris: {
      name: "Iris",
      portraitUrl: "https://img/iris.png",
      hp: { current: 18, max: 24 },
      sp: { current: 4, max: 6 },
    },
  }

  const mapInstance = makeMapInstanceState({
    geometry: makeGeometry(
      [
        makeZone("z1", { description: "A dank hall", dmNotes: "ambush" }),
        makeZone("z2"),
      ],
      [makeConnection("c1", "z1", "z2")]
    ),
    occupancy: { iris: free("z1") },
    enchantment: { zoneId: "z1", type: "requiem", forte: 2 },
    reveal: {
      revealedZoneIds: ["z1"],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
  })

  it("emits only revealed zones, with party tokens + enchantment, no dmNotes", () => {
    const snap = projectDungeonSnapshot(
      DUNGEON_META,
      mapInstance,
      {
        turnCounter: 3,
        actedCharacterIds: [],
        reminderSettings: {
          randomEncounters: { enabled: false, intervalTurns: 6 },
        },
      },
      roster
    )
    expect(snap.turn).toBe(3)
    expect(snap.instanceVersion).toBe(5)
    expect(snap.zones).toHaveLength(1)
    const zone = snap.zones[0]!
    expect(zone).not.toHaveProperty("dmNotes")
    expect(zone.description).toBe("A dank hall")
    expect(zone.enchantment).toEqual({
      zoneId: "z1",
      type: "requiem",
      forte: 2,
    })
    expect(zone.tokens).toEqual([
      {
        characterId: "iris",
        name: "Iris",
        portraitUrl: "https://img/iris.png",
        hp: { current: 18, max: 24 },
        sp: { current: 4, max: 6 },
        engagement: { status: "free" },
      },
    ])
  })

  it("silhouettes the exit to the undiscovered zone (far zone absent)", () => {
    const snap = projectDungeonSnapshot(
      DUNGEON_META,
      mapInstance,
      {
        turnCounter: 0,
        actedCharacterIds: [],
        reminderSettings: {
          randomEncounters: { enabled: false, intervalTurns: 6 },
        },
      },
      roster
    )
    expect(snap.connections).toEqual([])
    expect(snap.exits).toEqual([{ id: "c1", zoneId: "z1", locked: false }])
  })
})
