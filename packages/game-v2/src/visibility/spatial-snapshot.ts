import type { ResolvedSession } from "@workspace/game-v2/encounter/participant-view"
import type { Session } from "@workspace/game-v2/encounter/session"
import type { EnchantmentType } from "@workspace/game-v2/kernel/vocab/enchantment"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type {
  DungeonState,
  DungeonStatus,
} from "@workspace/game-v2/spatial/dungeon.schema"
import type {
  MapInstanceState,
  RevealState,
} from "@workspace/game-v2/spatial/map-instance.schema"
import {
  connectionFogState,
  isConnectionLocked,
  isConnectionSurfaced,
  isFogActive,
  isZoneRevealed,
} from "@workspace/game-v2/spatial/reveal"

import {
  projectEncounterSnapshot,
  type EncounterSnapshot,
  type EncounterSnapshotMeta,
  type VisibleCombatant,
} from "./snapshot"
import type { TrustedViewer } from "./trusted-viewer"

/**
 * The **spatial redaction tail** — the fog-clamping player projectors that **compose
 * over** the §2.6 combat envelope (spatial ADR §2.10; SD10 / CD12). They add spatial
 * fields and apply field-level + fog-gated transforms **after** the envelope produces
 * the combatant list — they **never edit** `projectEncounterSnapshot`. Two projectors:
 *
 * - {@link projectSpatialEncounterSnapshot} — the combat watch on a Map-Instance,
 *   wrapping the combat snapshot;
 * - {@link projectDungeonSnapshot} — the exploration-only sibling (no combat session).
 *
 * Both keep redaction **structural** (RED-4): a stripped field is **absent** on the
 * wire, never `null`. The "enemies on the fog map during a delve-combat" overlay is a
 * consumer (C3) composition that reuses *this* combat snapshot's already-redacted
 * combatants — there is no second enemy-redaction path here (single source, CD12).
 */

/** The revealed-zone silhouette a player sees — name only, never `dmNotes`/`position`. */
export interface SnapshotZone {
  id: string
  name: string
}

/** A connection both of whose endpoints are revealed — drawn as a full edge. */
export interface SnapshotConnection {
  id: string
  fromZoneId: string
  toZoneId: string
  locked: boolean
}

/**
 * A **known-exit silhouette**: an exit out of a revealed Zone whose far endpoint is
 * still undiscovered. Exposes only the revealed endpoint (`zoneId`) and whether it's
 * locked — the far Zone's id is deliberately absent (stripped).
 */
export interface SnapshotExit {
  id: string
  zoneId: string
  locked: boolean
}

/** The active Zone Enchantment as a watcher sees it — only ever attached to a
 *  **revealed** Zone (withheld when its Zone is unrevealed). */
export interface SnapshotEnchantment {
  zoneId: string
  type: EnchantmentType
  forte: number
}

/**
 * The combat watch on a Map-Instance: the §2.6 {@link EncounterSnapshot} plus the
 * fog-clamped spatial fields. `instanceVersion` is the Map-Instance row's token (the
 * envelope reserves it for this projector); the watch tracks **both** versions and
 * refetches when either advances.
 */
export interface SpatialEncounterSnapshot extends EncounterSnapshot {
  instanceVersion: number
  zones: SnapshotZone[]
  connections: SnapshotConnection[]
  exits: SnapshotExit[]
  enchantment?: SnapshotEnchantment
}

/** The revealed endpoint of a known-exit connection (the surfaced side). */
function revealedEndpoint(
  reveal: RevealState,
  fromZoneId: string,
  toZoneId: string
): string {
  return isZoneRevealed(reveal, fromZoneId) ? fromZoneId : toZoneId
}

/**
 * Field-level `zoneId → ""` (RED-9c): a combatant standing in an unrevealed Zone keeps
 * its `position` component (structural — present, not dropped) but with the `zoneId`
 * blanked, so the watch can't triangulate where an unseen combatant stands. A
 * combatant in a revealed Zone (or carrying no `position`) is untouched.
 */
function clampCombatantZone(
  combatant: VisibleCombatant,
  reveal: RevealState
): VisibleCombatant {
  const position = combatant.components.position
  if (position === undefined || isZoneRevealed(reveal, position.zoneId)) {
    return combatant
  }
  return {
    ...combatant,
    components: { ...combatant.components, position: { zoneId: "" } },
  }
}

/** The revealed Zones as `{ id, name }` — all Zones for a standalone (non-fog) map,
 *  only revealed Zones for a delve. Never `dmNotes`/`position`/`description`. */
