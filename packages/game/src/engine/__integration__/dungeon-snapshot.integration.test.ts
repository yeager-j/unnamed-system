import { describe, expect, it } from "vitest"

import { makeDungeonState } from "@workspace/game/engine/__fixtures__/dungeon"
import {
  makeConnection,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game/engine/__fixtures__/encounter"
import { projectDungeonSnapshot } from "@workspace/game/engine/dungeon/player-snapshot"
import type { DungeonStatus } from "@workspace/game/foundation/dungeon/state"
import type {
  MapInstanceState,
  RevealState,
} from "@workspace/game/foundation/encounter/map-instance"

/**
 * The M3 **redaction release gate** (UNN-466; ADR — *Player view: redaction &
 * snapshot*). A regression here leaks DM-only content to the public fog view, so
 * — exactly like `player-snapshot.integration.test.ts` — every redaction is proven
 * by **structural absence**: the source is seeded with the private data (dmNotes,
 * an undiscovered Zone, a hidden connection) so the tests prove the projector
 * *drops* it, not that it never had it.
 */

const ROSTER = {
  "char-aria": { name: "Aria", portraitUrl: "https://cdn/aria.png" },
  "char-bran": { name: "Bran", portraitUrl: null },
}

const DUNGEON = {
  name: "The Sunless Vault",
  status: "active" as DungeonStatus,
  campaignShortId: "camp-1",
  version: 7,
  instanceVersion: 3,
}

function instanceWith(
  overrides: Partial<MapInstanceState>,
  reveal: Partial<RevealState> = {}
): MapInstanceState {
  return makeMapInstanceState({
    ...overrides,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
      ...reveal,
    },
  })
}

