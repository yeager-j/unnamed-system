import type { Edge, Node } from "@xyflow/react"

import type {
  MapConnection,
  MapGeometry,
  MapZone,
} from "@workspace/game-v2/spatial"

import { footprintOf } from "@/domain/map/view/footprints"

/**
 * Adapts a domain {@link MapGeometry} into the `{ nodes, edges }` shape React Flow
 * renders (UNN-461). Pure and provenance-neutral — it knows nothing about *where*
 * the geometry came from (a Map template now; a Map Instance projection in M2/M3),
 * which is what lets one canvas component serve all three surfaces.
 *
 * Each Zone becomes a `"zone"` node carrying the whole {@link MapZone} as its
 * `data`; each connection becomes a `"connection"` edge whose `source`/`target`
 * are the connection's `fromZoneId`/`toZoneId` (undirected — the direction is
 * cosmetic) carrying the whole {@link MapConnection}. The custom node/edge
 * components read these off `data`.
 */

export type ZoneNodeData = { zone: MapZone }
/** The connection plus its two endpoint zone names — the notches label the doorway
 *  ("⇢ The Nave") and the edge's `aria-label` names both partners (§D4). */
export type ConnectionEdgeData = {
  connection: MapConnection
  fromName: string
  toName: string
}

export type ZoneNode = Node<ZoneNodeData, "zone">
export type ConnectionEdge = Edge<ConnectionEdgeData, "connection">

/** The threshold edge's accessible name — the focusable RF edge carries it. */
export function connectionAriaLabel(
  fromName: string,
  toName: string,
  connection: Pick<MapConnection, "hidden" | "locked">
): string {
  const flags = [
    connection.hidden ? "hidden from players" : null,
    connection.locked ? "locked" : null,
  ].filter(Boolean)
  const base = `Threshold between ${fromName} and ${toName}`
  return flags.length > 0 ? `${base} — ${flags.join(", ")}` : base
}

export function geometryToFlow(geometry: MapGeometry): {
  nodes: ZoneNode[]
  edges: ConnectionEdge[]
} {
  const nodes: ZoneNode[] = Object.values(geometry.zones).map((zone) => {
    const { w, h } = footprintOf(zone.size)
    return {
      id: zone.id,
      type: "zone",
      position: zone.position,
      // The footprint fixes the node's box from `size` alone (§D2) — the card fills
      // it, so its bounding box never reads zoom/selection/turn state (PRD AC 4).
      width: w,
      height: h,
      style: { width: w, height: h },
      data: { zone },
    }
  })

  const edges: ConnectionEdge[] = Object.values(geometry.connections).map(
    (connection) => {
      const fromName = geometry.zones[connection.fromZoneId]?.name ?? ""
      const toName = geometry.zones[connection.toZoneId]?.name ?? ""
      return {
        id: connection.id,
        type: "connection",
        source: connection.fromZoneId,
        target: connection.toZoneId,
        ariaLabel: connectionAriaLabel(fromName, toName, connection),
        data: { connection, fromName, toName },
      }
    }
  )

  return { nodes, edges }
}
