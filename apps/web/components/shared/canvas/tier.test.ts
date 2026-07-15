import { describe, expect, it } from "vitest"

import {
  MARQUEE_MAX,
  STAGE_MAX,
  TIER_MIDPOINTS,
  tierOfZoom,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./tier"

describe("tierOfZoom", () => {
  it("derives Marquee below MARQUEE_MAX, Stage up to STAGE_MAX, Closeup above", () => {
    expect(tierOfZoom(ZOOM_MIN)).toBe("marquee")
    expect(tierOfZoom(30)).toBe("marquee")
    expect(tierOfZoom(72)).toBe("stage")
    expect(tierOfZoom(138)).toBe("closeup")
    expect(tierOfZoom(ZOOM_MAX)).toBe("closeup")
  })

  it("pins the Marquee→Stage boundary at MARQUEE_MAX (exclusive lower Stage edge)", () => {
    expect(tierOfZoom(MARQUEE_MAX - 1)).toBe("marquee")
    expect(tierOfZoom(MARQUEE_MAX)).toBe("stage")
    expect(tierOfZoom(MARQUEE_MAX + 1)).toBe("stage")
  })

  it("pins the Stage→Closeup boundary at STAGE_MAX (inclusive upper Stage edge)", () => {
    expect(tierOfZoom(STAGE_MAX - 1)).toBe("stage")
    expect(tierOfZoom(STAGE_MAX)).toBe("stage")
    expect(tierOfZoom(STAGE_MAX + 1)).toBe("closeup")
  })

  it("classifies every band midpoint as its own tier", () => {
    for (const [tier, mid] of Object.entries(TIER_MIDPOINTS)) {
      expect(tierOfZoom(mid)).toBe(tier)
    }
  })
})
