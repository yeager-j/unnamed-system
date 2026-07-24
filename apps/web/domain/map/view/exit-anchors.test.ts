import { describe, expect, it } from "vitest"

import type { GenerationStub } from "@workspace/game-v2/spatial"
import {
  makeConnection,
  makeGenerationState,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { dungeonExitAnchors } from "./exit-anchors"

/**
 * Loader-side anchor derivation (UNN-633) + the UNN-590 extension: generation
 * stubs join the same pass with their stored anchors and participate in the
 * shared coincidence nudge — one path for authored exits and stubs alike is
 * what keeps them indistinguishable on the wire.
 */

const stub = (
  id: string,
  zoneId: string,
  anchor: GenerationStub["anchor"]
): GenerationStub => ({ id, zoneId, bearing: 0, anchor })

describe("dungeonExitAnchors — stubs (UNN-590)", () => {
  it("emits a revealed parent's stub with its stored anchor, keyed by stub id", () => {
    const instance = makeMapInstanceState({
      geometry: makeGeometry([makeZone("z1")]),
      reveal: {
        revealedZoneIds: ["z1"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
      generation: makeGenerationState({
        stubs: { "stub-1": stub("stub-1", "z1", { side: "e", offset: 0.4 }) },
      }),
    })

    expect(dungeonExitAnchors(instance)).toEqual({
      "stub-1": { side: "e", offset: 0.4 },
    })
  })

  it("skips a stub on an unrevealed parent", () => {
    const instance = makeMapInstanceState({
      geometry: makeGeometry([makeZone("z1")]),
      generation: makeGenerationState({
        stubs: { "stub-1": stub("stub-1", "z1", { side: "e", offset: 0.4 }) },
      }),
    })

    expect(dungeonExitAnchors(instance)).toEqual({})
  })

  it("spreads a stub coincident with an authored known-exit — the shared nudge path", () => {
    // z1 (revealed, at origin) has an authored known-exit east to unrevealed z2;
    // the two M rects share a y-band, so the derived authored anchor is
    // {e, 0.5}. A stub stored at the identical slot must spread off it, both
    // nudged symmetrically, in id order (c1 < stub-1).
    const instance = makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("z1"), makeZone("z2", { position: { x: 600, y: 0 } })],
        [makeConnection("c1", "z1", "z2")]
      ),
      reveal: {
        revealedZoneIds: ["z1"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
      generation: makeGenerationState({
        stubs: { "stub-1": stub("stub-1", "z1", { side: "e", offset: 0.5 }) },
      }),
    })

    const anchors = dungeonExitAnchors(instance)
    expect(anchors["c1"]!.side).toBe("e")
    expect(anchors["stub-1"]!.side).toBe("e")
    expect(anchors["c1"]!.offset).toBeLessThan(0.5)
    expect(anchors["stub-1"]!.offset).toBeGreaterThan(0.5)
    expect(anchors["stub-1"]!.offset - anchors["c1"]!.offset).toBeCloseTo(
      32 / 192, // one notch-length over the M rect's east wall height
      5
    )
  })

  it("leaves distinct offsets untouched", () => {
    const instance = makeMapInstanceState({
      geometry: makeGeometry([makeZone("z1")]),
      reveal: {
        revealedZoneIds: ["z1"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
      generation: makeGenerationState({
        stubs: {
          "stub-1": stub("stub-1", "z1", { side: "e", offset: 0.25 }),
          "stub-2": stub("stub-2", "z1", { side: "e", offset: 0.75 }),
        },
      }),
    })

    expect(dungeonExitAnchors(instance)).toEqual({
      "stub-1": { side: "e", offset: 0.25 },
      "stub-2": { side: "e", offset: 0.75 },
    })
  })
})
