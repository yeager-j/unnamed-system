import { describe, expect, it } from "vitest"

import { luminaCapFor, pathOfDawn } from "./path-of-dawn"

describe("path of dawn", () => {
  it("starts with Dawn Mode off and no enemies", () => {
    expect(pathOfDawn.initialState()).toEqual({
      kind: "path-of-dawn",
      dawnMode: false,
      enemies: [],
    })
  })

  it("emits no Effects in MVP (no `effects` method)", () => {
    expect(pathOfDawn.effects).toBeUndefined()
  })

  it("reports a Lumina cap equal to the character's Luck", () => {
    expect(luminaCapFor(3)).toBe(3)
  })

  it("floors a negative Luck score to a 0 cap", () => {
    expect(luminaCapFor(-2)).toBe(0)
  })
})
