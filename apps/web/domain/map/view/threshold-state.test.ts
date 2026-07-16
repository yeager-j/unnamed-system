import { describe, expect, it } from "vitest"

import { thresholdStateOf } from "./threshold-state"

describe("thresholdStateOf", () => {
  it("maps a revealed connection to an open border", () => {
    expect(
      thresholdStateOf({ fog: "revealed", hidden: false, locked: false })
    ).toEqual({
      border: "open",
      locked: false,
    })
  })

  it("maps a hidden, unrevealed connection to a secret border (DM-only by redaction)", () => {
    expect(
      thresholdStateOf({ fog: "stripped", hidden: true, locked: false })
    ).toEqual({
      border: "secret",
      locked: false,
    })
    expect(
      thresholdStateOf({ fog: "known-exit", hidden: true, locked: false })
        .border
    ).toBe("secret")
  })

  it("maps a non-hidden, unrevealed connection to an unmapped border", () => {
    expect(
      thresholdStateOf({ fog: "stripped", hidden: false, locked: false }).border
    ).toBe("unmapped")
    expect(
      thresholdStateOf({ fog: "known-exit", hidden: false, locked: false })
        .border
    ).toBe("unmapped")
  })

  it("composes locked onto any border, including a locked secret door", () => {
    expect(
      thresholdStateOf({ fog: "revealed", hidden: false, locked: true })
    ).toEqual({
      border: "open",
      locked: true,
    })
    expect(
      thresholdStateOf({ fog: "stripped", hidden: true, locked: true })
    ).toEqual({
      border: "secret",
      locked: true,
    })
  })
})
