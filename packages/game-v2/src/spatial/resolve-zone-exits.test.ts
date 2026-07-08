import { describe, expect, it } from "vitest"

import {
  makeConnection,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "./__fixtures__/spatial"
import { resolveZoneExits } from "./resolve-zone-exits"

const instance = (overrides: Parameters<typeof makeMapInstanceState>[0] = {}) =>
  makeMapInstanceState({
    geometry: makeGeometry(
      [
        makeZone("entry", { name: "Entry" }),
        makeZone("hall", { name: "Hall" }),
        makeZone("crypt", { name: "Crypt" }),
      ],
      [
        makeConnection("entry-hall", "entry", "hall"),
        makeConnection("hall-crypt", "hall", "crypt", {
          hidden: true,
          locked: true,
        }),
      ]
    ),
    ...overrides,
  })

describe("resolveZoneExits", () => {
  it("pairs each touching connection with its far endpoint, either direction", () => {
    const exits = resolveZoneExits(instance(), "hall")
    expect(
      exits.map((exit) => [exit.connection.id, exit.neighborName])
    ).toEqual([
      ["entry-hall", "Entry"],
      ["hall-crypt", "Crypt"],
    ])
  })

  it("returns no exits for a zone with no touching connections", () => {
    expect(resolveZoneExits(instance(), "nowhere")).toEqual([])
  })

  it("falls back to Unknown for a dangling connection", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("a")],
        [makeConnection("a-ghost", "a", "ghost")]
      ),
    })
    expect(resolveZoneExits(state, "a")[0]?.neighborName).toBe("Unknown")
  })

  it("derives reveal, fog, and lock flags from the overlay", () => {
    const state = instance({
      reveal: {
        revealedZoneIds: ["entry"],
        revealedConnectionIds: ["entry-hall"],
        unlockedConnectionIds: [],
      },
    })
    const [toEntry, toCrypt] = resolveZoneExits(state, "hall")
    expect(toEntry).toMatchObject({
      neighborRevealed: true,
      hiddenFromPlayers: false,
      locked: false,
    })
    expect(toCrypt).toMatchObject({
      neighborRevealed: false,
      hiddenFromPlayers: true,
      locked: true,
    })
  })

  it("treats an unlocked connection as no longer locked", () => {
    const state = instance({
      reveal: {
        revealedZoneIds: [],
        revealedConnectionIds: [],
        unlockedConnectionIds: ["hall-crypt"],
      },
    })
    const toCrypt = resolveZoneExits(state, "crypt")[0]
    expect(toCrypt?.locked).toBe(false)
  })
})
