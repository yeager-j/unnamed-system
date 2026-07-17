import {
  DEFAULT_PAGE_ID,
  type MapConnection,
  type MapGeometry,
  type MapPage,
} from "./geometry.schema"

/**
 * Pure page selectors (UNN-586) — the one home for every page-derived fact so no
 * surface re-decides it: display **order** (Postgres jsonb does not preserve key
 * insertion order, so `Object.keys(pages)` order is storage noise), the "first"
 * page every optional `activePageId` defaults to, per-connection **cross-page-ness**
 * (derived from endpoints, never stored — D3), the chip data a page's zone nodes
 * render for their cross-page links, and the impact counts the delete-page confirm
 * dialog shows (kept adjacent to `reduceMapGeometry`'s `deletePage` cascade and
 * pinned to it by test).
 */

/** A cross-page connection as seen from one on-page endpoint — the "leads to ⇢"
 *  chip's payload (D3): the chip renders on `zoneId` and navigates to
 *  `farPageId`, focusing `farZoneId`. Carries the connection's authored
 *  `hidden`/`locked` flags: a cross-page connection has no drawn edge, so the
 *  chip is its only edit affordance in the editor and needs the flag state. */
export interface CrossPageLink {
  connectionId: string
  zoneId: string
  farZoneId: string
  farZoneName: string
  farPageId: string
  farPageName: string
  hidden: boolean
  locked: boolean
}

/** A total, environment-independent code-unit order — this sort feeds
 *  `firstPageId` (a behavioral default) and the snapshot's wire order, not just
 *  rendered lists, so collation (`localeCompare`) is off the table: it varies by
 *  environment and can return 0 for distinct strings
 *  ([[2026-07-11-comparator-is-part-of-the-contract]]). */
const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

/** Every page in canonical display order — sorted by (name, id); reordering is a
 *  deliberate exclusion (D3), so the order is stable and derived, never authored. */
export function orderedPages(geometry: MapGeometry): MapPage[] {
  return Object.values(geometry.pages).sort(
    (a, b) => byCodeUnit(a.name, b.name) || byCodeUnit(a.id, b.id)
  )
}

/** The page an omitted `activePageId` resolves to — the first in canonical order.
 *  Falls back to {@link DEFAULT_PAGE_ID} on a (schema-impossible) empty record. */
export function firstPageId(geometry: MapGeometry): string {
  return orderedPages(geometry)[0]?.id ?? DEFAULT_PAGE_ID
}

/** The page a Zone sits on, or `undefined` for an unknown Zone id. */
export function pageOfZone(
  geometry: MapGeometry,
  zoneId: string
): string | undefined {
  return geometry.zones[zoneId]?.pageId
}

/** True when the connection's endpoints sit on different pages — derived from the
 *  Zones, never stored (a stored flag would be a second decider, D3). A dangling
 *  endpoint is not cross-page; it's the same missing-Zone tolerance the canvas
 *  transform already extends to dangling edges. */
export function isCrossPage(
  geometry: MapGeometry,
  connection: MapConnection
): boolean {
  const fromPage = pageOfZone(geometry, connection.fromZoneId)
  const toPage = pageOfZone(geometry, connection.toZoneId)
  return fromPage !== undefined && toPage !== undefined && fromPage !== toPage
}

/** All cross-page links with one endpoint on the given page — chip data for that
 *  page's zone nodes, one entry per (connection × on-page endpoint). */
export function crossPageLinksForPage(
  geometry: MapGeometry,
  pageId: string
): CrossPageLink[] {
  const links: CrossPageLink[] = []
  for (const connection of Object.values(geometry.connections)) {
    if (!isCrossPage(geometry, connection)) continue
    for (const [nearId, farId] of [
      [connection.fromZoneId, connection.toZoneId],
      [connection.toZoneId, connection.fromZoneId],
    ] as const) {
      const near = geometry.zones[nearId]
      const far = geometry.zones[farId]
      if (near === undefined || far === undefined) continue
      if (near.pageId !== pageId) continue
      const farPage = geometry.pages[far.pageId]
      links.push({
        connectionId: connection.id,
        zoneId: near.id,
        farZoneId: far.id,
        farZoneName: far.name,
        farPageId: far.pageId,
        farPageName: farPage?.name ?? far.pageId,
        hidden: connection.hidden,
        locked: connection.locked,
      })
    }
  }
  return links
}

/** The Zone ids `deletePage` destroys — the one authority for the cascade's
 *  blast radius, consumed by both the reducer (deletes them) and
 *  {@link pageDeleteImpact} (counts them), so the two can't drift. */
export function doomedZoneIdsFor(
  geometry: MapGeometry,
  pageId: string
): Set<string> {
  return new Set(
    Object.values(geometry.zones)
      .filter((zone) => zone.pageId === pageId)
      .map((zone) => zone.id)
  )
}

/** What `deletePage` would destroy — the summary the cascade-confirm dialog shows.
 *  Derived from the same {@link doomedZoneIdsFor} the reducer cascades (and
 *  pinned by test): `intraConnectionCount` are connections wholly on the page,
 *  `severedCrossPageCount` are cross-page links the cascade also removes. */
export function pageDeleteImpact(
  geometry: MapGeometry,
  pageId: string
): {
  zoneCount: number
  intraConnectionCount: number
  severedCrossPageCount: number
} {
  const doomed = doomedZoneIdsFor(geometry, pageId)
  let intraConnectionCount = 0
  let severedCrossPageCount = 0
  for (const connection of Object.values(geometry.connections)) {
    const fromDoomed = doomed.has(connection.fromZoneId)
    const toDoomed = doomed.has(connection.toZoneId)
    if (fromDoomed && toDoomed) intraConnectionCount += 1
    else if (fromDoomed || toDoomed) severedCrossPageCount += 1
  }
  return { zoneCount: doomed.size, intraConnectionCount, severedCrossPageCount }
}
