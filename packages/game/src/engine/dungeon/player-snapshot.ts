import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { combatantName } from "@workspace/game/engine/encounter/console-view"
import {
  connectionFogState,
  isConnectionLocked,
  isZoneRevealed,
} from "@workspace/game/engine/encounter/resolve-reveal"
import {
  enemyHp,
  type Pool,
} from "@workspace/game/engine/encounter/roster-view"
import type {
  DungeonState,
  DungeonStatus,
} from "@workspace/game/foundation/dungeon/state"
import type { MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import type { CombatSession } from "@workspace/game/foundation/encounter/session"

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

/** An **enemy** token a player sees on the battlefield during combat — the
 *  combat-watch redaction (UNN-324) carried onto the fog map: name + current/max
 *  HP, and **never** attributes or affinities (they are not on this shape, so they
 *  can't leak). Keyed by the encounter `combatant.id`. */
export interface DungeonSnapshotEnemyToken {
  id: string
  name: string
  hp: Pool
}

/** A **revealed** Zone. Carries its player-facing `description` (shown on reveal)
 *  and its own `position` for the canvas — never the private `dmNotes`. `enemies`
 *  is populated only while a fight runs on the delve (empty in exploration). */
export interface DungeonSnapshotZone {
  id: string
  name: string
  description: string
  position: { x: number; y: number }
  tokens: DungeonSnapshotToken[]
  enemies: DungeonSnapshotEnemyToken[]
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

/** The live-combat overlay while a fight runs on the delve (UNN-467) — present in
 *  the snapshot only during combat (absent in pure exploration). All three values
 *  are player-observable (the encounter's public `shortId`, its round, the acting
 *  combatant's name), so it carries no redacted data. The fog view uses
 *  `encounterShortId` to dual-subscribe to the live encounter channel + load the
 *  viewer's own-character sheet column, and shows "Combat — Round N · {actor}". */
export interface DungeonCombatLink {
  encounterShortId: string
  round: number
  currentActorName: string | null
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
  /** Present only while a fight runs on this delve (UNN-467, M4) — the fog view
   *  composes the encounter watch's own-sheet column + a "Combat — Round N" signal
   *  when set, and dual-subscribes to the encounter channel. Absent in exploration. */
  combat?: DungeonCombatLink
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

/** The party tokens standing in each **revealed** Zone, keyed by Zone id. Two
 *  filters: a token in an unrevealed Zone is dropped so it can't leak, and a token
 *  whose occupant isn't a delve-roster character is dropped — during combat the
 *  shared Instance also carries **enemy** tokens (keyed by combatant id, absent
 *  from the roster), which must not surface on the fog map as mystery "Unknown"
 *  chips (the fog battlefield is party-only; enemy redaction is the encounter
 *  watch's concern, not the dungeon view's). */
function tokensByRevealedZone(
  instance: MapInstanceState,
  roster: Record<string, { name: string; portraitUrl: string | null }>
): Record<string, DungeonSnapshotToken[]> {
  const byZone: Record<string, DungeonSnapshotToken[]> = {}
  for (const [characterId, token] of Object.entries(instance.occupancy)) {
    if (!isZoneRevealed(instance.reveal, token.zoneId)) continue
    const entry = roster[characterId]
    if (!entry) continue
    ;(byZone[token.zoneId] ??= []).push({
      characterId,
      name: entry.name,
      portraitUrl: entry.portraitUrl,
    })
  }
  return byZone
}

/**
 * The **enemy** tokens of a live encounter on this delve, grouped by their Instance
 * Zone (UNN-467) — the combat-watch enemy redaction (HP only; no attributes /
 * affinities) carried onto the fog battlefield. Pure; the impure loader resolves
 * `enemyStatblockById` (catalog HP defaults) before calling. The projector places
 * these only into **revealed** Zones, so an enemy in an undiscovered Zone never
 * leaks. PC combatants are excluded — those render from the delve roster as party
 * tokens (a charmed PC on the enemies side is still a party token).
 */
export function combatEnemyTokensByZone(
  session: CombatSession,
  instance: MapInstanceState,
  enemyStatblockById: Record<string, Statblock>
): Record<string, DungeonSnapshotEnemyToken[]> {
  const byZone: Record<string, DungeonSnapshotEnemyToken[]> = {}
  for (const combatant of session.combatants) {
    if (combatant.ref.kind === "pc") continue
    const zoneId = instance.occupancy[combatant.id]?.zoneId ?? ""
    ;(byZone[zoneId] ??= []).push({
      id: combatant.id,
      name: combatantName(combatant, {}, enemyStatblockById),
      hp: enemyHp(combatant, enemyStatblockById),
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
  roster: Record<string, { name: string; portraitUrl: string | null }>,
  /** The live-combat overlay (UNN-467) — the impure loader derives it from the
   *  delve's live encounter (if any) and passes it through; `undefined` in
   *  exploration. Public data only (see {@link DungeonCombatLink}). */
  combat?: DungeonCombatLink,
  /** Redacted enemy tokens grouped by Zone (UNN-467) — only populated during
   *  combat (from {@link combatEnemyTokensByZone}); attached to **revealed** Zones
   *  only, so an enemy in an undiscovered Zone never crosses the wire. */
  enemyTokensByZone: Record<string, DungeonSnapshotEnemyToken[]> = {}
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
      enemies: enemyTokensByZone[zone.id] ?? [],
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
    ...(combat ? { combat } : {}),
  }
}
