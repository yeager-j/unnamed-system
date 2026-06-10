import { describe, expect, it } from "vitest"

import { decidePcPing } from "./pc-ping"

describe("decidePcPing", () => {
  it("refreshes and forwards on a fresher vitals version", () => {
    expect(decidePcPing({ vitals: 8 }, 7)).toEqual({
      nextVitals: 8,
      refresh: true,
    })
  })

  it("skips a vitals echo (≤ the tracked version)", () => {
    expect(decidePcPing({ vitals: 7 }, 7)).toEqual({ refresh: false })
    expect(decidePcPing({ vitals: 3 }, 7)).toEqual({ refresh: false })
  })

  it("refreshes unconditionally on a non-vitals class", () => {
    expect(decidePcPing({ inventory: 2 }, 7)).toEqual({ refresh: true })
    expect(decidePcPing({ identity: 1, vitals: 7 }, 7)).toEqual({
      refresh: true,
    })
  })

  it("refreshes when the PC's vitals version is not yet tracked", () => {
    expect(decidePcPing({ vitals: 1 }, undefined)).toEqual({
      nextVitals: 1,
      refresh: true,
    })
  })

  it("ignores junk keys and non-numeric values", () => {
    expect(decidePcPing({ bogus: 99, vitals: "8" } as never, 7)).toEqual({
      refresh: false,
    })
    expect(decidePcPing({ inventory: Number.NaN }, 7)).toEqual({
      refresh: false,
    })
  })
})
