import fc from "fast-check"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import type {
  MapConnection,
  MapGeometry,
  MapPage,
  MapZone,
} from "@workspace/game-v2/spatial/geometry.schema"
import type {
  GenerationState,
  MapInstanceState,
} from "@workspace/game-v2/spatial/map-instance.schema"

/**
 * Spatial arbitraries for the expedition-fold laws (UNN-589). Unlike
 * `componentArbitraries`, these are **not** total over a registry — they are hand-
 * built generators the `generation/__laws__` fold properties quantify over. Each
 * emits a value that is already a **fixed point of its load schema** (defaulted
 * fields present, optional fields absent), so a generated geometry/instance survives
 * a Zod parse and a jsonb round-trip unchanged.
 *
 * The generators stay **small** (1–3 pages, ≤8 zones, ≤8 connections): the fold's
 * claims are structural, so a handful of zones per case exercises every branch —
 * authored/manual/generated/missing provenance, seed vs grafted attribution, and
 * revealed ids that both do and do not exist in geometry — while keeping
 * counterexamples readable.
 */

/** The seed source-map id the fold laws attribute non-grafted pages to. */
export const SEED_MAP_ID = "seed-map"

/** A short id from a small alphabet — collisions across the real/junk pools are the
 *  point (they exercise the stale-id filter), so the alphabet is deliberately tiny. */
const arbitraryShortId = fc.string({ minLength: 1, maxLength: 4 })

/**
 * A small, self-consistent {@link MapGeometry}: 1–3 pages, 0–8 uniquely-keyed zones
 * each homed on one of the pages, and 0–8 connections whose endpoints are drawn from
 * the existing zones (so no connection ever dangles). Zone/connection ids are unique
 * within their kind.
 */
export const arbitraryMapGeometry: fc.Arbitrary<MapGeometry> = record({
  pageCount: fc.integer({ min: 1, max: 3 }),
  zoneSpecs: fc.uniqueArray(
    record({ id: arbitraryShortId, pageIndex: fc.nat() }),
    { selector: (spec) => spec.id, maxLength: 8 }
  ),
  connectionSpecs: fc.uniqueArray(
    record({
      id: arbitraryShortId,
      fromIndex: fc.nat(),
      toIndex: fc.nat(),
      hidden: fc.boolean(),
      locked: fc.boolean(),
    }),
    { selector: (spec) => spec.id, maxLength: 8 }
  ),
}).map(({ pageCount, zoneSpecs, connectionSpecs }) => {
  const pageIds = Array.from({ length: pageCount }, (_, i) => `page-${i}`)
  const pages: Record<string, MapPage> = Object.fromEntries(
    pageIds.map((id) => [id, { id, name: id }])
  )

  const zones: Record<string, MapZone> = {}
  for (const spec of zoneSpecs) {
    zones[spec.id] = {
      id: spec.id,
      name: spec.id,
      description: "",
      dmNotes: "",
      position: { x: 0, y: 0 },
      pageId: pageIds[spec.pageIndex % pageCount]!,
    }
  }

  const zoneIds = Object.keys(zones)
  const connections: Record<string, MapConnection> = {}
  if (zoneIds.length > 0) {
    for (const spec of connectionSpecs) {
      connections[spec.id] = {
        id: spec.id,
        fromZoneId: zoneIds[spec.fromIndex % zoneIds.length]!,
        toZoneId: zoneIds[spec.toIndex % zoneIds.length]!,
        hidden: spec.hidden,
        locked: spec.locked,
      }
    }
  }

  return { pages, zones, connections }
})

const arbitrarySource = fc.constantFrom<
  GenerationState["zones"][string]["source"]
>("authored", "manual", "generated")

/** Per-zone provenance where each zone is *independently* stamped or left unstamped
 *  (to exercise the missing-provenance → non-authored branch), and stamped zones draw
 *  a random source. */
function arbitraryProvenance(
  zoneIds: string[]
): fc.Arbitrary<GenerationState["zones"]> {
  if (zoneIds.length === 0) return fc.constant({})
  return fc
    .tuple(...zoneIds.map(() => fc.option(arbitrarySource, { nil: undefined })))
    .map((sources) => {
      const zones: GenerationState["zones"] = {}
      zoneIds.forEach((id, index) => {
        const source = sources[index]
        if (source !== undefined) zones[id] = { source }
      })
      return zones
    })
}

/**
 * A mid-run expedition {@link MapInstanceState}: an {@link arbitraryMapGeometry} with
 * mixed (or absent) provenance over its zones and reveal arrays drawn from the
 * geometry ids **plus junk** — the shape a fold consumes at expedition finish. Grafts
 * stay empty (P6). Occupancy/enchantment are irrelevant to the fold, so they default.
 */
export const arbitraryExpeditionInstance: fc.Arbitrary<MapInstanceState> =
  arbitraryMapGeometry.chain((geometry) => {
    const zoneIds = Object.keys(geometry.zones)
    const connectionIds = Object.keys(geometry.connections)
    const zonePool = [...zoneIds, "junk-zone-1", "junk-zone-2"]
    const connectionPool = [...connectionIds, "junk-conn-1"]

    return record({
      zones: arbitraryProvenance(zoneIds),
      revealedZoneIds: fc.subarray(zonePool),
      revealedConnectionIds: fc.subarray(connectionPool),
      unlockedConnectionIds: fc.subarray(connectionPool),
    }).map(
      ({
        zones,
        revealedZoneIds,
        revealedConnectionIds,
        unlockedConnectionIds,
      }) => ({
        geometry,
        occupancy: {},
        enchantment: null,
        reveal: {
          revealedZoneIds,
          revealedConnectionIds,
          unlockedConnectionIds,
        },
        generation: { zones, grafts: {} },
        lastMovedTokenKey: null,
      })
    )
  })

/**
 * A `staticReveal` fold for a given geometry — entries under the seed and one other
 * source Map, each mixing **real** geometry ids with **junk** the author has since
 * deleted (the stale-filter surface `applyStaticReveal` must tolerate).
 */
export function arbitraryStaticReveal(
  geometry: MapGeometry
): fc.Arbitrary<
  Record<string, { zoneIds: string[]; connectionIds: string[] }>
> {
  const zonePool = [
    ...Object.keys(geometry.zones),
    "stale-zone-1",
    "stale-zone-2",
  ]
  const connectionPool = [...Object.keys(geometry.connections), "stale-conn-1"]
  const entry = record({
    zoneIds: fc.subarray(zonePool),
    connectionIds: fc.subarray(connectionPool),
  })
  return record({
    [SEED_MAP_ID]: entry,
    "other-map": entry,
  })
}
