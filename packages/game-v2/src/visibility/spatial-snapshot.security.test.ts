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
import { isFogActive } from "@workspace/game-v2/spatial/reveal"

import { makeParticipantView, spectator } from "./__fixtures__/redaction"
import type { EncounterSnapshotMeta } from "./snapshot"
import {
  projectDungeonSnapshot,
  projectSpatialEncounterSnapshot,
  type DungeonRosterEntry,
  type DungeonSnapshotMeta,
} from "./spatial-snapshot"

/**
 * RELEASE GATE (security-critical, D14). The fog player snapshots are
 * signed-out-visible: DM-only geography (`dmNotes`, undiscovered Zones, the far side
 * of a known exit) and an unseen combatant's Zone must be **structurally absent** from
 * the wire — not present-as-`null`. Seeds are deliberately populated WITH the secrets
 * so the tests prove they are *stripped*, not merely never set, and assert against the
 * serialized payload (`JSON.stringify`) — the exact bytes a browser receives.
 */

const pid = asParticipantId
const SECRET_ZONE_NAME = "Lich's Sanctum"
const SECRET_NOTE = "the lich waits behind the throne"
const SECRET_PAGE_ID = "page-secret"
const SECRET_PAGE_NAME = "Sanctum Level"

const META: EncounterSnapshotMeta = {
  status: "live",
  name: "Ambush",
  campaignShortId: "camp1",
  version: 1,
}

const viewOf = (entries: Array<[string, ParticipantView]>): ResolvedSession =>
  new Map(entries.map(([id, view]) => [pid(id), view]))

// z1 revealed; z-secret unrevealed (holds dmNotes + a hidden name + an enemy),
// alone on an unrevealed second page (UNN-586: the page must never serialize).
const fogInstance = makeMapInstanceState({
  geometry: makeGeometry(
    [
      makeZone("z1", { name: "Entry", dmNotes: "safe" }),
      makeZone("z-secret", {
        name: SECRET_ZONE_NAME,
        dmNotes: SECRET_NOTE,
        pageId: SECRET_PAGE_ID,
      }),
    ],
    [makeConnection("c1", "z1", "z-secret")],
    [
      { id: "default", name: "Page 1" },
      { id: SECRET_PAGE_ID, name: SECRET_PAGE_NAME },
    ]
  ),
  occupancy: { hero: free("z1"), lich: free("z-secret") },
  enchantment: { zoneId: "z-secret", type: "toccata", forte: 3 },
  reveal: {
    revealedZoneIds: ["z1"],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  },
})

describe("RELEASE GATE — combat fog snapshot strips DM-only geography (SD10/RED-9c)", () => {
  const session = sessionOf([
    participantWith({ id: "hero", side: "players" }),
    participantWith({ id: "lich", side: "enemies" }),
  ])
  const view = viewOf([
    [
      "hero",
      makeParticipantView({
        id: "hero-e",
        components: { position: { zoneId: "z1" } },
      }),
    ],
    [
      "lich",
      makeParticipantView({
        id: "lich-e",
        side: "enemies",
        components: { position: { zoneId: "z-secret" } },
      }),
    ],
  ])

  const snap = projectSpatialEncounterSnapshot(
    session,
    view,
    spectator(),
    META,
    fogInstance,
    1,
    isFogActive(fogInstance.reveal)
  )
  const wire = JSON.stringify(snap)

  it("never serializes the unrevealed zone's name or dmNotes", () => {
    expect(wire).not.toContain(SECRET_ZONE_NAME)
    expect(wire).not.toContain(SECRET_NOTE)
    expect(wire).not.toContain("z-secret")
  })

  it("emits revealed zones as { id, name } only — no dmNotes/position", () => {
    expect(snap.zones).toEqual([{ id: "z1", name: "Entry" }])
    expect(snap.zones[0]).not.toHaveProperty("dmNotes")
    expect(snap.zones[0]).not.toHaveProperty("position")
  })

  it("blanks (does not drop) the unseen combatant's zoneId — structural, not null", () => {
    const lich = snap.combatants.find((c) => c.id === pid("lich"))!
    expect("position" in lich.components).toBe(true)
    expect(lich.components.position).toEqual({ zoneId: "" })
    expect(lich.components.position).not.toBeNull()
  })

  it("withholds an enchantment sitting on an unrevealed zone", () => {
    expect(snap.enchantment).toBeUndefined()
    expect("enchantment" in snap).toBe(false)
  })

  it("silhouettes the exit without the far zone id", () => {
    expect(snap.exits).toEqual([
      { id: "c1", zoneId: "z1", locked: false, side: "n", offset: 0.5 },
    ])
    expect(snap.exits[0]).not.toHaveProperty("toZoneId")
  })

  it("serializes an exit with exactly {id, zoneId, locked, side, offset} — no more (AC 3)", () => {
    const exitSnap = projectSpatialEncounterSnapshot(
      session,
      view,
      spectator(),
      META,
      fogInstance,
      1,
      isFogActive(fogInstance.reveal),
      { c1: { side: "e", offset: 0.3 } }
    )
    expect(exitSnap.exits[0]).toEqual({
      id: "c1",
      zoneId: "z1",
      locked: false,
      side: "e",
      offset: 0.3,
    })
    expect(Object.keys(exitSnap.exits[0]!).sort()).toEqual([
      "id",
      "locked",
      "offset",
      "side",
      "zoneId",
    ])
  })
})

