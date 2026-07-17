import type { Edge, Node } from "@xyflow/react"

import {
  crossPageLinksForPage,
  firstPageId,
  type CrossPageLink,
  type MapConnection,
  type MapGeometry,
  type MapZone,
} from "@workspace/game-v2/spatial"

import { footprintOf } from "@/domain/map/view/footprints"

/**
 * Adapts a domain {@link MapGeometry} into the `{ nodes, edges }` shape React Flow
 * renders (UNN-461). Pure and provenance-neutral — it knows nothing about *where*
 * the geometry came from (a Map template now; a Map Instance projection in M2/M3),
 * which is what lets one canvas component serve all three surfaces.
 *
 * **One page at a time** (UNN-586, D3): the transform filters both halves to the
 * active page — nodes to the page's Zones, edges to connections with *both*
 * endpoints on-page — so React Flow never sees two coordinate spaces. A
 * cross-page connection becomes no edge; instead its on-page endpoint's node
 * data carries a {@link CrossPageLink} the card renders as a "leads to ⇢" chip.
 * `activePageId` is optional and defaults to the first page in canonical order.
 *
 * Each on-page Zone becomes a `"zone"` node carrying the whole {@link MapZone} as
 * its `data`; each on-page connection becomes a `"connection"` edge whose
 * `source`/`target` are the connection's `fromZoneId`/`toZoneId` (undirected —
 * the direction is cosmetic) carrying the whole {@link MapConnection}. The custom
 * node/edge components read these off `data`.
 */

export type ZoneNodeData = { zone: MapZone; crossPageLinks: CrossPageLink[] }
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

export function geometryToFlow(
  geometry: MapGeometry,
  activePageId?: string
): {
  nodes: ZoneNode[]
  edges: ConnectionEdge[]
} {
  const pageId = activePageId ?? firstPageId(geometry)
  const links = crossPageLinksForPage(geometry, pageId)

  const nodes: ZoneNode[] = Object.values(geometry.zones)
    .filter((zone) => zone.pageId === pageId)
    .map((zone) => {
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
        data: {
          zone,
          crossPageLinks: links.filter((link) => link.zoneId === zone.id),
        },
      }
    })

  const edges: ConnectionEdge[] = Object.values(geometry.connections)
    .filter(
      (connection) =>
        // Both endpoints on-page: a cross-page connection renders as chips, not
        // an edge, and a dangling endpoint stays tolerated (not on-page ⇒ dropped).
        geometry.zones[connection.fromZoneId]?.pageId === pageId &&
        geometry.zones[connection.toZoneId]?.pageId === pageId
    )
    .map((connection) => {
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
    })

  return { nodes, edges }
}
