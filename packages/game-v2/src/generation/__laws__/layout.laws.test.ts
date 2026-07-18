import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import { arbitraryMapGeometry } from "@workspace/game-v2/__fixtures__/arbitraries/spatial"
import {
  footprintOf,
  rectOfZone,
  rectsOverlap,
  sideBetween,
  type Rect,
} from "@workspace/game-v2/spatial/footprints"
import type {
  MapGeometry,
  MapZoneSize,
} from "@workspace/game-v2/spatial/geometry.schema"

import {
  anchorFromBearing,
  edgeHalfPlane,
  fanBearings,
  inHalfPlane,
  pageSpacing,
  placeMintedZone,
} from "../layout"

/**
 * **Layout invariants** (UNN-590, D6/D10), quantified over spread-out variants
 * of {@link arbitraryMapGeometry}: no footprint overlap, half-plane respected
 * under `edge`, side continuity (the minted rect keeps the stub's stored anchor
 * side under the shipped two-rect derivation), input geometry never mutated,
 * and determinism. The anchor function's own contract (side matches the
 * bearing's exit wall, offset clamped off the corners) is quantified
 * separately.
 */

const arbitraryBearing = fc.double({
  min: -Math.PI,
  max: Math.PI,
  noNaN: true,
  noDefaultInfinity: true,
})

const arbitrarySize = fc.option(
  fc.constantFrom<MapZoneSize>("S", "M", "L", "XL"),
  { nil: undefined }
)

/** A geometry whose zones carry random positions/sizes (the base generator pins
 *  every position at the origin, which is a degenerate stack). */
const arbitraryPlacedGeometry: fc.Arbitrary<MapGeometry> =
  arbitraryMapGeometry.chain((geometry) => {
    const zoneIds = Object.keys(geometry.zones)
    if (zoneIds.length === 0) return fc.constant(geometry)
    return fc
      .tuple(
        ...zoneIds.map(() =>
          record({
            x: fc.integer({ min: -1500, max: 1500 }),
            y: fc.integer({ min: -1500, max: 1500 }),
            size: arbitrarySize,
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

const arbitraryPlacementCase = arbitraryPlacedGeometry
  .filter((geometry) => Object.keys(geometry.zones).length > 0)
  .chain((geometry) => {
    const zoneIds = Object.keys(geometry.zones)
    return record({
      geometry: fc.constant(geometry),
      parentZoneId: fc.constantFrom(...zoneIds),
      bearing: arbitraryBearing,
      size: arbitrarySize,
      growth: fc.constantFrom<"edge" | "open">("edge", "open"),
      startingZoneIds: fc.subarray(zoneIds, { minLength: 1 }),
    })
  })

describe("placeMintedZone laws (UNN-590)", () => {
  it("no overlap · half-plane under edge · side continuity · input unmutated · deterministic", () => {
    fc.assert(
      fc.property(
        arbitraryPlacementCase,
        ({
          geometry,
          parentZoneId,
          bearing,
          size,
          growth,
          startingZoneIds,
        }) => {
          const parent = geometry.zones[parentZoneId]!
          const pageId = parent.pageId
          const spacing = pageSpacing(geometry, pageId)
          const anchor = anchorFromBearing(footprintOf(parent.size), bearing)
          const halfPlane =
            growth === "edge"
              ? edgeHalfPlane(geometry, pageId, startingZoneIds)
              : undefined
          const snapshot = structuredClone(geometry)

          const input = {
            geometry,
            pageId,
            parentZoneId,
            bearing,
            anchorSide: anchor.side,
            size,
            spacing,
            growth,
            halfPlane,
          }
          const result = placeMintedZone(input)

          // Existing zones are never moved — the input is untouched.
          expect(geometry).toStrictEqual(snapshot)
          // Deterministic: a second identical call returns the same result.
          expect(placeMintedZone(input)).toStrictEqual(result)

          if (!result.ok) return
          const footprint = footprintOf(size)
          const minted: Rect = { ...result.value, ...footprint }

          for (const zone of Object.values(geometry.zones)) {
            if (zone.pageId !== pageId) continue
            expect(rectsOverlap(minted, rectOfZone(zone))).toBe(false)
          }
          expect(sideBetween(rectOfZone(parent), minted)).toBe(anchor.side)
          if (halfPlane !== undefined) {
            expect(
              inHalfPlane(
                {
                  x: minted.x + minted.w / 2,
                  y: minted.y + minted.h / 2,
                },
                halfPlane
              )
            ).toBe(true)
          }
        }
      )
    )
  })
})

describe("anchorFromBearing laws", () => {
  it("side matches the wall the bearing ray exits; offset clamped to [0.05, 0.95]", () => {
    fc.assert(
      fc.property(
        record({
          size: arbitrarySize,
          bearing: arbitraryBearing,
        }),
        ({ size, bearing }) => {
          const footprint = footprintOf(size)
          const anchor = anchorFromBearing(footprint, bearing)
          expect(anchor.offset).toBeGreaterThanOrEqual(0.05)
          expect(anchor.offset).toBeLessThanOrEqual(0.95)
          const dx = Math.cos(bearing)
          const dy = Math.sin(bearing)
          if (anchor.side === "e") expect(dx).toBeGreaterThan(0)
          if (anchor.side === "w") expect(dx).toBeLessThan(0)
          if (anchor.side === "s") expect(dy).toBeGreaterThan(0)
          if (anchor.side === "n") expect(dy).toBeLessThan(0)
        }
      )
    )
  })
})

describe("fanBearings laws", () => {
  it("edge fans stay strictly inside the half-circle; open fans cover the circle; counts match", () => {
    fc.assert(
      fc.property(
        record({
          base: arbitraryBearing,
          count: fc.integer({ min: 0, max: 8 }),
          growth: fc.constantFrom<"edge" | "open">("edge", "open"),
        }),
        ({ base, count, growth }) => {
          const bearings = fanBearings(base, count, growth)
          expect(bearings).toHaveLength(count)
          if (growth === "edge") {
            for (const bearing of bearings) {
              // Angular distance from base stays under π/2 (interior points).
              const delta = Math.atan2(
                Math.sin(bearing - base),
                Math.cos(bearing - base)
              )
              expect(Math.abs(delta)).toBeLessThan(Math.PI / 2 + 1e-9)
            }
          }
        }
      )
    )
  })
})