describe("RELEASE GATE — dungeon snapshot strips DM-only content", () => {
  const DUNGEON_META: DungeonSnapshotMeta = {
    name: "Crypt",
    status: "active",
    campaignShortId: "camp1",
    version: 1,
    instanceVersion: 1,
  }
  const roster: Record<string, DungeonRosterEntry> = {
    hero: {
      name: "Hero",
      portraitUrl: null,
      hp: { current: 10, max: 10 },
      sp: { current: 2, max: 2 },
    },
  }

  const snap = projectDungeonSnapshot(
    DUNGEON_META,
    fogInstance,
    {
      turnCounter: 1,
      actedCharacterIds: [],
      reminderSettings: {
        randomEncounters: { enabled: false, intervalTurns: 6 },
      },
    },
    roster
  )
  const wire = JSON.stringify(snap)

  it("never serializes the undiscovered zone, its dmNotes, or the enemy occupant", () => {
    expect(wire).not.toContain(SECRET_ZONE_NAME)
    expect(wire).not.toContain(SECRET_NOTE)
    expect(wire).not.toContain("z-secret")
    // the enemy 'lich' token is in an unrevealed zone AND not a roster character.
    expect(wire).not.toContain("lich")
  })

  it("emits only the revealed zone, no dmNotes", () => {
    expect(snap.zones.map((z) => z.id)).toEqual(["z1"])
    expect(snap.zones[0]).not.toHaveProperty("dmNotes")
  })

  it("silhouettes the exit, far zone absent", () => {
    expect(snap.exits).toEqual([
      { id: "c1", zoneId: "z1", locked: false, side: "n", offset: 0.5 },
    ])
    expect(snap.exits[0]).not.toHaveProperty("toZoneId")
  })

  it("never serializes an unrevealed page's id or name (UNN-586)", () => {
    expect(wire).not.toContain(SECRET_PAGE_ID)
    expect(wire).not.toContain(SECRET_PAGE_NAME)
    expect(snap.pages).toEqual([{ id: "default", name: "Page 1" }])
  })

  it("keeps following the party's page when the last mover is an enemy", () => {
    // Enemy participant moved last — its token exists but isn't in the roster,
    // so the hint falls back to the party's revealed page rather than yanking
    // the watch to a first-page default (and never the enemy's unrevealed page).
    const enemyMoved = projectDungeonSnapshot(
      DUNGEON_META,
      { ...fogInstance, lastMovedTokenKey: "lich" },
      {
        turnCounter: 1,
        actedCharacterIds: [],
        reminderSettings: {
          randomEncounters: { enabled: false, intervalTurns: 6 },
        },
      },
      roster
    )
    expect(enemyMoved.activePageId).toBe("default")
    // The raw token key never crosses either way.
    expect(JSON.stringify(enemyMoved)).not.toContain("lich")
  })

  it("omits the follow hint entirely when no roster member stands revealed", () => {
    const hidden = projectDungeonSnapshot(
      DUNGEON_META,
      {
        ...fogInstance,
        occupancy: { hero: free("z-secret"), lich: free("z-secret") },
        lastMovedTokenKey: "hero",
      },
      {
        turnCounter: 1,
        actedCharacterIds: [],
        reminderSettings: {
          randomEncounters: { enabled: false, intervalTurns: 6 },
        },
      },
      roster
    )
    expect(hidden.activePageId).toBeUndefined()
    expect("activePageId" in hidden).toBe(false)
    expect(JSON.stringify(hidden)).not.toContain(SECRET_PAGE_ID)
  })

  it("resolves the follow hint only through a roster token in a revealed zone", () => {
    const heroMoved = projectDungeonSnapshot(
      DUNGEON_META,
      { ...fogInstance, lastMovedTokenKey: "hero" },
      {
        turnCounter: 1,
        actedCharacterIds: [],
        reminderSettings: {
          randomEncounters: { enabled: false, intervalTurns: 6 },
        },
      },
      roster
    )
    expect(heroMoved.activePageId).toBe("default")

    // A dangling key with no roster tokens at all resolves to absent.
    const dangling = projectDungeonSnapshot(
      DUNGEON_META,
      { ...fogInstance, occupancy: {}, lastMovedTokenKey: "hero" },
      {
        turnCounter: 1,
        actedCharacterIds: [],
        reminderSettings: {
          randomEncounters: { enabled: false, intervalTurns: 6 },
        },
      },
      roster
    )
    expect(dangling.activePageId).toBeUndefined()
  })
})