describe("projectDungeonSnapshot", () => {
  it("emits only revealed Zones, with the player-facing description and no dmNotes", () => {
    const instance = instanceWith(
      {
        geometry: makeGeometry([
          makeZone("z1", {
            name: "Antechamber",
            description: "A vaulted hall.",
            dmNotes: "trap on the third flagstone",
            position: { x: 10, y: 20 },
          }),
          makeZone("z2", { name: "Crypt", dmNotes: "the lich sleeps here" }),
        ]),
      },
      { revealedZoneIds: ["z1"] }
    )

    const { zones } = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER
    )

    expect(zones.map((z) => z.id)).toEqual(["z1"])
    expect(zones[0]).toEqual({
      id: "z1",
      name: "Antechamber",
      description: "A vaulted hall.",
      position: { x: 10, y: 20 },
      tokens: [],
      enemies: [],
    })
    expect(zones[0]).not.toHaveProperty("dmNotes")
    // The undiscovered Zone is absent entirely — proving the absence is redaction.
    expect(instance.geometry.zones.z2).toBeDefined()
  })

  it("places party tokens in their revealed Zone and drops tokens in unrevealed Zones", () => {
    const instance = instanceWith(
      {
        geometry: makeGeometry([
          makeZone("z1", { name: "Antechamber" }),
          makeZone("z2", { name: "Crypt" }),
        ]),
        occupancy: {
          "char-aria": { zoneId: "z1", engagement: { status: "free" } },
          "char-bran": { zoneId: "z2", engagement: { status: "free" } },
        },
      },
      { revealedZoneIds: ["z1"] }
    )

    const { zones } = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER
    )

    expect(zones[0]!.tokens).toEqual([
      {
        characterId: "char-aria",
        name: "Aria",
        portraitUrl: "https://cdn/aria.png",
        engagement: { status: "free" },
      },
    ])
    // char-bran stands in the unrevealed z2 — its token must not leak.
    const allTokens = zones.flatMap((z) => z.tokens)
    expect(allTokens.map((t) => t.characterId)).toEqual(["char-aria"])
  })

  it("drops enemy tokens (non-roster occupants) from the fog map during combat", () => {
    const instance = instanceWith(
      {
        geometry: makeGeometry([makeZone("z1", { name: "Antechamber" })]),
        occupancy: {
          "char-aria": { zoneId: "z1", engagement: { status: "free" } },
          // An enemy combatant on the shared Instance — its id isn't a roster
          // character, so it must not surface as an "Unknown" chip.
          "combatant-goblin": { zoneId: "z1", engagement: { status: "free" } },
        },
      },
      { revealedZoneIds: ["z1"] }
    )

    const { zones } = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER
    )

    expect(zones[0]!.tokens.map((t) => t.characterId)).toEqual(["char-aria"])
    expect(JSON.stringify(zones)).not.toContain("Unknown")
  })

  it("places redacted enemy tokens in revealed Zones during combat and drops them in unrevealed Zones", () => {
    const instance = instanceWith(
      {
        geometry: makeGeometry([
          makeZone("z1", { name: "Antechamber" }),
          makeZone("z2", { name: "Crypt" }),
        ]),
      },
      { revealedZoneIds: ["z1"] }
    )

    // Two enemies grouped by Zone (as the loader's combatEnemyTokensByZone yields):
    // one in the revealed z1, one in the unrevealed z2 (must not leak).
    const enemyTokensByZone = {
      z1: [{ id: "e-goblin", name: "Goblin", hp: { current: 12, max: 16 } }],
      z2: [{ id: "e-lich", name: "Lich", hp: { current: 80, max: 80 } }],
    }

    const { zones } = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER,
      { encounterShortId: "enc-1", round: 1, currentActorName: null },
      enemyTokensByZone
    )

    // Only the revealed Zone's enemy surfaces, carrying HP only (no attributes /
    // affinities keys exist on the shape — the redaction is structural).
    expect(zones.map((z) => z.id)).toEqual(["z1"])
    expect(zones[0]!.enemies).toEqual([
      { id: "e-goblin", name: "Goblin", hp: { current: 12, max: 16 } },
    ])
    // The enemy in the undiscovered Zone never crosses the wire.
    expect(JSON.stringify(zones)).not.toContain("Lich")
    expect(JSON.stringify(zones)).not.toContain("affinit")
  })

  it("emits a revealed connection (both endpoints revealed) with its lock state", () => {
    const instance = instanceWith(
      {
        geometry: makeGeometry(
          [makeZone("z1"), makeZone("z2")],
          [makeConnection("c1", "z1", "z2", { locked: true })]
        ),
      },
      { revealedZoneIds: ["z1", "z2"] }
    )

    const { connections, exits } = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER
    )

    expect(connections).toEqual([
      { id: "c1", fromZoneId: "z1", toZoneId: "z2", locked: true },
    ])
    expect(exits).toEqual([])
  })

  it("emits a known-exit silhouette exposing only the revealed endpoint + locked", () => {
    const instance = instanceWith(
      {
        geometry: makeGeometry(
          [
            makeZone("z1", { name: "Antechamber" }),
            makeZone("z2", { name: "Crypt", dmNotes: "secret" }),
          ],
          [makeConnection("c1", "z1", "z2", { locked: true })]
        ),
      },
      { revealedZoneIds: ["z1"] }
    )

    const { zones, connections, exits } = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER
    )

    expect(connections).toEqual([])
    expect(exits).toEqual([{ id: "c1", zoneId: "z1", locked: true }])
    // The silhouette leaks nothing about the far Zone: no toZoneId/far id key,
    // and z2 never appears in the revealed zone list.
    expect(exits[0]).not.toHaveProperty("toZoneId")
    expect(JSON.stringify(exits[0])).not.toContain("z2")
    expect(zones.map((z) => z.id)).toEqual(["z1"])
  })

  it("strips a hidden connection the DM has not revealed from both lists", () => {
    const instance = instanceWith(
      {
        geometry: makeGeometry(
          [makeZone("z1"), makeZone("z2")],
          [makeConnection("c1", "z1", "z2", { hidden: true })]
        ),
      },
      // z1 revealed; the connection is hidden and not in revealedConnectionIds.
      { revealedZoneIds: ["z1"] }
    )

    const { connections, exits } = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER
    )

    expect(connections).toEqual([])
    expect(exits).toEqual([])
  })

  it("passes through status, name, campaignShortId, both versions, and the turn counter", () => {
    const instance = instanceWith(
      { geometry: makeGeometry([makeZone("z1")]) },
      {
        revealedZoneIds: ["z1"],
      }
    )

    const snapshot = projectDungeonSnapshot(
      { ...DUNGEON, status: "done" },
      instance,
      makeDungeonState({ turnCounter: 12 }),
      ROSTER
    )

    expect(snapshot).toMatchObject({
      status: "done",
      name: "The Sunless Vault",
      campaignShortId: "camp-1",
      version: 7,
      instanceVersion: 3,
      turn: 12,
    })
  })

  it("omits the combat linkage in exploration and carries it through during combat", () => {
    const instance = instanceWith(
      { geometry: makeGeometry([makeZone("z1")]) },
      { revealedZoneIds: ["z1"] }
    )

    // Exploration: no combat overlay at all (the fog view stays in its map mode).
    const exploring = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER
    )
    expect(exploring).not.toHaveProperty("combat")

    // Combat: the public encounter linkage is passed through verbatim — and it
    // carries no enemy data (only the public shortId / round / actor name).
    const combat = {
      encounterShortId: "enc-1",
      round: 2,
      currentActorName: "Aria",
    }
    const fighting = projectDungeonSnapshot(
      DUNGEON,
      instance,
      makeDungeonState(),
      ROSTER,
      combat
    )
    expect(fighting.combat).toEqual(combat)
  })
})
