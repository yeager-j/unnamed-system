// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  createMonotonicVersionMap,
  useMonotonicVersionMap,
} from "./version-token-store"

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
