import {
  connectionFogState,
  isConnectionLocked,
  isZoneRevealed,
} from "@workspace/game/engine/encounter/resolve-reveal"
import type {
  DungeonState,
  DungeonStatus,
} from "@workspace/game/foundation/dungeon/state"
import type { MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"

/**
 * The **dungeon fog player view's** wire payload (UNN-466) and its server-side
 * **redaction model** — the exploration peer of the encounter watch's
 * {@link import("../encounter/player-snapshot").projectPlayerSnapshot}. A pure
 * projection of a live delve (a {@link MapInstanceState} + its {@link DungeonState})
 * down to exactly what a signed-out spectator may see: the revealed portion of the
 * map, the party tokens, and the current dungeon turn.
 *
 * **Redaction is structural** — a stripped element is never *written*, so it is
 * absent from the JSON a player's browser receives (not present as `null`). It
 * strips per element into the PRD's three states (ADR — *Player view: redaction &
 * snapshot*), composing the shipped {@link connectionFogState}/{@link isZoneRevealed}
 * fog primitives:
 *
 * - **Fully revealed Zone** → {@link DungeonSnapshotZone} (name, player-facing
 *   description, position, party tokens). The private `dmNotes` is never read.
 * - **Known-exit silhouette** → {@link DungeonSnapshotExit}: *that* an exit leaves
 *   a revealed Zone and *whether it's locked* — nothing more. The far (undiscovered)
 *   Zone's id/name/position never cross the wire.
 * - **Stripped** → undiscovered Zones, unrevealed hidden connections, and DM notes
 *   are absent from the payload entirely.
 *
 * The redaction is a **release gate** (a regression leaks DM-only content to the
 * public view), proven by `dungeon-snapshot.integration.test.ts`. In exploration the
 * occupancy holds PC tokens only, so no enemy data of any kind enters this payload;
 * combat composition (and its enemy redaction) is M4.
 */

/** One party-member token as a player sees it — display data only, resolved from
 *  the delve roster. Keyed (in {@link DungeonSnapshotZone.tokens}) by the placed
 *  character's `characterId`, so the client can self-highlight the viewer's own. */
export interface DungeonSnapshotToken {
  characterId: string
  name: string
  portraitUrl: string | null
}

/** A **revealed** Zone. Carries its player-facing `description` (shown on reveal)
 *  and its own `position` for the canvas — never the private `dmNotes`. */
export interface DungeonSnapshotZone {
  id: string
  name: string
  description: string
  position: { x: number; y: number }
  tokens: DungeonSnapshotToken[]
}

/** A connection both of whose endpoints are revealed — drawn as a full edge. */
export interface DungeonSnapshotConnection {
  id: string
  fromZoneId: string
  toZoneId: string
  locked: boolean
}

/** A **known-exit silhouette**: an exit out of a revealed Zone whose far endpoint
 *  is still undiscovered. Exposes only the revealed endpoint (`zoneId`) and whether
 *  it's locked — the far Zone's id is deliberately absent (it is stripped). */
export interface DungeonSnapshotExit {
  id: string
  zoneId: string
  locked: boolean
}

/**
 * The full redacted snapshot the fog player view and its polling hook consume.
 * Thin and JSON-serializable end to end. `turn` is the dungeon turn counter —
 * exploration surfaces only the counter, never the turn queue or acted-flags
 * (those stay DM-only).
 */
export interface DungeonSnapshot {
  status: DungeonStatus
  name: string
  /** The owning campaign's public `shortId`, for the view's back link. */
  campaignShortId: string
  /** The dungeon row's optimistic version token at projection time — the
   *  subscription hook compares it to decide whether a refetch is needed. */
  version: number
  /** The Map Instance row's version token (UNN-468). Reveal-state and occupancy
   *  live on the Instance, bumped independently of the dungeon row (a Zone reveal
   *  or token move bumps only this), so the fog view tracks **both** versions and
   *  refetches when either advances. */
  instanceVersion: number
  turn: number
  zones: DungeonSnapshotZone[]
  connections: DungeonSnapshotConnection[]
  exits: DungeonSnapshotExit[]
}

/** The revealed Zone's id from a connection one of whose endpoints is revealed —
 *  the silhouette's surfaced endpoint. */
function revealedEndpoint(
  instance: MapInstanceState,
  fromZoneId: string,
  toZoneId: string
): string {
  return isZoneRevealed(instance.reveal, fromZoneId) ? fromZoneId : toZoneId
}

/** The party tokens standing in each **revealed** Zone, keyed by Zone id — a token
 *  in an unrevealed Zone is dropped so it can't leak. */
function tokensByRevealedZone(
  instance: MapInstanceState,
  roster: Record<string, { name: string; portraitUrl: string | null }>
): Record<string, DungeonSnapshotToken[]> {
  const byZone: Record<string, DungeonSnapshotToken[]> = {}
  for (const [characterId, token] of Object.entries(instance.occupancy)) {
    if (!isZoneRevealed(instance.reveal, token.zoneId)) continue
    ;(byZone[token.zoneId] ??= []).push({
      characterId,
      name: roster[characterId]?.name ?? "Unknown",
      portraitUrl: roster[characterId]?.portraitUrl ?? null,
    })
  }
  return byZone
}

/**
 * Projects a live delve to its {@link DungeonSnapshot}. Pure: the impure shell
 * ({@link import("@/lib/db/queries/load-dungeon-snapshot").getDungeonSnapshot})
 * loads the dungeon + Map Instance rows and the campaign's placed-character roster
 * before calling this. The redaction lives here, so it is unconditional and
 * server-side — see the module doc.
 */
export function projectDungeonSnapshot(
  dungeon: {
    name: string
    status: DungeonStatus
    campaignShortId: string
    version: number
    /** The Map Instance row's version (UNN-468) — passed alongside the dungeon
     *  version so the snapshot exposes both halves of its composite token. */
    instanceVersion: number
  },
  instance: MapInstanceState,
  state: DungeonState,
  roster: Record<string, { name: string; portraitUrl: string | null }>
): DungeonSnapshot {
  const tokensByZone = tokensByRevealedZone(instance, roster)

  const zones: DungeonSnapshotZone[] = Object.values(instance.geometry.zones)
    .filter((zone) => isZoneRevealed(instance.reveal, zone.id))
    .map((zone) => ({
      id: zone.id,
      name: zone.name,
      description: zone.description,
      position: zone.position,
      tokens: tokensByZone[zone.id] ?? [],
    }))

  const connections: DungeonSnapshotConnection[] = []
  const exits: DungeonSnapshotExit[] = []
  for (const connection of Object.values(instance.geometry.connections)) {
    const fog = connectionFogState(connection, instance.reveal)
    if (fog === "stripped") continue
    if (fog === "revealed") {
      connections.push({
        id: connection.id,
        fromZoneId: connection.fromZoneId,
        toZoneId: connection.toZoneId,
        locked: isConnectionLocked(connection, instance.reveal),
      })
    } else {
      exits.push({
        id: connection.id,
        zoneId: revealedEndpoint(
          instance,
          connection.fromZoneId,
          connection.toZoneId
        ),
        locked: isConnectionLocked(connection, instance.reveal),
      })
    }
  }

  return {
    status: dungeon.status,
    name: dungeon.name,
    campaignShortId: dungeon.campaignShortId,
    version: dungeon.version,
    instanceVersion: dungeon.instanceVersion,
    turn: state.turnCounter,
    zones,
    connections,
    exits,
  }
}
