import { describe, expect, it } from "vitest"

import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { makeGenerationState } from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { placeRoster } from "./place-roster"

// `placeRoster` is pure — no seams to stub. It places each staged PC token and
// UNIONS its starting Zone into whatever reveal the base already carries (the
// load-bearing property for expedition start, which places AFTER the Region's
// escrowed chart has been re-applied — a replacing write would wipe it).

const zone = (id: string) => ({
  id,
  name: id,
  description: "",
  dmNotes: "",
  position: { x: 0, y: 0 },
  pageId: "default",
})

function baseState(
  zoneIds: string[],
  revealedZoneIds: string[]
): MapInstanceState {
  return {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: Object.fromEntries(zoneIds.map((id) => [id, zone(id)])),
      connections: {},
    },
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds,
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: makeGenerationState(),
    lastMovedTokenKey: null,
  }
}

describe("placeRoster", () => {
  it("unions placement reveals into the base's existing reveal, deduped", async () => {
    // z1 is already revealed (from the escrowed chart) and `charted` is a prior
    // reveal for a Zone off this snapshot; placing onto z1 must not duplicate it.
    const base = baseState(["z1", "z2"], ["z1", "charted"])

    const next = placeRoster(base, [
      { characterId: "char-a", zoneId: "z1" },
      { characterId: "char-b", zoneId: "z2" },
    ])

    // Pre-existing reveals kept, z2 added once, z1 not re-added.
    expect(next.reveal.revealedZoneIds).toEqual(["z1", "charted", "z2"])
    expect(next.occupancy["char-a"]).toEqual({
      zoneId: "z1",
      engagement: { status: "free" },
    })
    expect(next.occupancy["char-b"]).toEqual({
      zoneId: "z2",
      engagement: { status: "free" },
    })
  })

  it("places an off-geometry token but reveals nothing (guides, doesn't block)", async () => {
    const base = baseState(["z1"], [])

    const next = placeRoster(base, [
      { characterId: "char-a", zoneId: "ghost-zone" },
    ])

    // The token lands where asked...
    expect(next.occupancy["char-a"]).toEqual({
      zoneId: "ghost-zone",
      engagement: { status: "free" },
    })
    // ...but nothing is revealed — the Zone isn't in the geometry.
    expect(next.reveal.revealedZoneIds).toEqual([])
  })
})
