import {
  footprintOf,
  rectOfZone,
  rectsOverlap,
  sideBetween,
  type FootprintSide,
  type Rect,
} from "@workspace/game-v2/spatial/footprints"
import type {
  MapGeometry,
  MapZoneSize,
} from "@workspace/game-v2/spatial/geometry.schema"
import type { StubAnchor } from "@workspace/game-v2/spatial/map-instance.schema"
import { err, ok, type Result } from "@workspace/result"

/**
 * The **layout** algorithm (procedural-dungeons tech design D6, UNN-590) —
 * directional fan, page-local, positions immutable. All pure: placement
 * (`placeMintedZone`) is a deterministic overlap search; the fan
 * (`fanBearings`, UNN-642) takes an injected `draw` for its per-exit
 * orientation jitter, so it stays a pure function of its arguments while the
 * *randomness* lives in the caller's ledger stream. Coordinates are canvas
 * world units, canvas convention (x right, y down); bearings are radians in
 * that frame, so "screen-up" is −π/2.
 *
 * Invariants the laws pin:
 * - a placed footprint rect never overlaps a same-page zone footprint;
 * - an existing zone is **never moved** (structural — the search only ever
 *   returns a position for the new zone; the DM may have hand-adjusted);
 * - under `edge` growth the placement stays in the half-plane;
 * - the placed rect keeps the stub's stored anchor **side** under the shipped
 *   two-rect derivation (`sideBetween`) — D10's continuity contract, enforced as
 *   an acceptance predicate rather than a geometric hope.
 *
 * The numbers here are **feel parameters** with defensible starting values (D6's
 * honest caveat); they get one tuning pass against a real ~30-zone expedition in
 * P3b. Constants, not schema.
 */

/** Fallback spacing when a page has fewer than two connected authored zones. */
export const DEFAULT_SPACING = 360

/** Loop-closure candidate radius = this × spacing (D6). */
export const CLOSURE_RADIUS_FACTOR = 1.5

/** Collision-nudge steps, degrees off the stub bearing, tried in order. */
export const NUDGE_STEPS_DEG = [0, 15, -15, 30, -30, 45, -45] as const

/**
 * Off-boundary inset for the `edge` fan's usable arc (radians, UNN-642 tuning).
 * The fan spans the forward half-circle inset by this at each end, so an exit
 * never lands exactly on the half-plane boundary (where placement would
 * border-reject it) while the arc still reaches near-horizontal — the east/west
 * walls. A feel parameter, not schema.
 */
export const EDGE_ARC_MARGIN = Math.PI / 12

/** Distance-extension factor between nudge rounds, and the round cap. The cap is
 *  defensive — ~7 × 6 candidates over growing radii; a real page runs out of
 *  authored density long before placement runs out of rings. */
const DISTANCE_FACTOR = 1.25
const MAX_DISTANCE_ROUNDS = 6

export type LayoutError = "no-space"

/** A half-plane: points `p` with `dot(p − origin, direction) ≥ 0` are inside. */
export type HalfPlane = {
  origin: { x: number; y: number }
  direction: { x: number; y: number }
}

/** True when `point` lies in (or on the boundary of) the half-plane. */
export function inHalfPlane(
  point: { x: number; y: number },
  halfPlane: HalfPlane
): boolean {
  return (
    (point.x - halfPlane.origin.x) * halfPlane.direction.x +
      (point.y - halfPlane.origin.y) * halfPlane.direction.y >=
    0
  )
}

const centerOf = (rect: Rect) => ({
  x: rect.x + rect.w / 2,
  y: rect.y + rect.h / 2,
})

/** Median of a non-empty list. */
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * The page's **spacing** — the median center-to-center gap of its *connected*
 * same-page zone pairs (connected pairs measure the author's intended room
 * rhythm; unconnected pairs measure nothing), falling back to
 * {@link DEFAULT_SPACING} when the page has no such pair.
 */
