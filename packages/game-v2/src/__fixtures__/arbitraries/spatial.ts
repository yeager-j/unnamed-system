import fc from "fast-check"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import { makeGenerationState } from "@workspace/game-v2/spatial/__fixtures__/spatial"
import type {
  MapConnection,
  MapGeometry,
  MapPage,
  MapZone,
  MapZoneSize,
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

/** A random optional zone size (absent exercises the M default). */
export const arbitraryZoneSize = fc.option(
  fc.constantFrom<MapZoneSize>("S", "M", "L", "XL"),
  { nil: undefined }
)

/**
 * A geometry whose zones carry random spread-out positions/sizes (the base
 * generator pins every position at the origin, which is a degenerate stack).
 * Shared by the layout and roll-expansion laws (UNN-642 hoisted it here).
 */
export const arbitraryPlacedGeometry: fc.Arbitrary<MapGeometry> =
  arbitraryMapGeometry.chain((geometry) => {
    const zoneIds = Object.keys(geometry.zones)
    if (zoneIds.length === 0) return fc.constant(geometry)
    return fc
      .tuple(
        ...zoneIds.map(() =>
          record({
            x: fc.integer({ min: -1500, max: 1500 }),
            y: fc.integer({ min: -1500, max: 1500 }),
            size: arbitraryZoneSize,
          })
        )
      )
      .map((placements) => ({
        ...geometry,
        zones: Object.fromEntries(
          zoneIds.map((zoneId, index) => {
            const placement = placements[index]!
            const zone = geometry.zones[zoneId]!
            return [
              zoneId,
              {
                ...zone,
                position: { x: placement.x, y: placement.y },
                ...(placement.size === undefined
                  ? {}
                  : { size: placement.size }),
              },
            ]
          })
        ),
      }))
  })

const arbitrarySource = fc.constantFrom<
  GenerationState["zones"][string]["source"]
>("authored", "manual", "generated")

/** One provenance row as a load-schema fixed point: `depth` present (defaulted
 *  field), `templateKey` present-or-absent (optional field, never `undefined`). */
const arbitraryProvenanceRow: fc.Arbitrary<GenerationState["zones"][string]> =
  record({
    source: arbitrarySource,
    depth: fc.nat({ max: 6 }),
    templateKey: fc.option(fc.constantFrom("hall", "vault", "shrine"), {
      nil: undefined,
    }),
  }).map(({ source, depth, templateKey }) =>
    templateKey === undefined
      ? { source, depth }
      : { source, depth, templateKey }
  )

/** Per-zone provenance where each zone is *independently* stamped or left unstamped
 *  (to exercise the missing-provenance → non-authored branch), and stamped zones draw
 *  a random source/depth/binding. */
function arbitraryProvenance(
  zoneIds: string[]
): fc.Arbitrary<GenerationState["zones"]> {
  if (zoneIds.length === 0) return fc.constant({})
  return fc
    .tuple(
      ...zoneIds.map(() =>
        fc.option(arbitraryProvenanceRow, { nil: undefined })
      )
    )
    .map((rows) => {
      const zones: GenerationState["zones"] = {}
      zoneIds.forEach((id, index) => {
        const row = rows[index]
        if (row !== undefined) zones[id] = row
      })
      return zones
    })
}

/** Stubs hung off the given zones (empty when the geometry has none): distinct ids,
 *  finite bearings, anchors on a random wall with offset ∈ [0, 1]. */
function arbitraryStubs(
  zoneIds: string[]
): fc.Arbitrary<GenerationState["stubs"]> {
  if (zoneIds.length === 0) return fc.constant({})
  return fc
    .uniqueArray(
      record({
        id: arbitraryShortId.map((id) => `stub-${id}`),
        zoneIndex: fc.nat(),
        bearing: fc.double({
          min: -Math.PI,
          max: Math.PI,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        side: fc.constantFrom<"n" | "e" | "s" | "w">("n", "e", "s", "w"),
        offset: fc.double({ min: 0, max: 1, noNaN: true }),
      }),
      { selector: (spec) => spec.id, maxLength: 4 }
    )
    .map((specs) => {
      const stubs: GenerationState["stubs"] = {}
      for (const spec of specs) {
        stubs[spec.id] = {
          id: spec.id,
          zoneId: zoneIds[spec.zoneIndex % zoneIds.length]!,
          bearing: spec.bearing,
          anchor: { side: spec.side, offset: spec.offset },
        }
      }
      return stubs
    })
}

/**
 * A mid-run expedition {@link MapInstanceState}: an {@link arbitraryMapGeometry} with
 * mixed (or absent) provenance over its zones, stubs hung off random zones, and
 * reveal arrays drawn from the geometry ids **plus junk** — the shape a fold
 * consumes at expedition finish. Generated-connection provenance and grafts stay
 * empty (P3b mints / P6 grafts). Occupancy/enchantment are irrelevant to the fold,
 * so they default.
 */
export const arbitraryExpeditionInstance: fc.Arbitrary<MapInstanceState> =
  arbitraryMapGeometry.chain((geometry) => {
    const zoneIds = Object.keys(geometry.zones)
    const connectionIds = Object.keys(geometry.connections)
    const zonePool = [...zoneIds, "junk-zone-1", "junk-zone-2"]
    const connectionPool = [...connectionIds, "junk-conn-1"]

    return record({
      zones: arbitraryProvenance(zoneIds),
      stubs: arbitraryStubs(zoneIds),
      revealedZoneIds: fc.subarray(zonePool),
      revealedConnectionIds: fc.subarray(connectionPool),
      unlockedConnectionIds: fc.subarray(connectionPool),
    }).map(
      ({
        zones,
        stubs,
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
        generation: makeGenerationState({ zones, stubs }),
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
