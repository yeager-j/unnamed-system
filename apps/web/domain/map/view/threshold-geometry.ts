/**
 * Pure **threshold placement** geometry for the rim-notch renderer (UNN-633, §D4)
 * — the one home that decides where a connection's paired notches sit on the two
 * facing zone walls, and where a watch **stub** notch sits on a single revealed
 * rim. It lives in `domain/map/view/` beside {@link import("./footprints").footprintOf}
 * because both consumers reach it legally: the engine-free canvas kit imports it
 * downward (rendering), and the dungeon loader in `lib` imports it as a peer (stub
 * `{side, offset}` projection — `lib` may not import the kit).
 *
 * The connection stays a React Flow edge; only its skin changes. `thresholdAnchors`
 * places the notch pair at the **overlap-band midpoint** of the facing walls, with a
 * clamp the handoff prototype omits (its fixture always overlaps; the freeform editor
 * doesn't). `stubAnchorOf` derives a watch stub's `{side, offset}` by calling
 * `thresholdAnchors` with the same inputs the revealed renderer will use, so the stub
 * lands exactly where the revealed near-notch will — the stub→reveal transition is
 * position-identical **by construction**, no jump possible.
 */

/** An axis-aligned world-space rect: top-left `(x, y)` + size `(w, h)`. */
export type Rect = { x: number; y: number; w: number; h: number }

/** Which wall of a zone a notch opens through (also its **outward** direction — the
 *  way the doorway faces, away from its own zone toward the partner). */
export type ExitSide = "n" | "s" | "e" | "w"

/** A notch's world position, the orientation of the wall it straddles (`"v"` =
 *  vertical / left-right edge, `"h"` = horizontal / top-bottom), and the `side` of its
 *  own zone the notch sits on — the outward direction the partner tag points. */
export type NotchAnchor = {
  x: number
  y: number
  orient: "h" | "v"
  side: ExitSide
}

/** A watch stub's stable placement: the wall + the along-wall coordinate normalized
 *  to the near zone's edge (0..1). The full anchor the doorway-into-darkness needs —
 *  a fixed wall slot alone would slide when the partner reveals. */
export type ExitAnchor = { side: ExitSide; offset: number }

/** World units: `along` runs with the wall, `across` cuts through it; jambs are 1.5px borders. */
export const NOTCH = { along: 32, across: 12 } as const

/** Padding keeping a notch off the very corner of a short wall. */
const EDGE_PAD = 8

/** Keep an along-wall coordinate within `[start, start+len]`, off both corners. */
const clampAlongEdge = (v: number, start: number, len: number): number =>
  Math.min(
    Math.max(v, start + NOTCH.along / 2 + EDGE_PAD),
    start + len - NOTCH.along / 2 - EDGE_PAD
  )

/**
 * The two notch anchors for a connection between rects `a` and `b`, returned in input
 * order: index 0 sits on `a`'s wall, index 1 on `b`'s. Notches face across the axis of
 * greatest separation (left/right when the zones are more horizontally apart than
 * vertically, else top/bottom) and centre on the overlap band of the shared span,
 * clamped off the corners when the facing ranges don't overlap.
 */
export function thresholdAnchors(a: Rect, b: Rect): [NotchAnchor, NotchAnchor] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)

  // Put the notches on the walls facing the *gap* between the zones — the axis on
  // which they DON'T overlap. Two zones sharing an x-band (stacked) get top/bottom
  // notches; sharing a y-band (side by side) get left/right; if they overlap on both
  // (a real collision) or neither (a pure diagonal), fall back to center dominance.
  // Center distance alone is wrong when zones are offset on the overlapping axis: a
  // zone slightly up-and-right of another still connects through their shared column.
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  const horizontal =
    yOverlap > 0 && xOverlap <= 0
      ? true
      : xOverlap > 0 && yOverlap <= 0
        ? false
        : Math.abs(dx) >= Math.abs(dy)

  if (horizontal) {
    const mid = (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2
    const bIsRight = dx > 0
    return [
      {
        x: bIsRight ? a.x + a.w : a.x,
        y: clampAlongEdge(mid, a.y, a.h),
        orient: "v",
        side: bIsRight ? "e" : "w",
      },
      {
        x: bIsRight ? b.x : b.x + b.w,
        y: clampAlongEdge(mid, b.y, b.h),
        orient: "v",
        side: bIsRight ? "w" : "e",
      },
    ]
  }

  const mid = (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2
  const bIsBelow = dy > 0
  return [
    {
      x: clampAlongEdge(mid, a.x, a.w),
      y: bIsBelow ? a.y + a.h : a.y,
      orient: "h",
      side: bIsBelow ? "s" : "n",
    },
    {
      x: clampAlongEdge(mid, b.x, b.w),
      y: bIsBelow ? b.y : b.y + b.h,
      orient: "h",
      side: bIsBelow ? "n" : "s",
    },
  ]
}

/**
 * A watch stub's `{side, offset}` for the revealed `near` zone whose partner `far` is
 * structurally absent player-side. Computed through the same {@link thresholdAnchors}
 * the revealed renderer uses, so `notchAnchorOf(stubAnchorOf(near, far), near)` equals
 * `thresholdAnchors(near, far)[0]` — the stub and the eventual revealed near-notch
 * coincide exactly.
 */
export function stubAnchorOf(near: Rect, far: Rect): ExitAnchor {
  const [anchor] = thresholdAnchors(near, far)
  const offset =
    anchor.orient === "v"
      ? (anchor.y - near.y) / near.h
      : (anchor.x - near.x) / near.w
  return { side: anchor.side, offset }
}

/**
 * The world-space {@link NotchAnchor} for a stub, given its `{side, offset}` and the
 * zone's top-left `origin` + footprint — the inverse of {@link stubAnchorOf}. The watch
 * renders a lone notch here; on reveal the paired renderer draws its near-notch at the
 * identical point.
 */
export function notchAnchorOf(
  exit: ExitAnchor,
  origin: { x: number; y: number },
  footprint: { w: number; h: number }
): NotchAnchor {
  switch (exit.side) {
    case "w":
      return {
        x: origin.x,
        y: origin.y + exit.offset * footprint.h,
        orient: "v",
        side: "w",
      }
    case "e":
      return {
        x: origin.x + footprint.w,
        y: origin.y + exit.offset * footprint.h,
        orient: "v",
        side: "e",
      }
    case "n":
      return {
        x: origin.x + exit.offset * footprint.w,
        y: origin.y,
        orient: "h",
        side: "n",
      }
    case "s":
      return {
        x: origin.x + exit.offset * footprint.w,
        y: origin.y + footprint.h,
        orient: "h",
        side: "s",
      }
  }
}
