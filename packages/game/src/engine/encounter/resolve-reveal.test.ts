import { describe, expect, it } from "vitest"

import {
  makeConnection,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game/engine/__fixtures__/encounter"
import {
  connectionFogState,
  isConnectionLocked,
  isZoneRevealed,
  resolveRevealView,
} from "@workspace/game/engine/encounter/resolve-reveal"
import type { RevealState } from "@workspace/game/foundation/encounter/map-instance"

const reveal = (overrides: Partial<RevealState> = {}): RevealState => ({
  revealedZoneIds: [],
  revealedConnectionIds: [],
  unlockedConnectionIds: [],
  ...overrides,
})

describe("isZoneRevealed", () => {
  it("is true only for a zone in revealedZoneIds", () => {
    const state = reveal({ revealedZoneIds: ["zone-a"] })
    expect(isZoneRevealed(state, "zone-a")).toBe(true)
    expect(isZoneRevealed(state, "zone-b")).toBe(false)
  })
})

describe("isConnectionLocked", () => {
  it("is the authored locked flag unless the connection is unlocked at runtime", () => {
    const locked = makeConnection("c", "a", "b", { locked: true })
    expect(isConnectionLocked(locked, reveal())).toBe(true)
    expect(
      isConnectionLocked(locked, reveal({ unlockedConnectionIds: ["c"] }))
    ).toBe(false)
  })

  it("an un-locked connection is never locked, unlock overlay or not", () => {
    const open = makeConnection("c", "a", "b", { locked: false })
    expect(isConnectionLocked(open, reveal())).toBe(false)
  })
})

describe("connectionFogState", () => {
  const conn = (overrides = {}) => makeConnection("c", "a", "b", overrides)

  it("revealed when both endpoints are revealed", () => {
    const state = reveal({ revealedZoneIds: ["a", "b"] })
    expect(connectionFogState(conn(), state)).toBe("revealed")
  })

  it("known-exit (silhouette) when exactly one endpoint is revealed", () => {
    expect(connectionFogState(conn(), reveal({ revealedZoneIds: ["a"] }))).toBe(
      "known-exit"
    )
  })

  it("stripped when neither endpoint is revealed", () => {
    expect(connectionFogState(conn(), reveal())).toBe("stripped")
  })

  it("a hidden connection is stripped even with a revealed endpoint until revealed", () => {
    const hidden = conn({ hidden: true })
    expect(connectionFogState(hidden, reveal({ revealedZoneIds: ["a"] }))).toBe(
      "stripped"
    )
    expect(
      connectionFogState(
        hidden,
        reveal({ revealedZoneIds: ["a"], revealedConnectionIds: ["c"] })
      )
    ).toBe("known-exit")
  })
})

describe("resolveRevealView", () => {
  it("derives the per-zone reveal set and per-connection fog + effective lock", () => {
    const instance = makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("a"), makeZone("b")],
        [makeConnection("c", "a", "b", { locked: true })]
      ),
      reveal: reveal({ revealedZoneIds: ["a"], unlockedConnectionIds: ["c"] }),
    })

    const view = resolveRevealView(instance)

    expect(view.revealedZoneIds).toEqual(["a"])
    expect(view.connections).toEqual([
      {
        connection: instance.geometry.connections["c"],
        state: "known-exit",
        locked: false,
      },
    ])
  })
})
