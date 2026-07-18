import { footprintOf, rectOfZone } from "@workspace/game-v2/spatial/footprints"
import type { MapGeometry } from "@workspace/game-v2/spatial/geometry.schema"
import type {
  GenerationStub,
  MapInstanceState,
} from "@workspace/game-v2/spatial/map-instance.schema"

import { anchorFromBearing, fanBearings, inwardBearing } from "./layout"
import { makeStream } from "./rng"
import type { TemplateSetContent } from "./template-set.schema"

/**
 * The **expedition-start** generation helpers (procedural-dungeons tech design
 * D5 steps 4 and 6, UNN-590) — the pure pieces `startExpeditionAction` composes.
 * Both consume the *bound authored* zones: seed-Map zones whose authored
 * `templateKey` resolves in the Region's Template Set (an unknown or tombstoned
 * key skips gracefully — the blob-boundary doctrine; set lint warns ahead of
 * time). Draws for ticked sites land P4; start-time content rolls land P5.
 */

/**
 * Probability an `optional` template exit is culled at expedition start (D5
 * step 6). A feel constant, not schema — tuned with the layout pass (P3b).
 */
export const DEFAULT_OPTIONAL_EXIT_CULL = 0.5

/**
 * D5 step 4 — the ledger law's **delve-start case** (D4): bound authored zones
 * whose template is `unique` seed `mintedUniqueKeys`, so an authored Castle
 * Entrance can never coexist with a rolled one. Deduplicated (two authored
 * bindings of one unique template still yield one key — the same invariant the
 * ledger's set-add preserves) and sorted for a deterministic blob.
 */
export function seedMintedUniqueKeys(
  geometry: MapGeometry,
  set: TemplateSetContent
): string[] {
  const keys = new Set<string>()
  for (const zone of Object.values(geometry.zones)) {
    if (zone.templateKey === undefined) continue
    const template = set.templates[zone.templateKey]
    if (template === undefined || template.tombstoned === true) continue
    if (template.unique) keys.add(template.key)
  }
  return [...keys].sort()
}

/**
 * D5 step 6 — **optional-exit culling + stub sprouting** over the fresh
 * expedition snapshot. Per bound authored zone, in zone-id order (cursor
 * consumption must be order-stable, so iteration never follows jsonb key
 * order):
 *
 * 1. every `optional` template exit consumes exactly **one** `"templates"`
 *    draw, kept or culled — fixed consumption regardless of outcome, so the
 *    stream position after start is a function of the geometry alone;
 * 2. the exit budget = surviving exits − authored connections touching the
 *    zone, floored at 0 (authored connections consume the budget first, D5);
 * 3. the budget sprouts as stubs fanned per the page's growth mode: a starting
 *    zone under `edge` fans across the half-circle facing **inward** (D6);
 *    any other zone fans away from the centroid of its connected neighbors
 *    (fallback: the page's inward bearing). Each stub stores the anchor
 *    computed from the zone's footprint + its bearing (D4/D10).
 *
 * Stub ids are caller-minted (`newId`, the house pattern) — they need no seed
 * determinism; they live in the initial blob. Returns the sprouted stubs plus
 * the per-purpose consumed counts the caller writes into the initial ledger's
 * `streamCursors` (start composes the blob directly; no `advanceCursors` event).
 */
export function sproutStartStubs(input: {
  state: MapInstanceState
  set: TemplateSetContent
  startingZoneIds: readonly string[]
  seed: string
  newId: () => string
}): {
  stubs: Record<string, GenerationStub>
  cursors: Record<string, number>
} {
  const { geometry } = input.state
  const templatesStream = makeStream(input.seed, "templates")
  const stubs: Record<string, GenerationStub> = {}

  const boundZones = Object.values(geometry.zones)
    .filter((zone) => zone.templateKey !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const zone of boundZones) {
    const template = input.set.templates[zone.templateKey!]
    if (template === undefined || template.tombstoned === true) continue

    let surviving = 0
    for (const exit of template.exits) {
      if (!exit.optional) {
        surviving += 1
        continue
      }
      // One draw per optional exit, kept or culled — fixed consumption.
      const roll = templatesStream.next()
      if (roll >= DEFAULT_OPTIONAL_EXIT_CULL) surviving += 1
    }

    const authoredConnections = Object.values(geometry.connections).filter(
      (connection) =>
        connection.fromZoneId === zone.id || connection.toZoneId === zone.id
    ).length
    const budget = Math.max(0, surviving - authoredConnections)
    if (budget === 0) continue

    const growth = geometry.pages[zone.pageId]?.growth ?? "edge"
    const base = baseBearing(geometry, zone.id, input.startingZoneIds, growth)
    const bearings = fanBearings(base, budget, growth)
    const footprint = footprintOf(zone.size)
    for (const bearing of bearings) {
      const id = input.newId()
      stubs[id] = {
        id,
        zoneId: zone.id,
        bearing,
        anchor: anchorFromBearing(footprint, bearing),
      }
    }
  }

  return {
    stubs,
    cursors:
      templatesStream.consumed() > 0
        ? { templates: templatesStream.consumed() }
        : {},
  }
}

/**
 * The fan's base bearing for one zone: a **starting** zone fans around the
 * page's inward vector (D6 — the entrance grows into the site); a non-starting
 * zone fans **away from the centroid of its connected neighbors** (its open
 * flank), falling back to the inward vector when it has none.
 */
function baseBearing(
  geometry: MapGeometry,
  zoneId: string,
  startingZoneIds: readonly string[],
  growth: "edge" | "open"
): number {
  const zone = geometry.zones[zoneId]!
  const inward = inwardBearing(geometry, zone.pageId, startingZoneIds)
  if (growth === "edge" && startingZoneIds.includes(zoneId)) return inward

  const rect = rectOfZone(zone)
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
  const neighborCenters = Object.values(geometry.connections)
    .filter(
      (connection) =>
        connection.fromZoneId === zoneId || connection.toZoneId === zoneId
    )
    .map((connection) =>
      connection.fromZoneId === zoneId
        ? connection.toZoneId
        : connection.fromZoneId
    )
    .map((neighborId) => geometry.zones[neighborId])
    .filter((neighbor): neighbor is NonNullable<typeof neighbor> =>
      Boolean(neighbor)
    )
    .map((neighbor) => {
      const neighborRect = rectOfZone(neighbor)
      return {
        x: neighborRect.x + neighborRect.w / 2,
        y: neighborRect.y + neighborRect.h / 2,
      }
    })
  if (neighborCenters.length === 0) return inward
  const centroid = {
    x:
      neighborCenters.reduce((sum, p) => sum + p.x, 0) / neighborCenters.length,
    y:
      neighborCenters.reduce((sum, p) => sum + p.y, 0) / neighborCenters.length,
  }
  if (centroid.x === center.x && centroid.y === center.y) return inward
  return Math.atan2(center.y - centroid.y, center.x - centroid.x)
}
