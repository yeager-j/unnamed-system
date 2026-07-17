import { orderedPages, type MapGeometry } from "@workspace/game-v2/spatial"

/**
 * Zones grouped by page in canonical page order (UNN-586) — the one shaper every
 * flat zone picker (staging dialog, prep placement, add-to-delve, move-to menus,
 * the connect command) renders from, so "how do pages group a zone list" is
 * decided once. Zones inside a group sort by name for scannable menus. Renderers
 * show the page heading only when more than one group exists — a single-page map
 * stays label-free.
 */
export interface PageZoneGroup {
  pageId: string
  pageName: string
  zones: Array<{ id: string; name: string }>
}

export function groupZonesByPage(geometry: MapGeometry): PageZoneGroup[] {
  return orderedPages(geometry).map((page) => ({
    pageId: page.id,
    pageName: page.name,
    zones: Object.values(geometry.zones)
      .filter((zone) => zone.pageId === page.id)
      .map((zone) => ({ id: zone.id, name: zone.name }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  }))
}
