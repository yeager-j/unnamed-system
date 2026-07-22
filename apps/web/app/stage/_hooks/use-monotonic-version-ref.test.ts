// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useMonotonicVersionRef } from "./use-monotonic-version-ref"

describe("useMonotonicVersionRef", () => {
  it("seeds the ref from the initial server version", () => {
    const { result } = renderHook(() => useMonotonicVersionRef(3))
    expect(result.current.current).toBe(3)
  })

  it("advances the ref when a higher server version arrives", () => {
    const { result, rerender } = renderHook(
      ({ version }) => useMonotonicVersionRef(version),
      { initialProps: { version: 3 } }
    )

    rerender({ version: 7 })
    expect(result.current.current).toBe(7)
  })

  it("never regresses below a token a write already advanced", () => {
    const { result, rerender } = renderHook(
      ({ version }) => useMonotonicVersionRef(version),
      { initialProps: { version: 3 } }
    )

    // A write bumps the ref ahead of the prop (the synchronous success path).
    result.current.current = 9

    // A stale render frame (a `router.refresh()` still in flight) re-supplies an
    // older prop — it must not roll the ref back.
    rerender({ version: 4 })
    expect(result.current.current).toBe(9)

    // The catch-up prop finally lands and advances past it.
    rerender({ version: 12 })
    expect(result.current.current).toBe(12)
  })
})
