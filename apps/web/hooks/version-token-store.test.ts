// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  createMonotonicVersionMap,
  createVersionTokenStore,
  useMonotonicVersionMap,
  useVersionTokenStore,
} from "./version-token-store"

type Class = "identity" | "vitals" | "inventory" | "progression"

const BASELINE: Record<Class, number> = {
  identity: 3,
  vitals: 5,
  inventory: 2,
  progression: 7,
}

describe("createVersionTokenStore", () => {
  describe("forward", () => {
    it("forwards a fresher class and reports it", () => {
      const store = createVersionTokenStore(BASELINE)

      expect(store.forward({ vitals: 6 })).toBe(true)
      expect(store.read("vitals")).toBe(6)
      expect(store.read("identity")).toBe(3)
    })

    it("skips an echo — all pinged classes ≤ local", () => {
      const store = createVersionTokenStore(BASELINE)

      expect(store.forward({ vitals: 5 })).toBe(false)
      expect(store.forward({ vitals: 4, identity: 1 })).toBe(false)
      expect(store.read("vitals")).toBe(5)
    })

    it("handles a multi-class ping where only one class is fresher", () => {
      const store = createVersionTokenStore(BASELINE)

      expect(store.forward({ progression: 8, vitals: 5 })).toBe(true)
      expect(store.read("progression")).toBe(8)
      expect(store.read("vitals")).toBe(5)
    })

    it("ignores junk keys and non-numeric values from the wire", () => {
      const store = createVersionTokenStore(BASELINE)
      const junk = {
        bogus: 99,
        vitals: "6",
        identity: Number.NaN,
        toString: 42,
      } as never

      expect(store.forward(junk)).toBe(false)
      expect(store.read("vitals")).toBe(5)
      expect(store.read("identity")).toBe(3)
    })
  })

  describe("bump", () => {
    it("advances a class to a fresher version", () => {
      const store = createVersionTokenStore(BASELINE)

      store.bump("vitals", 9)
      expect(store.read("vitals")).toBe(9)
    })

    it("is a no-op for a lower or equal version (forward-only)", () => {
      const store = createVersionTokenStore(BASELINE)

      store.bump("vitals", 4)
      store.bump("vitals", 5)
      expect(store.read("vitals")).toBe(5)
    })
  })

  describe("ref", () => {
    it("routes the getter to read and the setter to a forward-only bump", () => {
      const store = createVersionTokenStore(BASELINE)
      const vitalsRef = store.ref("vitals")

      expect(vitalsRef.current).toBe(5)

      vitalsRef.current = 9
      expect(store.read("vitals")).toBe(9)

      vitalsRef.current = 4 // stale frame — must not regress
      expect(store.read("vitals")).toBe(9)
      expect(vitalsRef.current).toBe(9)
    })

    it("returns a stable adapter that stays bound to live store state", () => {
      const store = createVersionTokenStore(BASELINE)

      const first = store.ref("vitals")
      expect(store.ref("vitals")).toBe(first)

      // A write through one reference is visible through another and through read.
      store.bump("vitals", 12)
      expect(first.current).toBe(12)
      expect(store.ref("vitals").current).toBe(12)
    })
  })
})

describe("createMonotonicVersionMap", () => {
  it("reads undefined for a key it has never seen", () => {
    const map = createMonotonicVersionMap<string>()
    expect(map.read("pc-1")).toBeUndefined()
  })

  it("creates an entry on first bump and advances it forward-only", () => {
    const map = createMonotonicVersionMap<string>()

    map.bump("pc-1", 4)
    expect(map.read("pc-1")).toBe(4)

    map.bump("pc-1", 3) // stale — must not regress
    expect(map.read("pc-1")).toBe(4)

    map.bump("pc-1", 9)
    expect(map.read("pc-1")).toBe(9)
  })

  it("tracks keys independently", () => {
    const map = createMonotonicVersionMap<string>()

    map.bump("pc-1", 4)
    map.bump("pc-2", 7)
    expect(map.read("pc-1")).toBe(4)
    expect(map.read("pc-2")).toBe(7)
  })

  describe("ref", () => {
    it("falls back to the seed until the key is first written", () => {
      const map = createMonotonicVersionMap<string>()
      const ref = map.ref("pc-1", 5) // seed = the hydrated prop

      expect(ref.current).toBe(5)
      expect(map.read("pc-1")).toBeUndefined() // a read does not create

      ref.current = 8
      expect(map.read("pc-1")).toBe(8)
      expect(ref.current).toBe(8) // tracked value now wins over the seed
    })

    it("prefers an existing tracked value over the seed", () => {
      const map = createMonotonicVersionMap<string>()
      map.bump("pc-1", 12)

      // A later ref seeded with a lower prop (a stale frame) still reads 12.
      expect(map.ref("pc-1", 6).current).toBe(12)
    })

    it("bumps forward-only through the setter", () => {
      const map = createMonotonicVersionMap<string>()
      const ref = map.ref("pc-1", 5)

      ref.current = 9
      ref.current = 4 // stale frame
      expect(map.read("pc-1")).toBe(9)
    })
  })
})

describe("useVersionTokenStore", () => {
  it("seeds the store from the initial server versions", () => {
    const { result } = renderHook(() => useVersionTokenStore(BASELINE))
    expect(result.current.read("vitals")).toBe(5)
  })

  it("forward-syncs when higher server versions arrive", () => {
    const { result, rerender } = renderHook(
      ({ versions }) => useVersionTokenStore(versions),
      { initialProps: { versions: BASELINE } }
    )

    rerender({ versions: { ...BASELINE, vitals: 8 } })
    expect(result.current.read("vitals")).toBe(8)
  })

  it("never regresses below a token a write already advanced", () => {
    const { result, rerender } = renderHook(
      ({ versions }) => useVersionTokenStore(versions),
      { initialProps: { versions: BASELINE } }
    )

    // A write bumps the token ahead of the prop (the synchronous success path).
    result.current.bump("vitals", 11)

    // A stale render frame re-supplies an older prop — it must not roll back.
    rerender({ versions: { ...BASELINE, vitals: 6 } })
    expect(result.current.read("vitals")).toBe(11)

    // The catch-up prop finally lands and advances past it.
    rerender({ versions: { ...BASELINE, vitals: 14 } })
    expect(result.current.read("vitals")).toBe(14)
  })
})

describe("useMonotonicVersionMap", () => {
  it("returns one map that is stable across renders", () => {
    const { result, rerender } = renderHook(() =>
      useMonotonicVersionMap<string>()
    )
    const first = result.current
    first.bump("pc-1", 4)

    rerender()
    expect(result.current).toBe(first)
    expect(result.current.read("pc-1")).toBe(4)
  })
})
