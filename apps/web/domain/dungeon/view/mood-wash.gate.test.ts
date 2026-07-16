import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The equal-luminance / equal-mix constraint on the zone mood washes, promoted from
 * a normative comment to a build gate (Dungeon Visual Overhaul §D6; Code Style #8).
 *
 * One fact per channel: mood carries only the room's *light* (hue). Occupancy is the
 * sole channel allowed to move a card's brightness, so every wash must share the
 * fixed luminance **L 0.62** and mix into `--card` at the fixed **13%**. This reads
 * the ui package's `globals.css` as text and fails on any luminance or mix-ratio
 * drift — adding a fourth hue stays legal; changing brightness is a red build.
 */

const GLOBALS_CSS = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../../packages/ui/src/styles/globals.css",
      import.meta.url
    )
  ),
  "utf8"
)

describe("mood-wash channel gate (§D6)", () => {
  const washes = [
    ...GLOBALS_CSS.matchAll(/--mood-wash-(\w+):\s*oklch\(\s*([\d.]+)\s+/g),
  ]
  const mixes = [
    ...GLOBALS_CSS.matchAll(
      /--mood-(\w+):\s*color-mix\(in oklab, var\(--card\), var\(--mood-wash-\w+\) (\d+)%\)/g
    ),
  ]

  it("defines all three wash hues plus their mixes", () => {
    expect(washes.map((m) => m[1]).sort()).toEqual(["cool", "dim", "warm"])
    expect(mixes.map((m) => m[1]).sort()).toEqual(["cool", "dim", "warm"])
  })

  it("pins every wash to luminance 0.62 (only occupancy moves brightness)", () => {
    for (const [, name, lightness] of washes) {
      expect(lightness, `--mood-wash-${name} luminance`).toBe("0.62")
    }
  })

  it("pins every mood mix to exactly 13%", () => {
    for (const [, name, ratio] of mixes) {
      expect(ratio, `--mood-${name} mix ratio`).toBe("13")
    }
  })
})
