/**
 * The **camera tier** — the canvas set-piece renderer's semantic-zoom regime
 * (Dungeon Visual Overhaul §D1). Tier is a *pure derivation* of React Flow's
 * viewport zoom, never stored: each canvas subscribes to the viewport, derives
 * the tier, and stamps `data-tier` on its wrapper `div` so every zone node styles
 * itself with `group-data-[tier=…]` CSS — no per-node React state, no re-render on
 * a tier flip (the card's three layers are always mounted; only their visibility
 * moves).
 *
 * The handoff's `zoom` (a 20–160 percent) maps 1:1 onto React Flow's viewport
 * `zoom` ×100, so `minZoom 0.2` / `maxZoom 1.6` is the same band.
 */

export type ZoneTier = "marquee" | "stage" | "closeup"

/**
 * The Marquee→Stage boundary, a named calibration knob. The risk (§D1) is that just
 * under it the Marquee name renders larger on screen than the Stage name just over
 * it, so zooming *in* would make identity *less* readable. P1b's boundary-readability
 * browser pass (verified at 39/40/41) settled this: **MARQUEE_MAX stays 40**, and the
 * inversion is removed at its source instead — the Stage header name is sized to match
 * the Marquee name (both `text-lg`), so on-screen name size increases monotonically
 * with zoom and never shrinks across the boundary.
 */
export const MARQUEE_MAX = 40

/** The Stage→Closeup boundary (inclusive upper bound of Stage). */
export const STAGE_MAX = 110

/**
 * The tier for a viewport zoom expressed as a percent (React Flow `zoom` ×100):
 * `<MARQUEE_MAX` Marquee, `MARQUEE_MAX..STAGE_MAX` Stage, `>STAGE_MAX` Closeup.
 */
export const tierOfZoom = (zoomPct: number): ZoneTier =>
  zoomPct < MARQUEE_MAX ? "marquee" : zoomPct <= STAGE_MAX ? "stage" : "closeup"

/** The zoom percent each tier's shortcut eases the camera to (band midpoints). */
export const TIER_MIDPOINTS: Record<ZoneTier, number> = {
  marquee: 30,
  stage: 72,
  closeup: 138,
}

/** The zoom band (percent), matching React Flow's `minZoom 0.2` / `maxZoom 1.6`. */
export const ZOOM_MIN = 20
export const ZOOM_MAX = 160
/** The step the `−` / `+` buttons write. */
export const ZOOM_STEP = 12