function visibleZones(
  mapInstance: MapInstanceState,
  fog: boolean
): SnapshotZone[] {
  const zones = Object.values(mapInstance.geometry.zones)
  const shown = fog
    ? zones.filter((zone) => isZoneRevealed(mapInstance.reveal, zone.id))
    : zones
  return shown.map((zone) => ({ id: zone.id, name: zone.name }))
}

/** The active enchantment, **withheld** when fog-gated and its Zone is unrevealed. */
function visibleEnchantment(
  mapInstance: MapInstanceState,
  fog: boolean
): SnapshotEnchantment | undefined {
  const enchantment = mapInstance.enchantment
  if (enchantment === null) return undefined
  if (fog && !isZoneRevealed(mapInstance.reveal, enchantment.zoneId)) {
    return undefined
  }
  return {
    zoneId: enchantment.zoneId,
    type: enchantment.type,
    forte: enchantment.forte,
  }
}

/**
 * Connections split into full edges + known-exit silhouettes. Under fog, the derived
 * three-state {@link connectionFogState} governs: `stripped` connections vanish,
 * `known-exit` connections surface as far-zone-stripped silhouettes, `revealed`
 * connections draw fully. Without fog (a standalone map), every connection is a full
 * edge and nothing is an exit.
 */
function projectConnections(
  mapInstance: MapInstanceState,
  fog: boolean
): { connections: SnapshotConnection[]; exits: SnapshotExit[] } {
  const connections: SnapshotConnection[] = []
  const exits: SnapshotExit[] = []
  for (const connection of Object.values(mapInstance.geometry.connections)) {
    const locked = isConnectionLocked(connection, mapInstance.reveal)
    if (!fog) {
      // A standalone map shows every connection as a full edge — except an
      // unsurfaced `hidden` one, which stays a DM secret regardless of fog
      // (there is no reveal mechanism on a standalone encounter to surface it).
      if (!isConnectionSurfaced(connection, mapInstance.reveal)) continue
      connections.push({
        id: connection.id,
        fromZoneId: connection.fromZoneId,
        toZoneId: connection.toZoneId,
        locked,
      })
      continue
    }
    const state = connectionFogState(connection, mapInstance.reveal)
    if (state === "stripped") continue
    if (state === "revealed") {
      connections.push({
        id: connection.id,
        fromZoneId: connection.fromZoneId,
        toZoneId: connection.toZoneId,
        locked,
      })
    } else {
      exits.push({
        id: connection.id,
        zoneId: revealedEndpoint(
          mapInstance.reveal,
          connection.fromZoneId,
          connection.toZoneId
        ),
        locked,
      })
    }
  }
  return { connections, exits }
}

/**
 * Projects the combat watch on a Map-Instance (SD10): **wraps**
 * {@link projectEncounterSnapshot} (which redacts each combatant via the visibility
 * table), then — only when a delve is running ({@link isFogActive}) — clamps each
 * combatant's `zoneId` for unrevealed Zones, drops unrevealed Zones, withholds an
 * enchantment in an unrevealed Zone, and silhouettes known exits. A standalone
 * encounter (no reveal state) shows the full map; a delve clamps. The envelope is
 * never edited — the spatial transforms apply to its output.
 */
export function projectSpatialEncounterSnapshot(
  session: Session,
  view: ResolvedSession,
  viewer: TrustedViewer,
  meta: EncounterSnapshotMeta,
  mapInstance: MapInstanceState,
  instanceVersion: number
): SpatialEncounterSnapshot {
  const base = projectEncounterSnapshot(session, view, viewer, meta)
  const fog = isFogActive(mapInstance.reveal)

  const combatants = fog
    ? base.combatants.map((c) => clampCombatantZone(c, mapInstance.reveal))
    : base.combatants

  const { connections, exits } = projectConnections(mapInstance, fog)
  const enchantment = visibleEnchantment(mapInstance, fog)

  return {
    ...base,
    combatants,
    instanceVersion,
    zones: visibleZones(mapInstance, fog),
    connections,
    exits,
    ...(enchantment ? { enchantment } : {}),
  }
}

// --- The exploration-only dungeon watch (no combat session) ------------------

/** A current/max display pool the impure loader hydrates for a party token. */
export interface DungeonPool {
  current: number
  max: number
}

/**
 * One placed character in the delve roster the projector resolves party tokens from —
 * display identity + current vitals, keyed by `characterId`. The impure loader
 * hydrates these (the max pools need a derive); the projector only reads.
 */
export interface DungeonRosterEntry {
  name: string
  portraitUrl: string | null
  hp: DungeonPool
  sp: DungeonPool
}

/** One party-member token as a player sees it — display data only, keyed by the
 *  placed character's `characterId`. A PC's vitals are public sheet data, so —
 *  unlike enemy stats — they are not redacted. */
