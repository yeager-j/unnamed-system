import { describe, expect, it } from "vitest"

import { makeGeometry, makeZone } from "./__fixtures__/spatial"
import { emptyMapInstance, mapInstanceFromGeometry } from "./instance-factory"

describe("emptyMapInstance", () => {
  it("mints a blank instance with empty runtime", () => {
    expect(emptyMapInstance()).toEqual({
      geometry: { zones: {}, connections: {} },
      occupancy: {},
      enchantment: null,
      reveal: {
        revealedZoneIds: [],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    })
  })
})

describe("mapInstanceFromGeometry", () => {
  it("snapshots the geometry with empty runtime", () => {
    const geometry = makeGeometry([makeZone("a")])
    const instance = mapInstanceFromGeometry(geometry)
    expect(instance.geometry).toEqual(geometry)
    expect(instance.occupancy).toEqual({})
    expect(instance.enchantment).toBeNull()
    expect(instance.reveal.revealedZoneIds).toEqual([])
  })

  it("copies the geometry so template edits never reach the run", () => {
    const geometry = makeGeometry([makeZone("a", { name: "Before" })])
    const instance = mapInstanceFromGeometry(geometry)
    geometry.zones["a"]!.name = "After"
    expect(instance.geometry.zones["a"]?.name).toBe("Before")
  })
})