export function pageSpacing(geometry: MapGeometry, pageId: string): number {
  const gaps: number[] = []
  for (const connection of Object.values(geometry.connections)) {
    const from = geometry.zones[connection.fromZoneId]
    const to = geometry.zones[connection.toZoneId]
    if (
      from === undefined ||
      to === undefined ||
      from.pageId !== pageId ||
      to.pageId !== pageId
    ) {
      continue
    }
    const a = centerOf(rectOfZone(from))
    const b = centerOf(rectOfZone(to))
    gaps.push(Math.hypot(b.x - a.x, b.y - a.y))
  }
  return gaps.length === 0 ? DEFAULT_SPACING : median(gaps)
}

/**
 * The page's **inward bearing** under `edge` growth (D6): the direction from the
 * starting-zone centroid toward the centroid of the page's *other* zones — "into
 * the site" — falling back to screen-up (−π/2) when either centroid is undefined
 * (no starting zones on the page, or no other zones). With `edge`, depth roughly
 * maps to a canvas axis: "deep in the city" is legible on the map.
 */
export function inwardBearing(
  geometry: MapGeometry,
  pageId: string,
  startingZoneIds: readonly string[]
): number {
  const starting = new Set(startingZoneIds)
  const startCenters: { x: number; y: number }[] = []
  const otherCenters: { x: number; y: number }[] = []
  for (const zone of Object.values(geometry.zones)) {
    if (zone.pageId !== pageId) continue
    const center = centerOf(rectOfZone(zone))
    if (starting.has(zone.id)) startCenters.push(center)
    else otherCenters.push(center)
  }
  if (startCenters.length === 0 || otherCenters.length === 0) {
    return -Math.PI / 2
  }
  const mean = (points: { x: number; y: number }[]) => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  })
  const from = mean(startCenters)
  const to = mean(otherCenters)
  if (from.x === to.x && from.y === to.y) return -Math.PI / 2
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/**
 * The `edge`-growth **half-plane guard** (D6): the boundary line runs through the
 * starting-zone centroid perpendicular to the inward vector; no generated
 * placement (or closure candidate) may fall behind it.
 */
export function edgeHalfPlane(
  geometry: MapGeometry,
  pageId: string,
  startingZoneIds: readonly string[]
): HalfPlane {
  const bearing = inwardBearing(geometry, pageId, startingZoneIds)
  const starting = startingZoneIds
    .map((zoneId) => geometry.zones[zoneId])
    .filter(
      (zone): zone is NonNullable<typeof zone> =>
        zone !== undefined && zone.pageId === pageId
    )
    .map((zone) => centerOf(rectOfZone(zone)))
  const origin =
    starting.length === 0
      ? { x: 0, y: 0 }
      : {
          x: starting.reduce((sum, p) => sum + p.x, 0) / starting.length,
          y: starting.reduce((sum, p) => sum + p.y, 0) / starting.length,
        }
  return {
    origin,
    direction: { x: Math.cos(bearing), y: Math.sin(bearing) },
  }
}

/**
 * Fans `count` bearings around `base`, **one RNG draw each** (UNN-642). The
 * legal arc — the forward half-circle inset by {@link EDGE_ARC_MARGIN} under
 * `edge`, the full circle under `open` — is split into `count` equal sectors,
 * and each bearing is sampled uniformly *within its own sector*. Sectors keep
 * the exits ordered and non-crossing (so their zones don't fight for the same
 * spot); the in-sector draw is what gives orientation variety no two seeds
 * share, lets a lone exit leave its parent's exact heading, and lets the outer
 * exits reach the near-horizontal east/west walls. `draw` returns a value in
 * [0, 1); tests inject constants (the fan is otherwise pure). Left-to-right /
 * around-the-circle order preserved.
 */
export function fanBearings(
  base: number,
  count: number,
  growth: "edge" | "open",
  draw: () => number
): number[] {
  if (count <= 0) return []
  const arc = growth === "open" ? 2 * Math.PI : Math.PI - 2 * EDGE_ARC_MARGIN
  const start = growth === "open" ? base : base - arc / 2
  const sector = arc / count
  return Array.from({ length: count }, (_, i) => start + (i + draw()) * sector)
}

/** Keep an anchor offset off the very corners of its wall. */
const clampOffset = (offset: number) => Math.min(0.95, Math.max(0.05, offset))

