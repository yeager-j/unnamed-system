import {
  connectionFogState,
  isZoneRevealed,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import type { SnapshotExitAnchors } from "@workspace/game-v2/visibility"

import { footprintOf } from "./footprints"
import {
  NOTCH,
  stubAnchorOf,
  type ExitSide,
  type Rect,
} from "./threshold-geometry"

/**
 * The rim placements (`{side, offset}`) for a delve's **known exits** (UNN-633, §D4) —
 * the values the snapshot loader hands `projectDungeonSnapshot` /
 * `projectSpatialEncounterSnapshot` so the engine stays footprint-blind (D2). Pure:
 * it reads the Instance geometry, turns each revealed near-Zone + its undiscovered far
 * partner into world rects via {@link footprintOf}, and derives the near anchor through
 * the same {@link stubAnchorOf} the revealed renderer uses — so a stub notch lands
 * exactly where its eventual revealed near-notch will.
 *
 * Coincident stubs (two hidden partners behind the same overlap band, so the same
 * `{side, offset}`) nudge apart deterministically in connection-id order by one
 * notch-length, so they don't stack into one silhouette.
 */
export function dungeonExitAnchors(
  instance: MapInstanceState
): SnapshotExitAnchors {
  const zones = instance.geometry.zones
  const rectOf = (zoneId: string): Rect | null => {
    const zone = zones[zoneId]
    if (!zone) return null
    return { x: zone.position.x, y: zone.position.y, ...footprintOf(zone.size) }
  }

  type Pending = {
    connectionId: string
    nearZoneId: string
    side: ExitSide
    offset: number
    wallLen: number
  }
  const pending: Pending[] = []
  for (const connection of Object.values(instance.geometry.connections)) {
    if (connectionFogState(connection, instance.reveal) !== "known-exit")
      continue
    const nearIsFrom = isZoneRevealed(instance.reveal, connection.fromZoneId)
    const nearZoneId = nearIsFrom ? connection.fromZoneId : connection.toZoneId
    const farZoneId = nearIsFrom ? connection.toZoneId : connection.fromZoneId
    const near = rectOf(nearZoneId)
    const far = rectOf(farZoneId)
    if (!near || !far) continue
    const { side, offset } = stubAnchorOf(near, far)
    pending.push({
      connectionId: connection.id,
      nearZoneId,
      side,
      offset,
      wallLen: side === "n" || side === "s" ? near.w : near.h,
    })
  }

  // Nudge only genuinely-coincident stubs (same zone + wall + offset), centred and
  // spread by one notch-length in connection-id order; distinct offsets are untouched.
  const anchors: SnapshotExitAnchors = {}
  const groups = new Map<string, Pending[]>()
  for (const p of pending) {
    const key = `${p.nearZoneId}:${p.side}:${Math.round(p.offset * 1000)}`
    const group = groups.get(key)
    if (group) group.push(p)
    else groups.set(key, [p])
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.connectionId.localeCompare(b.connectionId))
    group.forEach((p, i) => {
      const step = NOTCH.along / p.wallLen
      const spread = (i - (group.length - 1) / 2) * step
      const offset = Math.min(0.95, Math.max(0.05, p.offset + spread))
      anchors[p.connectionId] = { side: p.side, offset }
    })
  }
  return anchors
}
