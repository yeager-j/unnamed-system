import type { MapZone, MapZoneSize } from "./geometry.schema"

/**
 * The **footprint vocabulary** — the one home that turns a Zone's authored `size`
 * into a fixed world-unit rect, plus the rect math that rides on it. Re-homed from
 * `apps/web/domain/map/view/footprints.ts` in P3 (UNN-590): the engine was
 * deliberately footprint-blind while `size` was cosmetic-only, but the generation
 * layout (D6) gives footprints **mechanical** meaning — pure collision placement and
 * the stub anchor computed from the parent's rect — so the table lives here and the
 * app re-exports it. Positions are already engine-schema canvas world units; this
 * keeps one authority instead of injecting a fixed table as a pretend-configurable
 * port through every generation call.
 *
 * Dimensions are multiples of the canvas grid (16 wu) so a size change grows/shrinks
 * right-and-down with no re-snap, and `M` matches the pre-UNN-630 card (≈344×192)
 * closely enough that existing maps don't reflow badly.
 */

/** The fixed world-unit rect each authored `size` maps to. */
export const ZONE_FOOTPRINTS: Record<MapZoneSize, { w: number; h: number }> = {
  S: { w: 208, h: 160 },
  M: { w: 336, h: 192 },
  L: { w: 432, h: 256 },
  XL: { w: 560, h: 320 },
}

/** The rect for a Zone's `size`, defaulting an unset size to `M` (the render-side default). */
export const footprintOf = (size: MapZoneSize | undefined) =>
  ZONE_FOOTPRINTS[size ?? "M"]

/** An axis-aligned world-space rect: top-left `(x, y)` + size `(w, h)`. */
export type Rect = { x: number; y: number; w: number; h: number }

/** A zone's placed footprint rect (top-left at its authored `position`). */
export const rectOfZone = (zone: Pick<MapZone, "position" | "size">): Rect => ({
  x: zone.position.x,
  y: zone.position.y,
  ...footprintOf(zone.size),
})

/** True when two rects share any interior area (edge-touching is not overlap). */
export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Which wall of a zone an exit opens through — its outward direction. */
export type FootprintSide = "n" | "e" | "s" | "w"

/**
 * The wall of `near` that faces `far` — the side half of the app's
 * `thresholdAnchors` derivation (UNN-633), mirrored here verbatim so the layout can
 * enforce D10's side-continuity contract as an acceptance predicate: a minted zone
 * is only placed where the eventual two-rect derivation keeps the stub's stored
 * anchor side. The rule: notches face across the axis on which the rects DON'T
 * overlap (sharing a y-band → e/w by dx; sharing an x-band → n/s by dy); a real
 * collision or a pure diagonal falls back to center dominance.
 */
export function sideBetween(near: Rect, far: Rect): FootprintSide {
  const dx = far.x + far.w / 2 - (near.x + near.w / 2)
  const dy = far.y + far.h / 2 - (near.y + near.h / 2)
  const xOverlap =
    Math.min(near.x + near.w, far.x + far.w) - Math.max(near.x, far.x)
  const yOverlap =
    Math.min(near.y + near.h, far.y + far.h) - Math.max(near.y, far.y)
  const horizontal =
    yOverlap > 0 && xOverlap <= 0
      ? true
      : xOverlap > 0 && yOverlap <= 0
        ? false
        : Math.abs(dx) >= Math.abs(dy)
  if (horizontal) return dx > 0 ? "e" : "w"
  return dy > 0 ? "s" : "n"
}
