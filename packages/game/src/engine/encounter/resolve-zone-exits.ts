import {
  connectionFogState,
  isConnectionLocked,
  isZoneRevealed,
} from "@workspace/game/engine/encounter/resolve-reveal"
import type { MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import type { MapConnection } from "@workspace/game/foundation/map/geometry"

/**
 * One exit out of a Zone on the run console: the connection, its far endpoint's
 * name + reveal state, and the player-facing fog/lock flags the DM acts on
 * (UNN-464). `neighborName` falls back to `"Unknown"` for a dangling connection.
 */
export interface ZoneExit {
  connection: MapConnection
  neighborName: string
  neighborRevealed: boolean
  hiddenFromPlayers: boolean
  locked: boolean
}

/**
 * The exits out of `zoneId` — every connection touching the Zone paired with its
 * far endpoint and the derived player-visibility flags the Zone details sheet
 * renders. Pure shaping over the Instance geometry + reveal overlay, so the sheet
 * calls one helper instead of inlining the filter/map.
 */
export function resolveZoneExits(
  instance: MapInstanceState,
  zoneId: string
): ZoneExit[] {
  return Object.values(instance.geometry.connections)
    .filter((conn) => conn.fromZoneId === zoneId || conn.toZoneId === zoneId)
    .map((conn) => {
      const neighborId =
        conn.fromZoneId === zoneId ? conn.toZoneId : conn.fromZoneId
      const neighbor = instance.geometry.zones[neighborId]
      return {
        connection: conn,
        neighborName: neighbor?.name ?? "Unknown",
        neighborRevealed: isZoneRevealed(instance.reveal, neighborId),
        hiddenFromPlayers:
          connectionFogState(conn, instance.reveal) === "stripped" &&
          conn.hidden,
        locked: isConnectionLocked(conn, instance.reveal),
      }
    })
}
