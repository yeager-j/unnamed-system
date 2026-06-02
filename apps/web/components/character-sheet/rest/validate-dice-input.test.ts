import { describe, expect, it } from "vitest"

import { validateDiceInput } from "./validate-dice-input"

describe("validateDiceInput", () => {
  it("parses a valid in-range integer", () => {
    expect(validateDiceInput("3", 5)).toEqual({ value: 3, invalid: false })
  })

  it("flags a value above the max", () => {
    expect(validateDiceInput("6", 5)).toEqual({ value: 6, invalid: true })
  })

  it("flags a negative value", () => {
    expect(validateDiceInput("-1", 5)).toEqual({ value: -1, invalid: true })
  })

  it("flags non-numeric input as invalid", () => {
    expect(validateDiceInput("", 5).invalid).toBe(true)
    expect(validateDiceInput("abc", 5).invalid).toBe(true)
  })

  it("accepts any non-negative value when no max is given", () => {
    expect(validateDiceInput("999")).toEqual({ value: 999, invalid: false })
    expect(validateDiceInput("0")).toEqual({ value: 0, invalid: false })
  })
})
