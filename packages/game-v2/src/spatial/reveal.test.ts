import { describe, expect, it } from "vitest"

import { makeConnection, makeMapInstanceState } from "./__fixtures__/spatial"
import type { RevealState } from "./map-instance.schema"
import {
  connectionFogState,
  isConnectionLocked,
  isConnectionSurfaced,
  isFogActive,
  isZoneRevealed,
  resolveRevealView,
} from "./reveal"

const reveal = (overrides: Partial<RevealState> = {}): RevealState => ({
  revealedZoneIds: [],
  revealedConnectionIds: [],
  unlockedConnectionIds: [],
  ...overrides,
})

describe("reveal derivations (the fog overlay, §2.7)", () => {
  describe("isFogActive", () => {
    it("is true once any zone is revealed (a delve is running)", () => {
      expect(isFogActive(reveal({ revealedZoneIds: ["z1"] }))).toBe(true)
    })

    it("is false for an empty reveal (a standalone encounter shows the full map)", () => {
      expect(isFogActive(reveal())).toBe(false)
    })
  })

  describe("isZoneRevealed", () => {
    it("reflects membership in revealedZoneIds", () => {
      const r = reveal({ revealedZoneIds: ["z1"] })
      expect(isZoneRevealed(r, "z1")).toBe(true)
      expect(isZoneRevealed(r, "z2")).toBe(false)
    })
  })

  describe("isConnectionSurfaced (the authored hidden-secret gate)", () => {
    it("always surfaces a non-hidden connection", () => {
      expect(
        isConnectionSurfaced(makeConnection("c1", "z1", "z2"), reveal())
      ).toBe(true)
    })

    it("hides an unsurfaced hidden connection, surfaces a DM-revealed one", () => {
      const conn = makeConnection("c1", "z1", "z2", { hidden: true })
      expect(isConnectionSurfaced(conn, reveal())).toBe(false)
      expect(
        isConnectionSurfaced(conn, reveal({ revealedConnectionIds: ["c1"] }))
      ).toBe(true)
    })
  })

  describe("isConnectionLocked", () => {
    it("is locked when authored locked and not runtime-unlocked", () => {
      const conn = makeConnection("c1", "z1", "z2", { locked: true })
      expect(isConnectionLocked(conn, reveal())).toBe(true)
    })

    it("is unlocked once the DM opens it at runtime", () => {
      const conn = makeConnection("c1", "z1", "z2", { locked: true })
      expect(
        isConnectionLocked(conn, reveal({ unlockedConnectionIds: ["c1"] }))
      ).toBe(false)
    })

    it("is never locked when authored unlocked", () => {
      expect(
        isConnectionLocked(makeConnection("c1", "z1", "z2"), reveal())
      ).toBe(false)
    })
  })

  describe("connectionFogState (the three-state derivation)", () => {
    it("is revealed when both endpoints are revealed", () => {
      const conn = makeConnection("c1", "z1", "z2")
      expect(
        connectionFogState(conn, reveal({ revealedZoneIds: ["z1", "z2"] }))
      ).toBe("revealed")
    })

    it("is known-exit when exactly one endpoint is revealed", () => {
      const conn = makeConnection("c1", "z1", "z2")
      expect(
        connectionFogState(conn, reveal({ revealedZoneIds: ["z1"] }))
      ).toBe("known-exit")
    })

    it("is stripped when neither endpoint is revealed", () => {
      const conn = makeConnection("c1", "z1", "z2")
      expect(
        connectionFogState(conn, reveal({ revealedZoneIds: ["z9"] }))
      ).toBe("stripped")
    })

    it("is stripped for a hidden connection the DM has not surfaced, even with a revealed endpoint", () => {
      const conn = makeConnection("c1", "z1", "z2", { hidden: true })
      expect(
        connectionFogState(conn, reveal({ revealedZoneIds: ["z1"] }))
      ).toBe("stripped")
    })

    it("surfaces a hidden connection once the DM reveals it", () => {
      const conn = makeConnection("c1", "z1", "z2", { hidden: true })
      expect(
        connectionFogState(
          conn,
          reveal({ revealedZoneIds: ["z1"], revealedConnectionIds: ["c1"] })
        )
      ).toBe("known-exit")
    })
  })

  describe("resolveRevealView", () => {
    it("pairs each connection with its fog state + effective-locked flag", () => {
      const mapInstance = makeMapInstanceState({
        geometry: {
          zones: {},
          connections: {
            c1: makeConnection("c1", "z1", "z2", { locked: true }),
          },
        },
        reveal: reveal({ revealedZoneIds: ["z1", "z2"] }),
      })
      const view = resolveRevealView(mapInstance)
      expect(view.revealedZoneIds).toEqual(["z1", "z2"])
      expect(view.connections).toEqual([
        {
          connection: makeConnection("c1", "z1", "z2", { locked: true }),
          state: "revealed",
          locked: true,
        },
      ])
    })
  })
})