export interface DungeonSnapshotToken {
  characterId: string
  name: string
  portraitUrl: string | null
  hp: DungeonPool
  sp: DungeonPool
  /** The token's melee-lock (free in exploration); player-observable, not redacted. */
  engagement: Engagement
}

/** A **revealed** Zone. Carries its player-facing `description` + canvas `position` —
 *  never the private `dmNotes`. */
export interface DungeonSnapshotZone {
  id: string
  name: string
  description: string
  position: { x: number; y: number }
  tokens: DungeonSnapshotToken[]
  enchantment?: SnapshotEnchantment
}

/** The encounter-**row** + dungeon-**row** metadata the impure shell pairs with the
 *  pure {@link DungeonState}/{@link MapInstanceState}. `status` is the DB lifecycle
 *  string; both version tokens are row columns. */
export interface DungeonSnapshotMeta {
  name: string
  status: DungeonStatus
  campaignShortId: string
  version: number
  instanceVersion: number
}

/**
 * The full redacted snapshot the exploration fog player view consumes. Thin and
 * JSON-serializable end to end. `turn` is the dungeon turn counter — exploration
 * surfaces only the counter, never the turn queue or acted-flags (DM-only).
 */
export interface DungeonSnapshot {
  status: DungeonStatus
  name: string
  campaignShortId: string
  version: number
  instanceVersion: number
  turn: number
  zones: DungeonSnapshotZone[]
  connections: SnapshotConnection[]
  exits: SnapshotExit[]
}

/** The active enchantment **for a specific revealed Zone**, or undefined. */
function enchantmentForZone(
  mapInstance: MapInstanceState,
  zoneId: string
): SnapshotEnchantment | undefined {
  const enchantment = mapInstance.enchantment
  if (enchantment === null || enchantment.zoneId !== zoneId) return undefined
  return {
    zoneId: enchantment.zoneId,
    type: enchantment.type,
    forte: enchantment.forte,
  }
}

/**
 * The party tokens standing in each **revealed** Zone, keyed by Zone id. Two filters:
 * a token in an unrevealed Zone is dropped (it can't leak), and a token whose occupant
 * is not a delve-roster character is dropped — during combat the shared Map-Instance
 * also carries enemy tokens (keyed by combatant id, absent from the roster), which the
 * exploration view never surfaces (enemy redaction is the combat watch's concern).
 */
function tokensByRevealedZone(
  mapInstance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>
): Record<string, DungeonSnapshotToken[]> {
  const byZone: Record<string, DungeonSnapshotToken[]> = {}
  for (const [characterId, token] of Object.entries(mapInstance.occupancy)) {
    if (!isZoneRevealed(mapInstance.reveal, token.zoneId)) continue
    const entry = roster[characterId]
    if (entry === undefined) continue
    ;(byZone[token.zoneId] ??= []).push({
      characterId,
      name: entry.name,
      portraitUrl: entry.portraitUrl,
      hp: entry.hp,
      sp: entry.sp,
      engagement: token.engagement,
    })
  }
  return byZone
}

/**
 * Projects a live delve to its {@link DungeonSnapshot} (SD10/SD11). Exploration is
 * inherently fog-gated, so the projection is **unconditional** server-side: only
 * revealed Zones are emitted (never `dmNotes`), party tokens resolve from the injected
 * roster with public sheet vitals, an enchantment surfaces only on its revealed Zone,
 * and connections silhouette through {@link connectionFogState}. Pure — the impure
 * shell loads the dungeon + Map-Instance rows and the placed-character roster first.
 */
export function projectDungeonSnapshot(
  meta: DungeonSnapshotMeta,
  mapInstance: MapInstanceState,
  state: DungeonState,
  roster: Record<string, DungeonRosterEntry>
): DungeonSnapshot {
  const tokensByZone = tokensByRevealedZone(mapInstance, roster)

  const zones: DungeonSnapshotZone[] = Object.values(mapInstance.geometry.zones)
    .filter((zone) => isZoneRevealed(mapInstance.reveal, zone.id))
    .map((zone) => {
      const enchantment = enchantmentForZone(mapInstance, zone.id)
      return {
        id: zone.id,
        name: zone.name,
        description: zone.description,
        position: zone.position,
        tokens: tokensByZone[zone.id] ?? [],
        ...(enchantment ? { enchantment } : {}),
      }
    })

  const { connections, exits } = projectConnections(mapInstance, true)

  return {
    status: meta.status,
    name: meta.name,
    campaignShortId: meta.campaignShortId,
    version: meta.version,
    instanceVersion: meta.instanceVersion,
    turn: state.turnCounter,
    zones,
    connections,
    exits,
  }
}