/**
 * The stored **stub anchor** for a bearing (D4/D10): the wall of the parent's
 * footprint a ray from its center at `bearing` exits through, plus the
 * along-wall coordinate of the exit point normalized to that edge (0..1, n/s
 * walls left→right, e/w walls top→bottom), clamped off the corners. Stored at
 * sprout, projected verbatim into the snapshot — a stub has no far zone, so the
 * shipped two-rect derivation cannot produce its anchor (its fallback would give
 * the stub away, D10).
 */
export function anchorFromBearing(
  footprint: { w: number; h: number },
  bearing: number
): StubAnchor {
  const dx = Math.cos(bearing)
  const dy = Math.sin(bearing)
  const halfW = footprint.w / 2
  const halfH = footprint.h / 2

  // Ray from the rect center: the wall with the smallest positive boundary-hit
  // parameter wins. Guard the axis-parallel cases (dx or dy ≈ 0).
  const tx = dx === 0 ? Infinity : (dx > 0 ? halfW : -halfW) / dx
  const ty = dy === 0 ? Infinity : (dy > 0 ? halfH : -halfH) / dy

  if (tx <= ty) {
    const side: FootprintSide = dx > 0 ? "e" : "w"
    const yAt = dy * tx
    return { side, offset: clampOffset((yAt + halfH) / footprint.h) }
  }
  const side: FootprintSide = dy > 0 ? "s" : "n"
  const xAt = dx * ty
  return { side, offset: clampOffset((xAt + halfW) / footprint.w) }
}

/** The projected (pre-nudge) center for a mint off `parentRect` at `bearing` —
 *  also what closure measures candidate distance from (D6). */
export function projectedPosition(
  parentRect: Rect,
  bearing: number,
  spacing: number
): { x: number; y: number } {
  const center = centerOf(parentRect)
  return {
    x: center.x + Math.cos(bearing) * spacing,
    y: center.y + Math.sin(bearing) * spacing,
  }
}

/**
 * Places a minted zone: walks the bearing at `spacing`, then the
 * {@link NUDGE_STEPS_DEG} perpendicular steps, then extends the distance by
 * {@link DISTANCE_FACTOR} and repeats — accepting the first candidate whose
 * footprint rect (1) overlaps no same-page zone footprint, (2) sits in the
 * half-plane under `edge` (rect center tested — the guard is a growth-direction
 * rule, not a hard clip), and (3) keeps the stub's stored anchor side under the
 * two-rect `sideBetween` derivation. Returns the zone's **top-left position**
 * (the stored `MapZone.position` convention), or `err("no-space")` after the
 * bounded search — practically unreachable on a real page.
 */
export function placeMintedZone(input: {
  geometry: MapGeometry
  pageId: string
  parentZoneId: string
  bearing: number
  anchorSide: FootprintSide
  size: MapZoneSize | undefined
  spacing: number
  growth: "edge" | "open"
  halfPlane?: HalfPlane
}): Result<{ x: number; y: number }, LayoutError> {
  const parent = input.geometry.zones[input.parentZoneId]
  if (parent === undefined) return err("no-space")
  const parentRect = rectOfZone(parent)
  const footprint = footprintOf(input.size)

  const samePageRects = Object.values(input.geometry.zones)
    .filter((zone) => zone.pageId === input.pageId)
    .map(rectOfZone)

  for (let round = 0; round < MAX_DISTANCE_ROUNDS; round++) {
    const distance = input.spacing * DISTANCE_FACTOR ** round
    for (const stepDeg of NUDGE_STEPS_DEG) {
      const bearing = input.bearing + (stepDeg * Math.PI) / 180
      const center = projectedPosition(parentRect, bearing, distance)
      const rect: Rect = {
        x: center.x - footprint.w / 2,
        y: center.y - footprint.h / 2,
        w: footprint.w,
        h: footprint.h,
      }
      if (samePageRects.some((other) => rectsOverlap(rect, other))) continue
      if (
        input.growth === "edge" &&
        input.halfPlane !== undefined &&
        !inHalfPlane(center, input.halfPlane)
      ) {
        continue
      }
      if (sideBetween(parentRect, rect) !== input.anchorSide) continue
      return ok({ x: rect.x, y: rect.y })
    }
  }
  return err("no-space")
}
